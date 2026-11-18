import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { spawnSync } from 'node:child_process';
import { parseActionDocumentLinks, instrumentsFromDailyActionText, sha256 } from '../src/lib/daily-actions-parser.js';
import { runD1Json, runD1SqlFile, sqlString } from '../src/lib/d1-cli.js';

const API_BASE = process.env.LELEGIS_API_BASE ?? 'https://legis.le-comrade.org';

async function fetchBytes(url) {
  const r = await fetch(url, {
    headers: {
      'user-agent':'LeLegis/0.1 (+https://legis.le-comrade.org)',
      accept:'application/pdf'
    }
  });
  if (!r.ok) throw new Error(`${url} returned HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function pdfText(data) {
  const pdf = await getDocument({ data, useWorkerFetch:false, isEvalSupported:false }).promise;
  const out = [];

  for (let n=1; n<=pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    for (const item of content.items) {
      const str = String(item.str ?? '').trim();
      if (str) out.push(str);
    }
  }

  return out.join('\n');
}

function activeSessions() {
  return runD1Json(
    `SELECT id, session_code
       FROM sessions
      WHERE is_active = 1
      ORDER BY start_date DESC`
  );
}

function stateValue(key) {
  return runD1Json(
    `SELECT sync_value FROM sync_state WHERE sync_key = ${sqlString(key)} LIMIT 1`
  )[0]?.sync_value ?? null;
}

function saveState(key, value) {
  runD1SqlFile(`
INSERT INTO sync_state (sync_key, sync_value)
VALUES (${sqlString(key)}, ${sqlString(value)})
ON CONFLICT(sync_key) DO UPDATE SET
  sync_value = excluded.sync_value,
  updated_at = CURRENT_TIMESTAMP;
`, 'lelegis-state-');
}

async function refreshBills(instruments) {
  const queue = [...instruments];
  const failures = [];

  async function worker() {
    while (queue.length) {
      const instrument = queue.shift();
      const url = `${API_BASE}/api/bills/${encodeURIComponent(instrument)}`;

      try {
        const r = await fetch(url, { headers:{ accept:'application/json' } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = await r.json();
        if (!body.ok) throw new Error(body.error ?? 'API returned ok=false');
      } catch (error) {
        failures.push({ instrument, error:String(error?.message ?? error) });
      }
    }
  }

  await Promise.all(Array.from({length:Math.min(8, Math.max(1, instruments.length))}, () => worker()));

  if (failures.length) {
    console.table(failures);
    throw new Error(`${failures.length} bill refreshes failed`);
  }
}

function importMissingFloorVotes() {
  const result = spawnSync(
    'node',
    ['scripts/import-floor-rollcalls.js', '--missing-only'],
    { stdio:'inherit' }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`floor vote importer exited ${result.status}`);
}

function importMissingCommitteeVotes() {
  const result = spawnSync(
    'node',
    ['scripts/import-committee-votes.js', '--missing-only'],
    { stdio:'inherit' }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`committee vote importer exited ${result.status}`);
}

async function main() {
  const sessions = activeSessions();
  if (!sessions.length) {
    console.log('No active Louisiana session. Nothing to sync.');
    return;
  }

  for (const session of sessions) {
    const indexUrl = `https://www.legis.la.gov/legisdocs/${session.session_code}/LastLegs.htm`;
    const indexResponse = await fetch(indexUrl, {
      headers:{ 'user-agent':'LeLegis/0.1 (+https://legis.le-comrade.org)' }
    });

    if (!indexResponse.ok) throw new Error(`${indexUrl} returned HTTP ${indexResponse.status}`);

    const html = await indexResponse.text();
    const links = parseActionDocumentLinks(html, indexUrl);

    if (!links.length) {
      console.log(`${session.session_code}: no Daily Legislative Actions PDFs for today yet.`);
      continue;
    }

    const changed = new Set();
    const pendingState = [];

    for (const doc of links) {
      const bytes = await fetchBytes(doc.url);
      const hash = sha256(bytes);
      const key = `daily-actions:${session.session_code}:${doc.chamber}:${doc.date_key}`;

      if (stateValue(key) === hash) {
        console.log(`${session.session_code} ${doc.chamber}: unchanged.`);
        continue;
      }

      const text = await pdfText(bytes);
      const instruments = instrumentsFromDailyActionText(text);
      instruments.forEach(x => changed.add(x));

      pendingState.push([key, hash]);
      console.log(`${session.session_code} ${doc.chamber}: ${instruments.length} changed instruments.`);
    }

    if (!changed.size) continue;

    const instruments = [...changed];
    console.log(`Refreshing ${instruments.length} changed bills...`);
    await refreshBills(instruments);

    console.log('Importing newly discovered floor roll calls...');
    importMissingFloorVotes();

    console.log('Importing newly discovered committee motions...');
    importMissingCommitteeVotes();

    for (const [key, hash] of pendingState) saveState(key, hash);
  }
}

main().catch(error => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
