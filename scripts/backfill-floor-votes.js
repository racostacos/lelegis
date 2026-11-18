
import { spawnSync } from 'node:child_process';
import { runD1Json } from '../src/lib/d1-cli.js';

const args = process.argv.slice(2);
const SESSION = (
  args.find(a => a.startsWith('--session='))?.split('=')[1] ?? '26RS'
).toUpperCase();

const API_BASE = process.env.LELEGIS_API_BASE ?? 'https://legis.le-comrade.org';
const CONCURRENCY = Number(
  args.find(a => a.startsWith('--concurrency='))?.split('=')[1] ?? 8
);

function sessionBills() {
  return runD1Json(
    `SELECT b.instrument
       FROM bills b
       JOIN sessions s ON s.id=b.session_id
      WHERE UPPER(s.session_code)=UPPER('${SESSION.replaceAll("'", "''")}')
      ORDER BY
        CASE b.instrument_type
          WHEN 'HB' THEN 1
          WHEN 'SB' THEN 2
          WHEN 'HCR' THEN 3
          WHEN 'SCR' THEN 4
          WHEN 'HR' THEN 5
          WHEN 'SR' THEN 6
          ELSE 99
        END,
        b.bill_number`
  );
}

async function forceRefreshBills(rows) {
  const queue = rows.map(x => x.instrument);
  const failures = [];
  let completed = 0;

  async function worker() {
    while (queue.length) {
      const instrument = queue.shift();
      const url = `${API_BASE}/api/bills/${encodeURIComponent(instrument)}?refresh=1`;

      try {
        let success = false;
        let lastError = null;

        for (let attempt=1; attempt<=3; attempt++) {
          try {
            const r = await fetch(url, {
              headers: { accept: 'application/json' }
            });

            if (!r.ok) throw new Error(`HTTP ${r.status}`);

            const body = await r.json();
            if (!body.ok) throw new Error(body.error ?? 'API returned ok=false');

            success = true;
            break;
          } catch (err) {
            lastError = err;
            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 350 * attempt));
            }
          }
        }

        if (!success) {
          failures.push({
            instrument,
            error: String(lastError?.message ?? lastError ?? 'unknown error')
          });
        }
      } finally {
        completed += 1;
        if (completed % 50 === 0 || completed === rows.length) {
          console.log(`Bill detail refresh: ${completed}/${rows.length}`);
        }
      }
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(CONCURRENCY, rows.length || 1)) },
    () => worker()
  );

  await Promise.all(workers);

  if (failures.length) {
    console.log('');
    console.log(`Bill refresh failures: ${failures.length}`);
    console.table(failures.slice(0, 50));
  }

  return failures;
}

function importMissingFloorVotes() {
  console.log('');
  console.log('Importing all missing floor roll calls...');

  const result = spawnSync(
    'node',
    ['scripts/import-floor-rollcalls.js', '--missing-only'],
    {
      stdio: 'inherit',
      shell: process.platform === 'win32'
    }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`floor vote importer exited ${result.status}`);
  }
}

function printCoverage() {
  const rows = runD1Json(
    `SELECT
       COUNT(DISTINCT ve.id) AS floor_vote_events,
       COUNT(DISTINCT CASE
         WHEN EXISTS (
           SELECT 1
             FROM legislator_votes lv
            WHERE lv.vote_event_id=ve.id
         )
         THEN ve.id
       END) AS floor_events_with_member_votes,
       COUNT(DISTINCT b.id) AS bills_with_floor_events,
       COUNT(DISTINCT CASE
         WHEN EXISTS (
           SELECT 1
             FROM legislator_votes lv
            WHERE lv.vote_event_id=ve.id
         )
         THEN b.id
       END) AS bills_with_member_floor_votes
     FROM vote_events ve
     JOIN bills b ON b.id=ve.bill_id
     JOIN sessions s ON s.id=b.session_id
    WHERE UPPER(s.session_code)=UPPER('${SESSION.replaceAll("'", "''")}')
      AND ve.event_type='FLOOR'`
  );

  console.log('');
  console.log(`${SESSION} floor-vote coverage:`);
  console.table(rows);
}

async function main() {
  const bills = sessionBills();

  if (!bills.length) {
    throw new Error(`No bills found for ${SESSION}`);
  }

  console.log(`${SESSION}: ${bills.length} instruments to force-refresh.`);
  console.log(`API: ${API_BASE}`);
  console.log(`Concurrency: ${CONCURRENCY}`);

  const failures = await forceRefreshBills(bills);

  // Import whatever was successfully discovered even if a few detail refreshes failed.
  importMissingFloorVotes();
  printCoverage();

  if (failures.length) {
    console.log('');
    console.log(
      `Backfill completed with ${failures.length} bill-detail refresh failure(s). ` +
      `Re-run the same command to retry only the remaining gaps.`
    );
  } else {
    console.log('');
    console.log('Historical floor-vote backfill complete.');
  }
}

main().catch(error => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
