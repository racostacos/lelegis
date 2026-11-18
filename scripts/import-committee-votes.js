import { runD1Json, runD1SqlFile, sqlString } from '../src/lib/d1-cli.js';
import { canonicalLouisianaDocumentUrl } from '../src/lib/louisiana-document-url.js';
import { parseCommitteeVotePage, resolveCommitteeMember } from '../src/lib/committee-vote-parser.js';

const args = process.argv.slice(2);
const INSTRUMENT = args.find(a => a.startsWith('--bill='))?.split('=')[1]?.toUpperCase() ?? null;
const DRY_RUN = args.includes('--dry-run');
const MISSING_ONLY = args.includes('--missing-only');

function targetSources() {
  const billFilter = INSTRUMENT
    ? `AND b.instrument = ${sqlString(INSTRUMENT)}`
    : '';

  const missingFilter = MISSING_ONLY
    ? `AND (
         NOT EXISTS (
           SELECT 1 FROM vote_events v2
           WHERE v2.bill_id = ve.bill_id
             AND v2.event_type = 'COMMITTEE'
             AND v2.source_url = ve.source_url
             AND v2.vote_time IS NOT NULL
         )
       )`
    : '';

  return runD1Json(
    `SELECT DISTINCT
            b.id AS bill_id,
            b.session_id,
            b.instrument,
            ve.chamber,
            ve.source_url
       FROM vote_events ve
       JOIN bills b ON b.id = ve.bill_id
      WHERE ve.event_type = 'COMMITTEE'
        AND ve.source_url LIKE '%CommitteeVote.aspx?moi=%'
        ${billFilter}
        ${missingFilter}
      ORDER BY b.id, ve.source_url`
  );
}

function sessionRoster(sessionId, chamber) {
  const historical = runD1Json(
    `SELECT DISTINCT l.id, l.first_name, l.last_name, l.display_name,
            l.chamber, lm.district_number, l.source_member_id
       FROM legislator_memberships lm
       JOIN legislators l ON l.id = lm.legislator_id
      WHERE lm.session_id = ${Number(sessionId)}
        AND lm.chamber = ${sqlString(chamber)}
      ORDER BY lm.start_date, l.id`
  );
  if (historical.length) return historical;

  return runD1Json(
    `SELECT id, first_name, last_name, display_name, chamber,
            district_number, source_member_id
       FROM legislators
      WHERE chamber = ${sqlString(chamber)}
      ORDER BY is_active DESC, district_number, id`
  );
}

function aliasRows(sessionId, chamber) {
  return runD1Json(
    `SELECT a.vote_label, l.id AS legislator_id
       FROM legislator_vote_aliases a
       JOIN legislators l ON l.id = a.legislator_id
      WHERE a.session_id = ${Number(sessionId)}
        AND a.chamber = ${sqlString(chamber)}`
  );
}

function exactAlias(rows, label) {
  const key = String(label).trim().toLowerCase();
  return rows.find(x => String(x.vote_label).trim().toLowerCase() === key) ?? null;
}

async function fetchPage(storedUrl) {
  const url = canonicalLouisianaDocumentUrl(storedUrl);
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent':'LeLegis/0.1 (+https://legis.le-comrade.org)',
      accept:'text/html,application/xhtml+xml'
    }
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return { url, html: await response.text() };
}

function motionTitle(motion) {
  return motion.context && /^Amendment:/i.test(motion.context)
    ? `${motion.motion} — ${motion.context}`
    : motion.motion;
}

function eventLookupSql({ billId, chamber, title, date, time, sourceUrl }) {
  return `(SELECT id
             FROM vote_events
            WHERE bill_id = ${Number(billId)}
              AND event_type = 'COMMITTEE'
              AND chamber = ${sqlString(chamber)}
              AND motion = ${sqlString(title)}
              AND vote_date IS ${date == null ? 'NULL' : sqlString(date)}
              AND vote_time IS ${time == null ? 'NULL' : sqlString(time)}
              AND source_url = ${sqlString(sourceUrl)}
            ORDER BY id DESC
            LIMIT 1)`;
}

async function main() {
  const sources = targetSources();
  console.log(`Committee vote pages to inspect: ${sources.length}`);

  for (const source of sources) {
    const { url, html } = await fetchPage(source.source_url);
    const parsed = parseCommitteeVotePage(html);

    if (!parsed.instrument || !parsed.motions.length) {
      throw new Error(`Could not parse committee motions from ${url}`);
    }

    if (parsed.instrument !== source.instrument) {
      throw new Error(`Bill mismatch: DB=${source.instrument}, page=${parsed.instrument}`);
    }

    const roster = sessionRoster(source.session_id, source.chamber);
    const aliases = aliasRows(source.session_id, source.chamber);

    const prepared = [];

    for (const motion of parsed.motions) {
      const resolved = [];
      const unresolved = [];

      for (const member of motion.members) {
        const alias = exactAlias(aliases, member.label);
        if (alias) {
          resolved.push({ legislator_id: alias.legislator_id, vote: member.vote, label: member.label });
          continue;
        }

        const result = resolveCommitteeMember(roster, member.label);
        if (result.match) {
          resolved.push({ legislator_id: result.match.id, vote: member.vote, label: member.label });
        } else {
          unresolved.push({ label: member.label, vote: member.vote, reason: result.reason });
        }
      }

      prepared.push({ motion, resolved, unresolved });

      console.log(
        `${source.instrument} ${motion.vote_time ?? ''} ${motionTitle(motion)}: ` +
        `${resolved.length} resolved, ${unresolved.length} unresolved, ${motion.vote_method}`
      );
      if (unresolved.length) console.table(unresolved);
    }

    if (DRY_RUN) continue;

    const moi = new URL(url).searchParams.get('moi');
    const sql = [];

    sql.push(`
DELETE FROM legislator_votes
WHERE vote_event_id IN (
  SELECT id FROM vote_events
  WHERE bill_id = ${Number(source.bill_id)}
    AND event_type = 'COMMITTEE'
    AND (
      source_url = ${sqlString(source.source_url)}
      OR source_url = ${sqlString(url)}
      OR source_url LIKE ${sqlString(`%CommitteeVote.aspx?moi=${moi}`)}
    )
);`);

    sql.push(`
DELETE FROM vote_events
WHERE bill_id = ${Number(source.bill_id)}
  AND event_type = 'COMMITTEE'
  AND (
    source_url = ${sqlString(source.source_url)}
    OR source_url = ${sqlString(url)}
    OR source_url LIKE ${sqlString(`%CommitteeVote.aspx?moi=${moi}`)}
  );`);

    for (const item of prepared) {
      const m = item.motion;
      const title = motionTitle(m);

      sql.push(`
INSERT INTO vote_events (
  bill_id, chamber, committee_id, event_type, motion, sequence_number,
  vote_date, vote_time, yea_total, nay_total, absent_total,
  present_total, vote_method, source_url
) VALUES (
  ${Number(source.bill_id)},
  ${sqlString(source.chamber)},
  NULL,
  'COMMITTEE',
  ${sqlString(title)},
  NULL,
  ${sqlString(m.vote_date)},
  ${sqlString(m.vote_time)},
  ${m.yea_total ?? 'NULL'},
  ${m.nay_total ?? 'NULL'},
  NULL,
  NULL,
  ${sqlString(m.vote_method)},
  ${sqlString(url)}
);`);

      const lookup = eventLookupSql({
        billId: source.bill_id,
        chamber: source.chamber,
        title,
        date: m.vote_date,
        time: m.vote_time,
        sourceUrl: url
      });

      for (const row of item.resolved) {
        sql.push(`
INSERT INTO legislator_votes (vote_event_id, legislator_id, vote)
SELECT ${lookup}, ${Number(row.legislator_id)}, ${sqlString(row.vote)};`);
      }
    }

    runD1SqlFile(sql.join('\n'), 'lelegis-committee-votes-');
  }
}

main().catch(error => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
