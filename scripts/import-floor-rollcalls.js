import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseFloorRollCallText, resolveVoteLabel } from '../src/lib/floor-rollcall-parser.js';

const args = process.argv.slice(2);
const INSTRUMENT = args.find(a => a.startsWith('--bill='))?.split('=')[1]?.toUpperCase() ?? null;
const DRY_RUN = args.includes('--dry-run');

const sqlString = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;

function runD1Json(sql) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'lelegis', '--remote', '--json', `--command=${sql}`],
    { encoding: 'utf8', shell: process.platform === 'win32' }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `wrangler exited ${result.status}`);

  const parsed = JSON.parse(result.stdout);
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  return entry?.results ?? entry?.result?.[0]?.results ?? [];
}

function runSqlFile(sql) {
  const dir = mkdtempSync(join(tmpdir(), 'lelegis-floor-votes-'));
  const file = join(dir, 'floor-votes.sql');
  try {
    writeFileSync(file, sql, 'utf8');
    const result = spawnSync(
      'npx',
      ['wrangler', 'd1', 'execute', 'lelegis', '--remote', `--file=${file}`],
      { stdio: 'inherit', shell: process.platform === 'win32' }
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`wrangler exited ${result.status}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function extractPdfText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'LeLegis/0.1 (+https://legis.le-comrade.org)',
      accept: 'application/pdf'
    }
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);

  const data = new Uint8Array(await response.arrayBuffer());
  const pdf = await getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
  const lines = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();

    // PDF.js usually preserves these Louisiana vote PDFs in logical content order.
    // Emit one item per line-like text chunk, and keep parser validation strict below.
    for (const item of content.items) {
      const value = String(item.str ?? '').trim();
      if (value) lines.push(value);
    }
  }

  return lines.join('\n');
}

function chamberLegislators(chamber) {
  return runD1Json(
    `SELECT id, first_name, last_name, display_name, chamber, district_number, source_member_id
       FROM legislators
      WHERE chamber = '${chamber.replaceAll("'", "''")}'
      ORDER BY is_active DESC, district_number ASC`
  );
}

function targetEvents() {
  const billFilter = INSTRUMENT
    ? `AND b.instrument = '${INSTRUMENT.replaceAll("'", "''")}'`
    : '';

  return runD1Json(
    `SELECT ve.id, ve.bill_id, ve.chamber, ve.sequence_number, ve.source_url, b.instrument
       FROM vote_events ve
       JOIN bills b ON b.id = ve.bill_id
      WHERE ve.event_type = 'FLOOR'
        AND ve.source_url LIKE '%ViewDocument.aspx?d=%'
        ${billFilter}
      ORDER BY b.id, ve.id`
  );
}

async function main() {
  const events = targetEvents();
  console.log(`Floor vote documents to inspect: ${events.length}`);

  const legislatorsByChamber = new Map();

  for (const event of events) {
    if (!legislatorsByChamber.has(event.chamber)) {
      legislatorsByChamber.set(event.chamber, chamberLegislators(event.chamber));
    }

    const text = await extractPdfText(event.source_url);
    const parsed = parseFloorRollCallText(text);

    if (!parsed.sequence_number || !parsed.members.length) {
      throw new Error(`Could not parse roll call ${event.source_url}`);
    }

    if (event.sequence_number && Number(event.sequence_number) !== parsed.sequence_number) {
      throw new Error(
        `Sequence mismatch for ${event.instrument}: DB=${event.sequence_number}, PDF=${parsed.sequence_number}`
      );
    }

    const rows = legislatorsByChamber.get(event.chamber);
    const resolved = [];
    const unresolved = [];

    for (const member of parsed.members) {
      const result = resolveVoteLabel(rows, member.label);
      if (result.match) {
        resolved.push({
          legislator_id: result.match.id,
          label: member.label,
          vote: member.vote
        });
      } else {
        unresolved.push({ label: member.label, vote: member.vote, reason: result.reason });
      }
    }

    console.log(
      `${event.instrument} #${parsed.sequence_number}: ${resolved.length} resolved, ${unresolved.length} unresolved`
    );
    if (unresolved.length) console.table(unresolved);

    if (DRY_RUN) continue;

    const lines = [
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
      lines.push(
        `INSERT INTO legislator_votes (vote_event_id, legislator_id, vote)
         VALUES (${Number(event.id)}, ${Number(row.legislator_id)}, ${sqlString(row.vote)});`
      );
    }

    runSqlFile(`${lines.join('\n\n')}\n`);
  }
}

main().catch(error => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
