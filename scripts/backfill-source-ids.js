import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseBillSearchSourceIds } from '../src/lib/louisiana-source-ids.js';

const args = process.argv.slice(2);
const SESSION_CODE = (args.find(a => a.startsWith('--session='))?.split('=')[1] ?? '26RS').toUpperCase();
const DRY_RUN = args.includes('--dry-run');
const TYPES = ['HB', 'SB', 'HCR', 'SCR', 'HR', 'SR'];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sqlString = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;

async function fetchSearch(type, prefixDigit) {
  // Louisiana's quick bill search accepts wildcard instrument prefixes.
  // Prefixes 1* through 9* cover every positive bill number without overlap.
  const query = `${type}${prefixDigit}*`;
  const url = `https://www.legis.la.gov/legis/BillSearchListQ.aspx?r=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'LeLegis/0.1 (+https://legis.le-comrade.org)',
      accept: 'text/html,application/xhtml+xml'
    }
  });

  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return { url, html: await response.text() };
}

function buildSql(records) {
  const lines = [
    '-- Backfill canonical Louisiana Legislature bill IDs.',
    `-- Session ${SESSION_CODE}`
  ];

  for (const row of records) {
    lines.push(`UPDATE bills
SET official_bill_id = ${sqlString(row.official_bill_id)},
    source_url = ${sqlString(row.source_url)},
    updated_at = CURRENT_TIMESTAMP
WHERE instrument = ${sqlString(row.instrument)}
  AND session_id = (SELECT id FROM sessions WHERE session_code = ${sqlString(SESSION_CODE)});`);
  }

  return `${lines.join('\n\n')}\n`;
}

function runWrangler(sqlPath) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'lelegis', '--remote', `--file=${sqlPath}`],
    { stdio: 'inherit', shell: process.platform === 'win32' }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`wrangler exited with ${result.status}`);
}

async function main() {
  const found = new Map();

  for (const type of TYPES) {
    for (let digit = 1; digit <= 9; digit += 1) {
      const { html } = await fetchSearch(type, digit);
      for (const row of parseBillSearchSourceIds(html)) {
        if (row.instrument.startsWith(type)) found.set(row.instrument, row);
      }
      console.log(`${type}${digit}*: cumulative canonical IDs ${found.size}`);
      await sleep(75);
    }
  }

  const rows = [...found.values()].sort((a, b) => a.instrument.localeCompare(b.instrument, undefined, { numeric: true }));
  console.log(`Canonical bill IDs discovered: ${rows.length}`);

  if (!rows.length) throw new Error('No canonical bill IDs were discovered.');

  if (DRY_RUN) {
    console.table(rows.slice(0, 20));
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), 'lelegis-source-ids-'));
  const file = join(dir, 'bill-source-ids.sql');
  try {
    writeFileSync(file, buildSql(rows), 'utf8');
    runWrangler(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log(`Source-ID backfill complete for ${rows.length} instruments.`);
}

main().catch(error => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
