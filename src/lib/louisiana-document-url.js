export function canonicalLouisianaDocumentUrl(input = '') {
  const raw = String(input).trim();
  let url;
  try { url = new URL(raw, 'https://legis.la.gov/'); }
  catch { return raw; }

  const d = url.searchParams.get('d');
  if (/ViewDocument\.aspx$/i.test(url.pathname) && d && /^\d+$/.test(d)) {
    return `https://legis.la.gov/Legis/ViewDocument.aspx?d=${d}`;
  }

  const moi = url.searchParams.get('moi');
  if (/CommitteeVote\.aspx$/i.test(url.pathname) && moi && /^\d+$/.test(moi)) {
    return `https://legis.la.gov/Legis/CommitteeVote.aspx?moi=${moi}`;
  }

  return url.toString();
}
