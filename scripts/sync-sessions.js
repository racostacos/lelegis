import { discoverSessionLinks, parseSessionPage, activeOn } from '../src/lib/session-parser.js';
import { runD1SqlFile, sqlString } from '../src/lib/d1-cli.js';

const HOME = 'https://www.legis.la.gov/legis/';

async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'LeLegis/0.1 (+https://legis.le-comrade.org)',
      accept: 'text/html,application/xhtml+xml'
    }
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

async function main() {
  const home = await fetchHtml(HOME);
  const links = discoverSessionLinks(home);

  if (!links.length) throw new Error('No Louisiana session links found.');

  const sessions = [];
  for (const link of links.slice(0, 12)) {
    const html = await fetchHtml(link.href);
    sessions.push(parseSessionPage(html, link.session_code));
  }

  const today = new Date().toISOString().slice(0,10);
  const sql = [
    `UPDATE sessions SET is_active = 0, updated_at = CURRENT_TIMESTAMP;`
  ];

  for (const s of sessions) {
    const active = activeOn(s, today) ? 1 : 0;

    sql.push(`
INSERT INTO sessions (
  session_code, session_name, session_type, start_date, end_date, is_active, source_url
) VALUES (
  ${sqlString(s.session_code)},
  ${sqlString(s.session_name)},
  ${sqlString(s.session_type)},
  ${sqlString(s.start_date)},
  ${sqlString(s.end_date)},
  ${active},
  ${sqlString(`https://www.legis.la.gov/legis/SessionInfo/SessionInfo_${s.session_code}.aspx`)}
)
ON CONFLICT(session_code) DO UPDATE SET
  session_name = excluded.session_name,
  session_type = excluded.session_type,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  is_active = excluded.is_active,
  source_url = excluded.source_url,
  updated_at = CURRENT_TIMESTAMP;`);
  }

  runD1SqlFile(sql.join('\n'), 'lelegis-sessions-');

  console.table(sessions.map(s => ({
    code: s.session_code,
    name: s.session_name,
    start: s.start_date,
    end: s.end_date,
    active: activeOn(s, today)
  })));
}

main().catch(error => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
