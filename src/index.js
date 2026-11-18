import { refreshBillForRequest, syncActiveSessions } from './lib/bill-sync.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*'
    }
  });

const getBillDetail = async (env, instrument) => {
  const bill = await env.DB.prepare(
    `SELECT b.id, b.official_bill_id, b.instrument, b.instrument_type, b.bill_number,
            b.origin_chamber, b.subject, b.official_description, b.official_status,
            b.normalized_status, b.act_number, b.effective_date, b.source_url,
            b.last_synced_at, b.created_at, b.updated_at,
            s.id AS session_id, s.session_code, s.session_name,
            s.legislature_number, s.session_type, s.start_date AS session_start_date,
            s.end_date AS session_end_date, s.is_active AS session_is_active
       FROM bills b
       JOIN sessions s ON s.id = b.session_id
      WHERE b.instrument = ?1
      ORDER BY s.start_date DESC, s.id DESC
      LIMIT 1`
  ).bind(instrument).first();

  if (!bill) return null;

  const [authorRes, actionRes, voteRes, memberRes] = await env.DB.batch([
    env.DB.prepare(
      `SELECT l.id, l.official_id, l.display_name, l.first_name, l.last_name,
              l.chamber, l.district_number, l.party
         FROM bill_authors ba
         JOIN legislators l ON l.id = ba.legislator_id
        WHERE ba.bill_id = ?1 AND ba.author_type = 'PRIMARY'
        ORDER BY ba.id
        LIMIT 1`
    ).bind(bill.id),
    env.DB.prepare(
      `SELECT id, action_date, chamber, official_text, normalized_action,
              journal_page, journal_url, video_url, source_order
         FROM bill_actions
        WHERE bill_id = ?1
        ORDER BY source_order ASC, id ASC`
    ).bind(bill.id),
    env.DB.prepare(
      `SELECT ve.id, ve.chamber, ve.committee_id, c.official_name AS committee_name,
              c.short_name AS committee_short_name, ve.event_type, ve.motion,
              ve.sequence_number, ve.vote_date, ve.vote_time, ve.yea_total,
              ve.nay_total, ve.absent_total, ve.present_total, ve.vote_method,
              ve.source_url
         FROM vote_events ve
         LEFT JOIN committees c ON c.id = ve.committee_id
        WHERE ve.bill_id = ?1
        ORDER BY ve.vote_date ASC, ve.vote_time ASC, ve.sequence_number ASC, ve.id ASC`
    ).bind(bill.id),
    env.DB.prepare(
      `SELECT lv.vote_event_id, l.id AS legislator_id, l.official_id, l.display_name,
              l.chamber, l.district_number, l.party, lv.vote
         FROM legislator_votes lv
         JOIN legislators l ON l.id = lv.legislator_id
         JOIN vote_events ve ON ve.id = lv.vote_event_id
        WHERE ve.bill_id = ?1
        ORDER BY lv.vote_event_id ASC, l.last_name ASC, l.display_name ASC`
    ).bind(bill.id)
  ]);

  const memberVotesByEvent = new Map();
  for (const row of memberRes.results) {
    const { vote_event_id, ...member } = row;
    if (!memberVotesByEvent.has(vote_event_id)) memberVotesByEvent.set(vote_event_id, []);
    memberVotesByEvent.get(vote_event_id).push(member);
  }

  const voteEvents = voteRes.results.map((ve) => {
    const { committee_id, committee_name, committee_short_name, ...rest } = ve;
    return {
      ...rest,
      committee: committee_id
        ? { id: committee_id, name: committee_name, short_name: committee_short_name }
        : null,
      member_votes: memberVotesByEvent.get(ve.id) ?? []
    };
  });

  const {
    session_id, session_code, session_name, legislature_number, session_type,
    session_start_date, session_end_date, session_is_active, ...billFields
  } = bill;

  return {
    ...billFields,
    session: {
      id: session_id,
      code: session_code,
      name: session_name,
      legislature_number,
      type: session_type,
      start_date: session_start_date,
      end_date: session_end_date,
      is_active: Boolean(session_is_active)
    },
    primary_author: authorRes.results[0] ?? null,
    actions: actionRes.results,
    vote_events: voteEvents
  };
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        service: 'LeLegis',
        databaseBound: Boolean(env.DB)
      });
    }

    if (url.pathname === '/api/db-check') {
      if (!env.DB) {
        return json({
          ok: false,
          database: 'not bound',
          error: 'D1 binding DB is missing from the Worker environment.'
        }, 503);
      }

      const result = await env.DB.prepare(
        "SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
      ).first();

      return json({ ok: true, database: 'connected', result });
    }

    if (url.pathname === '/api/bills') {
      if (!env.DB) return json({ ok: false, error: 'Database not bound' }, 503);

      const { results } = await env.DB.prepare(
        `SELECT id, instrument, subject, official_description, official_status,
                normalized_status, act_number, effective_date
           FROM bills
          ORDER BY id DESC
          LIMIT 100`
      ).all();

      return json({ ok: true, bills: results });
    }

    const billDetailMatch = url.pathname.match(/^\/api\/bills\/([^/]+)\/?$/);
    if (billDetailMatch && request.method === 'GET') {
      if (!env.DB) return json({ ok: false, error: 'Database not bound' }, 503);

      let instrument;
      try {
        instrument = decodeURIComponent(billDetailMatch[1]).trim().toUpperCase();
      } catch {
        return json({ ok: false, error: 'Invalid instrument' }, 400);
      }

      if (!/^(HB|SB|HCR|SCR|HR|SR)\d+$/.test(instrument)) {
        return json({ ok: false, error: 'Invalid instrument' }, 400);
      }

      try {
        await refreshBillForRequest(env.DB, instrument);
        const bill = await getBillDetail(env, instrument);
        if (!bill) return json({ ok: false, error: 'Bill not found', instrument }, 404);
        return json({ ok: true, bill });
      } catch (err) {
        return json({
          ok: false,
          error: 'Failed to load bill',
          detail: String(err?.message ?? err)
        }, 500);
      }
    }

    return new Response(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>LeLegis</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin:0; font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:#dfe8e6; color:#091523; }
    main { max-width:820px; margin:0 auto; padding:64px 24px; }
    .card { background:#f8faf9; border:1px solid rgba(9,21,35,.08); border-radius:28px; padding:36px; box-shadow:0 16px 50px rgba(9,21,35,.06); }
    .eyebrow { color:#0a8b83; font-weight:800; letter-spacing:.12em; text-transform:uppercase; font-size:12px; }
    h1 { font-family:Georgia,"Times New Roman",serif; font-size:clamp(48px,8vw,76px); margin:10px 0 12px; line-height:.95; }
    p { color:#536273; font-size:18px; line-height:1.6; }
    a { color:#0a8b83; font-weight:700; }
  </style>
</head>
<body>
  <main>
    <section class="card">
      <div class="eyebrow">Le Comrade Civic Tech</div>
      <h1>LeLegis</h1>
      <p>Louisiana House and Senate legislation, votes, lawmakers, and constituent alignment.</p>
      <p><a href="/api/health">API health</a> · <a href="/api/db-check">Database check</a> · <a href="/api/bills">Bills API</a> · <a href="/api/bills/HB844">Bill detail (HB844)</a></p>
    </section>
  </main>
</body>
</html>`, {
      headers: { 'content-type': 'text/html; charset=utf-8' }
    });
  },

  async scheduled(_controller, env, ctx) {
    if (!env.DB) return;
    ctx.waitUntil(syncActiveSessions(env.DB));
  }
};
