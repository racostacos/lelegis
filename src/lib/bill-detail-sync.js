import { fetchBillRecord, billInfoUrl, isStale, upsertBillRecord } from './bill-sync.js';
import { parseBillDetails } from './bill-detail-parser.js';

export const DETAIL_REFRESH_MINUTES = 30;

function nameTokens(value = '') {
  return value
    .toLowerCase()
    .replace(/["“”']/g, '')
    .replace(/\b(representative|rep|senator|sen)\b\.?/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

async function resolvePrimaryAuthor(db, chamber, authorText) {
  if (!authorText) return null;
  const target = nameTokens(authorText);
  if (target.length < 2) return null;

  const { results } = await db.prepare(
    `SELECT id, display_name
       FROM legislators
      WHERE chamber = ?1 AND is_active = 1`
  ).bind(chamber).all();

  const exact = (results ?? []).filter(
    (r) => nameTokens(r.display_name).join(' ') === target.join(' ')
  );
  if (exact.length === 1) return exact[0];

  const first = target[0];
  const last = target[target.length - 1];
  const loose = (results ?? []).filter((r) => {
    const tokens = nameTokens(r.display_name);
    return tokens[0] === first && tokens[tokens.length - 1] === last;
  });

  return loose.length === 1 ? loose[0] : null;
}

async function committeeIdForShortName(db, shortName) {
  if (!shortName) return null;
  const row = await db.prepare(
    `SELECT id FROM committees WHERE UPPER(short_name) = UPPER(?1) LIMIT 1`
  ).bind(shortName).first();
  return row?.id ?? null;
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

  if (details.primary_author_text) {
    const author = await resolvePrimaryAuthor(db, bill.origin_chamber, details.primary_author_text);
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

  statements.push(
    db.prepare(
      `UPDATE bills
          SET detail_synced_at = CASE WHEN ?2 > 0 THEN CURRENT_TIMESTAMP ELSE NULL END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?1`
    ).bind(bill.id, details.actions.length)
  );

  if (statements.length) await db.batch(statements);
}

export async function refreshBillDetailsForRequest(db, instrument, fetchImpl = fetch) {
  const bill = await db.prepare(
    `SELECT b.id, b.instrument, b.origin_chamber, b.detail_synced_at,
            s.id AS session_id, s.session_code, s.start_date, s.is_active
       FROM bills b
       JOIN sessions s ON s.id = b.session_id
      WHERE b.instrument = ?1
      ORDER BY s.start_date DESC, s.id DESC
      LIMIT 1`
  ).bind(instrument).first();

  if (!bill) return { found: false, refreshed: false };

  const hasActions = await db.prepare(
    `SELECT EXISTS(SELECT 1 FROM bill_actions WHERE bill_id = ?1) AS has_actions`
  ).bind(bill.id).first();

  const shouldRefresh =
    !Number(hasActions?.has_actions ?? 0) ||
    !bill.detail_synced_at ||
    (bill.is_active && isStale(bill.detail_synced_at, DETAIL_REFRESH_MINUTES));

  if (!shouldRefresh) return { found: true, refreshed: false };

  const expandedUrl = `${billInfoUrl(bill.session_code, instrument)}&sbi=y`;

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

  await writeDetails(db, bill, details);

  return {
    found: true,
    refreshed: true,
    authorFound: Boolean(details.primary_author_text),
    actions: details.actions.length,
    voteEvents: details.vote_events.length
  };
}
