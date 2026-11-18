const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*"
    }
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "LeLegis",
        databaseBound: Boolean(env.DB)
      });
    }

    if (url.pathname === "/api/db-check") {
      if (!env.DB) {
        return json({
          ok: false,
          database: "not bound",
          error: "D1 binding DB is missing from the Worker environment."
        }, 503);
      }

      const result = await env.DB.prepare(
        "SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
      ).first();

      return json({
        ok: true,
        database: "connected",
        result
      });
    }

    if (url.pathname === "/api/bills") {
      if (!env.DB) return json({ ok: false, error: "Database not bound" }, 503);

      const { results } = await env.DB.prepare(
        `SELECT id, instrument, subject, official_description, official_status,
                normalized_status, act_number, effective_date
           FROM bills
          ORDER BY id DESC
          LIMIT 100`
      ).all();

      return json({ ok: true, bills: results });
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
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #dfe8e6;
      color: #091523;
    }
    main { max-width: 820px; margin: 0 auto; padding: 64px 24px; }
    .card {
      background: #f8faf9;
      border: 1px solid rgba(9,21,35,.08);
      border-radius: 28px;
      padding: 36px;
      box-shadow: 0 16px 50px rgba(9,21,35,.06);
    }
    .eyebrow { color: #0a8b83; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; font-size: 12px; }
    h1 { font-family: Georgia, "Times New Roman", serif; font-size: clamp(48px, 8vw, 76px); margin: 10px 0 12px; line-height: .95; }
    p { color: #536273; font-size: 18px; line-height: 1.6; }
    a { color: #0a8b83; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <section class="card">
      <div class="eyebrow">Le Comrade Civic Tech</div>
      <h1>LeLegis</h1>
      <p>Louisiana House and Senate legislation, votes, lawmakers, and constituent alignment.</p>
      <p><a href="/api/health">API health</a> · <a href="/api/db-check">Database check</a> · <a href="/api/bills">Bills API</a></p>
    </section>
  </main>
</body>
</html>`, {
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }
};
