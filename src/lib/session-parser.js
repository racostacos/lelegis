const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

function decode(value='') {
  return String(value)
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isoNamedDate(value) {
  const m = String(value).match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i
  );
  if (!m) return null;
  return `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2,'0')}-${String(Number(m[2])).padStart(2,'0')}`;
}

export function discoverSessionLinks(html) {
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m;

  while ((m = re.exec(html)) !== null) {
    const href = m[2].replace(/&amp;/gi,'&');
    const code = href.match(/SessionInfo_([A-Z0-9]+)\.aspx/i)?.[1]?.toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);

    out.push({
      session_code: code,
      href: new URL(href, 'https://www.legis.la.gov/legis/').toString(),
      label: decode(m[3])
    });
  }

  return out;
}

export function parseSessionPage(html, sessionCode) {
  const text = decode(html);
  const title =
    text.match(new RegExp(`(\\d{4}\\s+(?:Regular|Extraordinary|Special)\\s+(?:Legislative\\s+)?Session)`, 'i'))?.[1] ??
    `${sessionCode} Session`;

  const dateMatches = [...text.matchAll(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/gi
  )].map(m => isoNamedDate(m[0])).filter(Boolean);

  const start_date = dateMatches[0] ?? null;
  const end_date = dateMatches[1] ?? null;

  const session_type =
    /regular/i.test(title) ? 'REGULAR' :
    /extraordinary|special/i.test(title) ? 'SPECIAL' :
    'OTHER';

  return {
    session_code: sessionCode,
    session_name: title.replace(/\s+Legislative\s+/i, ' '),
    session_type,
    start_date,
    end_date
  };
}

export function activeOn(session, isoDate) {
  if (!session.start_date || !session.end_date) return false;
  return isoDate >= session.start_date && isoDate <= session.end_date;
}
