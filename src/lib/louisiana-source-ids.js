function decodeEntities(value = '') {
  return String(value)
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function stripHtml(value = '') {
  return decodeEntities(String(value).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractMemberSourceId(href = '') {
  try {
    const url = new URL(decodeEntities(href), 'https://legis.la.gov/');
    const id = url.searchParams.get('ID') ?? url.searchParams.get('id');
    return id && /^\d+$/.test(id) ? id : null;
  } catch {
    const m = String(href).match(/[?&]ID=(\d+)/i);
    return m?.[1] ?? null;
  }
}

export function extractBillSourceId(value = '') {
  const source = decodeEntities(value);
  try {
    const url = new URL(source, 'https://legis.la.gov/');
    const id = url.searchParams.get('i');
    if (id && /^\d+$/.test(id)) return id;
  } catch {}
  return source.match(/[?&]i=(\d+)/i)?.[1] ?? null;
}

export function canonicalBillUrl(officialBillId) {
  if (!officialBillId || !/^\d+$/.test(String(officialBillId))) return null;
  return `https://legis.la.gov/Legis/BillInfo.aspx?i=${officialBillId}`;
}

export function parsePrimaryAuthorSource(html, originChamber = null) {
  const anchorRe = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  const anchors = [];
  let m;

  while ((m = anchorRe.exec(html)) !== null) {
    const href = decodeEntities(m[2]);
    const name = stripHtml(m[3]);
    const sourceMemberId = extractMemberSourceId(href);
    if (!sourceMemberId || !name) continue;

    const tail = html.slice(anchorRe.lastIndex, Math.min(html.length, anchorRe.lastIndex + 160));
    const isPrimary = /\(primary\)/i.test(stripHtml(tail));

    const chamber =
      /house\.louisiana\.gov/i.test(href) ? 'HOUSE' :
      /senate\.la\.gov/i.test(href) ? 'SENATE' :
      originChamber;

    anchors.push({
      source_member_id: sourceMemberId,
      display_name: name.replace(/\s*\(primary\)\s*$/i, '').trim(),
      chamber,
      profile_url: new URL(href, 'https://legis.la.gov/').toString(),
      is_primary: isPrimary
    });
  }

  const exactPrimary = anchors.find(a => a.is_primary && (!originChamber || a.chamber === originChamber));
  if (exactPrimary) return exactPrimary;

  // The heading author is also a direct profile link. Use it only when unique.
  const candidates = anchors.filter(a => !originChamber || a.chamber === originChamber);
  const unique = new Map(candidates.map(a => [`${a.chamber}:${a.source_member_id}`, a]));
  return unique.size === 1 ? [...unique.values()][0] : null;
}

export function parseBillSearchSourceIds(html) {
  const rows = [];
  const seen = new Set();
  const linkRe = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m;

  while ((m = linkRe.exec(html)) !== null) {
    const href = decodeEntities(m[2]);
    const label = stripHtml(m[3]).replace(/\s+/g, '').toUpperCase();
    if (!/^(HB|SB|HCR|SCR|HR|SR)\d+$/.test(label)) continue;

    const officialBillId = extractBillSourceId(href);
    if (!officialBillId) continue;

    const key = `${label}:${officialBillId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      instrument: label,
      official_bill_id: officialBillId,
      source_url: canonicalBillUrl(officialBillId)
    });
  }

  return rows;
}
