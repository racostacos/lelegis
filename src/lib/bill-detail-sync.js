import { fetchBillRecord, billInfoUrl, isStale, upsertBillRecord } from './bill-sync.js';
import { parseBillDetails } from './bill-detail-parser.js';
import { canonicalBillUrl, parsePrimaryAuthorSource } from './louisiana-source-ids.js';

export const DETAIL_REFRESH_MINUTES = 30;

function nameTokens(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/["“”']/g, '')
    .replace(/\b(representative|rep|senator|sen)\b\.?/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function authorMatchScore(row, authorText) {
  const target = nameTokens(authorText);
  if (target.length < 2) return 0;

  const display = nameTokens(row.display_name);
  const first = nameTokens(row.first_name);
  const last = nameTokens(row.last_name);

  const targetFirst = target[0];
  const targetLast = target[target.length - 1];

  let score = 0;

  if (display.join(' ') === target.join(' ')) {
    score = 100;
  } else if (
    display.length >= 2 &&
    display[0] === targetFirst &&
    display[display.length - 1] === targetLast
  ) {
    score = 90;
  } else if (
    first.length &&
    last.length &&
    first[0] === targetFirst &&
    last[last.length - 1] === targetLast
  ) {
    score = 85;
  } else if (
    last.length &&
    last[last.length - 1] === targetLast &&
    (first.includes(targetFirst) || display.includes(targetFirst))
  ) {
    score = 70;
  }

  if (score && row.is_active) score += 1;
  return score;
}

export function choosePrimaryAuthor(rows, authorText) {
  const scored = (rows ?? [])
    .map(row => ({ ...row, score: authorMatchScore(row, authorText) }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score) return null;
  return scored[0];
}

async function resolvePrimaryAuthor(db, chamber, authorText) {
  if (!authorText) return null;

  const { results } = await db.prepare(
    `SELECT id, display_name, first_name, last_name, is_active
       FROM legislators
      WHERE chamber = ?1`
  ).bind(chamber).all();

  return choosePrimaryAuthor(results, authorText);
}

async function committeeIdForShortName(db, shortName) {
  if (!shortName) return null;
  const row = await db.prepare(
    `SELECT id FROM committees WHERE UPPER(short_name) = UPPER(?1) LIMIT 1`
  ).bind(shortName).first();
  return row?.id ?? null;
}

function extractActNumber(status, actions) {
  const candidates = [status, ...actions.map(a => a.official_text)].filter(Boolean);
  for (const text of candidates) {
    const m = text.match(/\bAct(?:\s+No\.?)?\s*(\d+)\b/i);
    if (m) return Number(m[1]);
  }
  return null;
}

function extractEffectiveDate(actions) {
  for (const a of actions) {
    const m = a.official_text.match(/Effective date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (!m) continue;
    const [month, day, year] = m[1].split('/').map(Number);
    return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  return null;
}

async function writeDetails(db, bill, details) {
  const statements = [];

  if (details.actions.length) {
    statements.push(db.prepare(`DELETE FROM bill_actions WHERE bill_id = ?1`).bind(bill.id));

    for (const action of details.actions) {
      statements.push(
        db.prepare(
          `INSERT INTO bill_actions (
             bill_id, action_date, chamber, official_text, normalized_action,
             journal_page, journal_url, video_url, source_order
           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
        ).bind(
          bill.id,
          action.action_date,
          action.chamber,
          action.official_text,
          action.normalized_action,
          action.journal_page,
          action.journal_url,
          action.video_url,
          action.source_order
        )
      );
    }
  }

  if (details.primary_author_source?.source_member_id) {
    const author = await db.prepare(
      `SELECT id
         FROM legislators
        WHERE chamber = ?1 AND source_member_id = ?2
        ORDER BY is_active DESC, id DESC
        LIMIT 1`
    ).bind(
      details.primary_author_source.chamber ?? bill.origin_chamber,
      details.primary_author_source.source_member_id
    ).first();

    if (author) {
      statements.push(
        db.prepare(`DELETE FROM bill_authors WHERE bill_id = ?1 AND author_type = 'PRIMARY'`).bind(bill.id)
      );
      statements.push(
        db.prepare(
          `INSERT INTO bill_authors (bill_id, legislator_id, author_type)
           VALUES (?1, ?2, 'PRIMARY')`
        ).bind(bill.id, author.id)
      );
    }
  }

  const memberVoteCount = await db.prepare(
    `SELECT COUNT(*) AS count
       FROM legislator_votes lv
       JOIN vote_events ve ON ve.id = lv.vote_event_id
      WHERE ve.bill_id = ?1`
  ).bind(bill.id).first();

  if (Number(memberVoteCount?.count ?? 0) === 0) {
    statements.push(db.prepare(`DELETE FROM vote_events WHERE bill_id = ?1`).bind(bill.id));

    for (const event of details.vote_events) {
      const committeeId = await committeeIdForShortName(db, event.committee_short_name);

      statements.push(
        db.prepare(
          `INSERT INTO vote_events (
             bill_id, chamber, committee_id, event_type, motion, sequence_number,
             vote_date, vote_time, yea_total, nay_total, absent_total,
             present_total, vote_method, source_url
           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`
        ).bind(
          bill.id,
          event.chamber,
          committeeId,
          event.event_type,
          event.motion,
          event.sequence_number,
          event.vote_date,
          event.vote_time,
          event.yea_total,
          event.nay_total,
          event.absent_total,
          event.present_total,
          event.vote_method,
          event.source_url
        )
      );
    }
  }

  const actNumber = extractActNumber(bill.official_status, details.actions);
  const effectiveDate = extractEffectiveDate(details.actions);

  statements.push(
    db.prepare(
      `UPDATE bills
          SET detail_synced_at = CASE WHEN ?2 > 0 THEN CURRENT_TIMESTAMP ELSE NULL END,
              act_number = COALESCE(act_number, ?3),
              effective_date = COALESCE(effective_date, ?4),
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?1`
    ).bind(bill.id, details.actions.length, actNumber, effectiveDate)
  );

  if (statements.length) await db.batch(statements);
}

export async function refreshBillDetailsForRequest(db, instrument, fetchImpl = fetch, { force = false } = {}) {
  const bill = await db.prepare(
    `SELECT b.id, b.instrument, b.origin_chamber, b.official_bill_id, b.official_status, b.detail_synced_at,
            s.id AS session_id, s.session_code, s.start_date, s.is_active
       FROM bills b
       JOIN sessions s ON s.id = b.session_id
      WHERE b.instrument = ?1
      ORDER BY s.start_date DESC, s.id DESC
      LIMIT 1`
  ).bind(instrument).first();

  if (!bill) return { found: false, refreshed: false };

  const completeness = await db.prepare(
    `SELECT
       EXISTS(SELECT 1 FROM bill_actions WHERE bill_id = ?1) AS has_actions,
       EXISTS(
         SELECT 1 FROM bill_authors
          WHERE bill_id = ?1 AND author_type = 'PRIMARY'
       ) AS has_primary_author,
       act_number,
       effective_date
     FROM bills
     WHERE id = ?1`
  ).bind(bill.id).first();

  const shouldRefresh =
    force ||
    !Number(completeness?.has_actions ?? 0) ||
    !Number(completeness?.has_primary_author ?? 0) ||
    !completeness?.act_number ||
    !completeness?.effective_date ||
    !bill.detail_synced_at ||
    (bill.is_active && isStale(bill.detail_synced_at, DETAIL_REFRESH_MINUTES));

  if (!shouldRefresh) return { found: true, refreshed: false };

  const expandedUrl = bill.official_bill_id
    ? `${canonicalBillUrl(String(bill.official_bill_id))}&sbi=y`
    : `${billInfoUrl(bill.session_code, instrument)}&sbi=y`;

  const response = await fetchImpl(expandedUrl, {
    redirect: 'follow',
    headers: {
      'user-agent': 'LeLegis/0.1 (+https://legis.le-comrade.org)',
      accept: 'text/html,application/xhtml+xml'
    }
  });

  if (!response.ok) return { found: true, refreshed: false };

  const html = await response.text();

  const fakeFetch = async () => ({
    ok: true,
    text: async () => html
  });

  const indexRecord = await fetchBillRecord(bill.session_code, instrument, fakeFetch);
  if (indexRecord) await upsertBillRecord(db, bill.session_id, indexRecord);

  const defaultYear = Number(String(bill.start_date).slice(0, 4));
  const details = parseBillDetails(html, instrument, defaultYear);
  details.primary_author_source = parsePrimaryAuthorSource(html, bill.origin_chamber);

  await writeDetails(db, bill, details);

  return {
    found: true,
    refreshed: true,
    authorFound: Boolean(details.primary_author_text),
    actions: details.actions.length,
    voteEvents: details.vote_events.length
  };
}
