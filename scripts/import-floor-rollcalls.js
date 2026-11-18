
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseFloorRollCallText, resolveVoteLabel } from '../src/lib/floor-rollcall-parser.js';
import { canonicalLouisianaDocumentUrl } from '../src/lib/louisiana-document-url.js';
import { runD1Json, runD1SqlFile, sqlString } from '../src/lib/d1-cli.js';

const args = process.argv.slice(2);
const INSTRUMENT = args.find(a => a.startsWith('--bill='))?.split('=')[1]?.toUpperCase() ?? null;
const DRY_RUN = args.includes('--dry-run');
const MISSING_ONLY = args.includes('--missing-only');

const BATCH_SIZE = Math.max(
  1,
  Number(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] ?? 30)
);

const CONCURRENCY = Math.max(
  1,
  Math.min(
    12,
    Number(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] ?? 6)
  )
);

const rosterCache = new Map();
const aliasCache = new Map();

async function extractPdfText(storedUrl) {
  const url = canonicalLouisianaDocumentUrl(storedUrl);
  const r = await fetch(url, {
    headers:{
      'user-agent':'LeLegis/0.1 (+https://legis.le-comrade.org)',
      accept:'application/pdf'
    }
  });

  if (!r.ok) throw new Error(`${url} returned HTTP ${r.status}`);

  const pdf = await getDocument({
    data:new Uint8Array(await r.arrayBuffer()),
    useWorkerFetch:false,
    isEvalSupported:false
  }).promise;

  const lines = [];

  for (let n=1;n<=pdf.numPages;n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();

    for (const item of content.items) {
      const value = String(item.str ?? '').trim();
      if (value) lines.push(value);
    }
  }

  return lines.join('\n');
}

function targetEvents() {
  const billFilter = INSTRUMENT
    ? `AND b.instrument = ${sqlString(INSTRUMENT)}`
    : '';

  const missingFilter = MISSING_ONLY
    ? `AND NOT EXISTS (
         SELECT 1
           FROM legislator_votes lv
          WHERE lv.vote_event_id = ve.id
       )`
    : '';

  return runD1Json(
    `SELECT ve.id, ve.chamber, ve.sequence_number, ve.source_url,
            b.instrument, b.session_id
       FROM vote_events ve
       JOIN bills b ON b.id = ve.bill_id
      WHERE ve.event_type = 'FLOOR'
        AND ve.source_url LIKE '%ViewDocument.aspx?d=%'
        ${billFilter}
        ${missingFilter}
      ORDER BY b.id, ve.id`
  );
}

function cacheKey(sessionId, chamber) {
  return `${Number(sessionId)}:${String(chamber).toUpperCase()}`;
}

function sessionLegislators(sessionId, chamber) {
  const key = cacheKey(sessionId, chamber);
  if (rosterCache.has(key)) return rosterCache.get(key);

  let rows = runD1Json(
    `SELECT DISTINCT l.id, l.first_name, l.last_name, l.display_name,
            l.chamber, lm.district_number, l.source_member_id
       FROM legislator_memberships lm
       JOIN legislators l ON l.id = lm.legislator_id
      WHERE lm.session_id = ${Number(sessionId)}
        AND lm.chamber = ${sqlString(chamber)}
      ORDER BY lm.start_date ASC, l.id ASC`
  );

  if (!rows.length) {
    rows = runD1Json(
      `SELECT id, first_name, last_name, display_name, chamber,
              district_number, source_member_id
         FROM legislators
        WHERE chamber = ${sqlString(chamber)}
        ORDER BY is_active DESC, district_number ASC`
    );
  }

  rosterCache.set(key, rows);
  return rows;
}

function aliases(sessionId, chamber) {
  const key = cacheKey(sessionId, chamber);
  if (aliasCache.has(key)) return aliasCache.get(key);

  const rows = runD1Json(
    `SELECT a.vote_label, l.id AS legislator_id
       FROM legislator_vote_aliases a
       JOIN legislators l ON l.id = a.legislator_id
      WHERE a.session_id = ${Number(sessionId)}
        AND a.chamber = ${sqlString(chamber)}`
  );

  const map = new Map(
    rows.map(row => [
      String(row.vote_label).trim().toLowerCase(),
      Number(row.legislator_id)
    ])
  );

  aliasCache.set(key, map);
  return map;
}

function sqlForParsedEvent(event, parsed, resolved) {
  const sql = [
    `DELETE FROM legislator_votes WHERE vote_event_id = ${Number(event.id)};`,
    `UPDATE vote_events SET
       vote_date = COALESCE(vote_date, ${sqlString(parsed.vote_date)}),
       vote_time = COALESCE(vote_time, ${sqlString(parsed.vote_time)}),
       yea_total = COALESCE(yea_total, ${parsed.totals.YEA ?? 'NULL'}),
       nay_total = COALESCE(nay_total, ${parsed.totals.NAY ?? 'NULL'}),
       absent_total = COALESCE(absent_total, ${parsed.totals.ABSENT ?? 'NULL'})
     WHERE id = ${Number(event.id)};`
  ];

  for (const row of resolved) {
    sql.push(
      `INSERT INTO legislator_votes (vote_event_id, legislator_id, vote)
VALUES (${Number(event.id)}, ${Number(row.legislator_id)}, ${sqlString(row.vote)});`
    );
  }

  return sql.join('\n\n');
}

async function parseEvent(event) {
  const text = await extractPdfText(event.source_url);
  const parsed = parseFloorRollCallText(text);

  if (!parsed.sequence_number || !parsed.members.length) {
    throw new Error(`Could not parse ${event.source_url}`);
  }

  const roster = sessionLegislators(event.session_id, event.chamber);
  const aliasMap = aliases(event.session_id, event.chamber);

  const resolved = [];
  const unresolved = [];

  for (const member of parsed.members) {
    const key = String(member.label).trim().toLowerCase();
    const aliasLegislatorId = aliasMap.get(key);

    if (aliasLegislatorId) {
      resolved.push({
        legislator_id:aliasLegislatorId,
        vote:member.vote,
        label:member.label
      });
      continue;
    }

    const result = resolveVoteLabel(roster, member.label);

    if (result.match) {
      resolved.push({
        legislator_id:result.match.id,
        vote:member.vote,
        label:member.label
      });
    } else {
      unresolved.push({
        label:member.label,
        vote:member.vote,
        reason:result.reason
      });
    }
  }

  return { event, parsed, resolved, unresolved };
}

async function parseBatch(events) {
  const queue = [...events];
  const successful = [];
  const failures = [];

  async function worker() {
    while (queue.length) {
      const event = queue.shift();

      try {
        const result = await parseEvent(event);

        console.log(
          `${event.instrument} #${result.parsed.sequence_number}: ` +
          `${result.resolved.length} resolved, ${result.unresolved.length} unresolved`
        );

        if (result.unresolved.length) {
          console.table(result.unresolved);
          failures.push({
            event,
            error:`${result.unresolved.length} unresolved legislator vote label(s)`
          });
          continue;
        }

        successful.push(result);
      } catch (error) {
        failures.push({
          event,
          error:String(error?.message ?? error)
        });

        console.error(
          `${event.instrument} ${event.source_url}: ${String(error?.message ?? error)}`
        );
      }
    }
  }

  await Promise.all(
    Array.from(
      {length:Math.min(CONCURRENCY, Math.max(1, events.length))},
      () => worker()
    )
  );

  return { successful, failures };
}

async function main() {
  const events = targetEvents();

  console.log(`Floor vote documents to inspect: ${events.length}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`PDF concurrency: ${CONCURRENCY}`);

  if (!events.length) {
    console.log('No floor votes need importing.');
    return;
  }

  // Warm the two caches once per session/chamber instead of querying D1 for every vote.
  const pairs = new Map();

  for (const event of events) {
    pairs.set(cacheKey(event.session_id, event.chamber), event);
  }

  for (const event of pairs.values()) {
    sessionLegislators(event.session_id, event.chamber);
    aliases(event.session_id, event.chamber);
  }

  let imported = 0;
  let failed = 0;

  for (let offset=0; offset<events.length; offset+=BATCH_SIZE) {
    const batch = events.slice(offset, offset+BATCH_SIZE);
    const number = Math.floor(offset/BATCH_SIZE)+1;
    const totalBatches = Math.ceil(events.length/BATCH_SIZE);

    console.log('');
    console.log(
      `Parsing batch ${number}/${totalBatches} ` +
      `(${offset+1}-${offset+batch.length} of ${events.length})...`
    );

    const { successful, failures } = await parseBatch(batch);
    failed += failures.length;

    if (DRY_RUN) {
      imported += successful.length;
      continue;
    }

    if (successful.length) {
      const sql = successful
        .map(({event,parsed,resolved}) => sqlForParsedEvent(event,parsed,resolved))
        .join('\n\n');

      console.log(
        `Writing ${successful.length} roll call(s) to D1 in one batch...`
      );

      runD1SqlFile(sql, 'lelegis-floor-votes-batch-');
      imported += successful.length;
    }

    console.log(
      `Progress: ${Math.min(offset+batch.length,events.length)}/${events.length} inspected, ` +
      `${imported} imported, ${failed} failed`
    );
  }

  console.log('');
  console.log(
    `Floor vote import complete: ${imported} imported, ${failed} failed.`
  );

  if (failed) {
    console.log(
      'Re-run with --missing-only to retry only events that still have no member votes.'
    );
  }
}

main().catch(error => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
