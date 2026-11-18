import { parseBillInfoPage } from './bill-index-parser.js';

export const BILL_TYPES = ['HB', 'SB', 'HCR', 'SCR', 'HR', 'SR'];
export const ACTIVE_REFRESH_MINUTES = 30;
export const CRON_PROBES_PER_TYPE = 6;
export const CRON_CONSECUTIVE_MISS_LIMIT = 3;

export function billInfoUrl(sessionCode, instrument) {
  return `https://legis.la.gov/legis/BillInfo.aspx?s=${encodeURIComponent(sessionCode)}&b=${encodeURIComponent(instrument)}`;
}

export function isStale(lastSyncedAt, minutes = ACTIVE_REFRESH_MINUTES, nowMs = Date.now()) {
  if (!lastSyncedAt) return true;
  const normalized = /Z$|[+-]\d\d:\d\d$/.test(lastSyncedAt)
    ? lastSyncedAt
    : `${lastSyncedAt.replace(' ', 'T')}Z`;
  const syncedMs = Date.parse(normalized);
  if (!Number.isFinite(syncedMs)) return true;
  return nowMs - syncedMs >= minutes * 60_000;
}

export async function fetchBillRecord(sessionCode, instrument, fetchImpl = fetch) {
  const url = billInfoUrl(sessionCode, instrument);
  const response = await fetchImpl(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'LeLegis/0.1 (+https://legis.le-comrade.org)',
      accept: 'text/html,application/xhtml+xml'
    }
  });

  if (!response.ok) return null;
  const html = await response.text();
  return parseBillInfoPage(html, instrument, url);
}

export async function upsertBillRecord(db, sessionId, bill) {
  await db.prepare(
    `INSERT INTO bills (
       session_id, instrument, instrument_type, bill_number, origin_chamber,
       subject, official_description, official_status, normalized_status,
       source_url, last_synced_at
     )
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, CURRENT_TIMESTAMP)
     ON CONFLICT(session_id, instrument) DO UPDATE SET
       instrument_type = excluded.instrument_type,
       bill_number = excluded.bill_number,
       origin_chamber = excluded.origin_chamber,
       subject = excluded.subject,
       official_description = excluded.official_description,
       official_status = excluded.official_status,
       normalized_status = excluded.normalized_status,
       source_url = excluded.source_url,
       last_synced_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(
    sessionId,
    bill.instrument,
    bill.instrumentType,
    bill.billNumber,
    bill.originChamber,
    bill.subject,
    bill.official_description,
    bill.official_status,
    bill.normalized_status,
    bill.source_url
  ).run();
}

export async function refreshBillForRequest(db, instrument, fetchImpl = fetch) {
  const existing = await db.prepare(
    `SELECT b.id, b.last_synced_at, s.id AS session_id, s.session_code, s.is_active
       FROM bills b
       JOIN sessions s ON s.id = b.session_id
      WHERE b.instrument = ?1
      ORDER BY s.start_date DESC, s.id DESC
      LIMIT 1`
  ).bind(instrument).first();

  if (existing) {
    if (existing.is_active && isStale(existing.last_synced_at)) {
      const fresh = await fetchBillRecord(existing.session_code, instrument, fetchImpl);
      if (fresh) await upsertBillRecord(db, existing.session_id, fresh);
    }
    return { found: true, discovered: false };
  }

  const active = await db.prepare(
    `SELECT id, session_code
       FROM sessions
      WHERE is_active = 1
      ORDER BY start_date DESC, id DESC`
  ).all();

  for (const session of active.results ?? []) {
    const fresh = await fetchBillRecord(session.session_code, instrument, fetchImpl);
    if (!fresh) continue;
    await upsertBillRecord(db, session.id, fresh);
    return { found: true, discovered: true };
  }

  return { found: false, discovered: false };
}

async function maxBillNumber(db, sessionId, type) {
  const row = await db.prepare(
    `SELECT MAX(bill_number) AS max_number
       FROM bills
      WHERE session_id = ?1 AND instrument_type = ?2`
  ).bind(sessionId, type).first();

  return Number(row?.max_number ?? 0);
}

export async function discoverNewBillsForSession(
  db,
  session,
  fetchImpl = fetch,
  {
    probesPerType = CRON_PROBES_PER_TYPE,
    missLimit = CRON_CONSECUTIVE_MISS_LIMIT
  } = {}
) {
  const added = [];
  const checked = [];

  for (const type of BILL_TYPES) {
    const maxNumber = await maxBillNumber(db, session.id, type);
    let misses = 0;

    for (let offset = 1; offset <= probesPerType; offset += 1) {
      const number = maxNumber + offset;
      const instrument = `${type}${number}`;
      checked.push(instrument);

      const record = await fetchBillRecord(session.session_code, instrument, fetchImpl);
      if (!record) {
        misses += 1;
        if (misses >= missLimit) break;
        continue;
      }

      misses = 0;
      await upsertBillRecord(db, session.id, record);
      added.push(instrument);
    }
  }

  return { added, checked };
}

export async function syncActiveSessions(db, fetchImpl = fetch) {
  const active = await db.prepare(
    `SELECT id, session_code, session_name
       FROM sessions
      WHERE is_active = 1
      ORDER BY start_date ASC, id ASC`
  ).all();

  const results = [];
  for (const session of active.results ?? []) {
    const result = await discoverNewBillsForSession(db, session, fetchImpl);
    results.push({
      session: session.session_code,
      added: result.added,
      checked: result.checked.length
    });
  }
  return results;
}
