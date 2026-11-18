import { createHash } from 'node:crypto';

export function parseActionDocumentLinks(html, baseUrl, today = new Date()) {
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const dd = String(today.getDate()).padStart(2,'0');
  const todayKey = `${mm}${dd}`;

  const links = [];
  const re = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>/gi;
  let m;

  while ((m = re.exec(html)) !== null) {
    const href = m[2].replace(/&amp;/gi,'&');
    const file = href.match(/\/lastlegs\/([hs])(\d{4})\.pdf/i);
    if (!file) continue;

    links.push({
      chamber: file[1].toLowerCase() === 'h' ? 'HOUSE' : 'SENATE',
      date_key: file[2],
      url: new URL(href, baseUrl).toString()
    });
  }

  const todays = links.filter(x => x.date_key === todayKey);
  if (todays.length) return todays;

  // If today's document has not appeared yet, return nothing rather than
  // repeatedly processing yesterday's final report.
  return [];
}

export function instrumentsFromDailyActionText(text) {
  const found = new Set();
  const re = /\b(HB|SB|HCR|SCR|HR|SR)\s*(\d+)\b/g;
  let m;
  while ((m = re.exec(String(text))) !== null) {
    found.add(`${m[1]}${Number(m[2])}`);
  }
  return [...found].sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}
