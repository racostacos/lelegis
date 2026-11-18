import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseFloorRollCallText, resolveVoteLabel } from '../src/lib/floor-rollcall-parser.js';
import { canonicalLouisianaDocumentUrl } from '../src/lib/louisiana-document-url.js';
import { runD1Json } from '../src/lib/d1-cli.js';

const args = process.argv.slice(2);
const INSTRUMENT = args.find(a => a.startsWith('--bill='))?.split('=')[1]?.toUpperCase() ?? null;
const DRY_RUN = args.includes('--dry-run');
const MISSING_ONLY = args.includes('--missing-only');

const sqlString = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;

function runSqlFile(sql) {
  const dir = mkdtempSync(join(tmpdir(), 'lelegis-floor-votes-'));
  const file = join(dir, 'floor-votes.sql');

  try {
    writeFileSync(file, sql, 'utf8');
    const r = spawnSync(
      'npx',
      ['wrangler','d1','execute','lelegis','--remote',`--file=${file}`],
      { stdio:'inherit', shell:process.platform === 'win32' }
    );
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error(`wrangler exited ${r.status}`);
  } finally {
    rmSync(dir, {recursive:true, force:true});
  }
}

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
      const s = String(item.str ?? '').trim();
      if (s) lines.push(s);
    }
  }
  return lines.join('\n');
}

function targetEvents() {
  const billFilter = INSTRUMENT
    ? `AND b.instrument = '${INSTRUMENT.replaceAll("'", "''")}'`
    : '';

  const missingFilter = MISSING_ONLY
    ? `AND NOT EXISTS (
         SELECT 1 FROM legislator_votes lv WHERE lv.vote_event_id = ve.id
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

function sessionLegislators(sessionId, chamber) {
  const membershipRows = runD1Json(
    `SELECT DISTINCT l.id, l.first_name, l.last_name, l.display_name,
            l.chamber, lm.district_number, l.source_member_id
       FROM legislator_memberships lm
       JOIN legislators l ON l.id = lm.legislator_id
      WHERE lm.session_id = ${Number(sessionId)}
        AND lm.chamber = '${chamber.replaceAll("'", "''")}'
      ORDER BY lm.start_date ASC, l.id ASC`
  );

  if (membershipRows.length) return membershipRows;

  return runD1Json(
    `SELECT id, first_name, last_name, display_name, chamber,
            district_number, source_member_id
       FROM legislators
      WHERE chamber = '${chamber.replaceAll("'", "''")}'
      ORDER BY is_active DESC, district_number ASC`
  );
}

function aliases(sessionId, chamber) {
  return runD1Json(
    `SELECT a.vote_label, l.id AS legislator_id
       FROM legislator_vote_aliases a
       JOIN legislators l ON l.id = a.legislator_id
      WHERE a.session_id = ${Number(sessionId)}
        AND a.chamber = '${chamber.replaceAll("'", "''")}'`
  );
}

function aliasMatch(rows, label) {
  const key = String(label).trim().toLowerCase();
  return rows.find(x => String(x.vote_label).trim().toLowerCase() === key) ?? null;
}

async function main() {
  const events = targetEvents();
  console.log(`Floor vote documents to inspect: ${events.length}`);

  for (const event of events) {
    const text = await extractPdfText(event.source_url);
    const parsed = parseFloorRollCallText(text);

    if (!parsed.sequence_number || !parsed.members.length) {
      throw new Error(`Could not parse ${event.source_url}`);
    }

    const roster = sessionLegislators(event.session_id, event.chamber);
    const aliasRows = aliases(event.session_id, event.chamber);
    const resolved = [];
    const unresolved = [];

    for (const member of parsed.members) {
      const alias = aliasMatch(aliasRows, member.label);
      if (alias) {
        resolved.push({legislator_id:alias.legislator_id, vote:member.vote, label:member.label});
        continue;
      }

      const result = resolveVoteLabel(roster, member.label);
      if (result.match) {
        resolved.push({legislator_id:result.match.id, vote:member.vote, label:member.label});
      } else {
        unresolved.push({label:member.label, vote:member.vote, reason:result.reason});
      }
    }

    console.log(`${event.instrument} #${parsed.sequence_number}: ${resolved.length} resolved, ${unresolved.length} unresolved`);
    if (unresolved.length) console.table(unresolved);

    if (DRY_RUN) continue;

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
      sql.push(`INSERT INTO legislator_votes (vote_event_id, legislator_id, vote)
VALUES (${Number(event.id)}, ${Number(row.legislator_id)}, ${sqlString(row.vote)});`);
    }

    runSqlFile(sql.join('\n\n'));
  }
}

main().catch(error => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
