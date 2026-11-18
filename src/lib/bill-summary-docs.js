
const BASE = 'https://www.legis.la.gov/legis';

function decodeEntities(value = '') {
  return String(value)
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function stripHtml(value = '') {
  return decodeEntities(
    String(value)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:div|p|li|tr|td|th|h[1-6]|option|section|span|a)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function absoluteUrl(href) {
  try {
    return new URL(decodeEntities(href), `${BASE}/`).toString();
  } catch {
    return null;
  }
}

export function parseBillDocsPage(html, collection = '') {
  const docs = [];
  const seen = new Set();

  // Louisiana BillDocs pages use ordinary anchors for ViewDocument.aspx?d=...
  // This mirrors the anchor parsing style already used by bill-detail-parser.js.
  const re = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m;

  while ((m = re.exec(String(html))) !== null) {
    const href = decodeEntities(m[2]);
    if (!/ViewDocument\.aspx\?/i.test(href)) continue;

    let url;
    try {
      url = new URL(href, `${BASE}/`);
    } catch {
      continue;
    }

    const id = Number(url.searchParams.get('d'));
    if (!Number.isInteger(id) || id <= 0) continue;

    const title = stripHtml(m[3]).replace(/\s+/g, ' ').trim();
    if (!title) continue;

    const canonical = `${BASE}/ViewDocument.aspx?d=${id}`;
    if (seen.has(canonical)) continue;
    seen.add(canonical);

    docs.push({
      id,
      title,
      url: canonical,
      collection
    });
  }

  return docs;
}

export function extractOfficialBillId(html = '') {
  const source = decodeEntities(String(html));

  const patterns = [
    /BillDocs\.aspx\?[^"'<>]*\bi=(\d+)/i,
    /BillInfo\.aspx\?[^"'<>]*\bi=(\d+)/i,
    /\bofficial[_-]?bill[_-]?id["'\s:=]+(\d+)/i
  ];

  for (const re of patterns) {
    const m = source.match(re);
    if (m) return m[1];
  }
  return null;
}

function versionRank(title = '') {
  const t = String(title).toLowerCase();
  if(/\bact\s+\d+\b/.test(t)) return 100;
  if(t.includes('enrolled')) return 90;
  if(t.includes('reengrossed')) return 80;
  if(t.includes('engrossed')) return 70;
  if(t.includes('original')) return 10;
  return 0;
}

function newest(docs = []) {
  return [...docs].sort((a, b) => b.id - a.id)[0] ?? null;
}

function chooseSummaryDocuments(allDocs = []) {
  const byCollection = collection => allDocs.filter(d => d.collection === collection);
  const digests = byCollection('digests');
  const amendments = byCollection('amendments');
  const other = byCollection('other');
  const notes = byCollection('notes');
  const text = byCollection('text');

  const chosen = [];
  const add = doc => {
    if (doc && !chosen.some(x => x.url === doc.url)) chosen.push(doc);
  };

  // 1) Final legislative synthesis, if available.
  add(newest(digests.filter(d => /resume digest/i.test(d.title))));

  // 2) Chamber amendment summaries describe what changed during passage.
  for (const doc of [...digests]
    .filter(d => /summary of (?:house|senate) amendments/i.test(d.title))
    .sort((a, b) => b.id - a.id)) {
    add(doc);
  }

  // 3) Latest substantive digest plus original digest for before/after context.
  const ordinaryDigests = digests.filter(d =>
    /\bdigest\b/i.test(d.title) &&
    !/resume digest/i.test(d.title) &&
    !/summary of .* amendments/i.test(d.title)
  );

  add([...ordinaryDigests].sort((a, b) =>
    versionRank(b.title) - versionRank(a.title) || b.id - a.id
  )[0]);

  add(newest(ordinaryDigests.filter(d => /\boriginal\b/i.test(d.title))));

  // 4) Fiscal/impact notes if Louisiana publishes them for this instrument.
  for (const doc of [...notes, ...other]
    .filter(d => /fiscal|revenue|impact note|actuarial/i.test(d.title))
    .sort((a, b) => b.id - a.id)) {
    add(doc);
  }

  // 5) Veto message matters for enacted bills with vetoes.
  add(newest(other.filter(d => /veto message/i.test(d.title))));

  // 6) Adopted amendments only. Draft amendments are explicitly excluded.
  const adopted = amendments
    .filter(d => /\badopted\b/i.test(d.title) && !/\bdraft\b/i.test(d.title))
    .sort((a, b) => b.id - a.id);
  for (const doc of adopted.slice(0, 3)) add(doc);

  // 7) Ground the summary in final operative text.
  add([...text].sort((a, b) =>
    versionRank(b.title) - versionRank(a.title) || b.id - a.id
  )[0]);

  return chosen.slice(0, 10);
}

async function fetchHtml(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'LeLegis/1.0 (+https://legis.le-comrade.org)',
      accept: 'text/html,application/xhtml+xml'
    }
  });

  const text = await response.text();

  return {
    url,
    status: response.status,
    ok: response.ok,
    final_url: response.url || url,
    content_type: response.headers.get('content-type') || null,
    length: text.length,
    html: text
  };
}

async function resolveOfficialBillId(bill, fetchImpl = fetch) {
  if (bill?.official_bill_id) return String(bill.official_bill_id);

  const candidates = [];
  if (bill?.source_url) candidates.push(bill.source_url);
  if (bill?.instrument && bill?.session?.code) {
    candidates.push(
      `${BASE}/BillInfo.aspx?s=${encodeURIComponent(bill.session.code)}&b=${encodeURIComponent(bill.instrument)}`
    );
  }

  for (const url of [...new Set(candidates)]) {
    try {
      const fetched = await fetchHtml(url, fetchImpl);
      if (!fetched.ok) continue;
      const id = extractOfficialBillId(fetched.html);
      if (id) return id;
    } catch {}
  }

  return null;
}

export async function fetchSummaryDocuments(
  bill,
  fetchImpl = fetch,
  { includeDebug = false } = {}
) {
  const officialBillId = await resolveOfficialBillId(bill, fetchImpl);

  const debug = {
    instrument: bill?.instrument ?? null,
    stored_official_bill_id: bill?.official_bill_id ?? null,
    resolved_official_bill_id: officialBillId,
    collections: []
  };

  if (!officialBillId) {
    return includeDebug ? { documents: [], debug } : [];
  }

  const collections = ['digests', 'amendments', 'other', 'notes', 'text'];
  const allDocs = [];

  for (const collection of collections) {
    const url = `${BASE}/BillDocs.aspx?i=${encodeURIComponent(officialBillId)}&t=${collection}`;

    try {
      const fetched = await fetchHtml(url, fetchImpl);
      const docs = fetched.ok ? parseBillDocsPage(fetched.html, collection) : [];

      allDocs.push(...docs);

      debug.collections.push({
        collection,
        url,
        status: fetched.status,
        final_url: fetched.final_url,
        content_type: fetched.content_type,
        response_length: fetched.length,
        has_view_document: /ViewDocument\.aspx/i.test(fetched.html),
        document_count: docs.length,
        documents: docs.map(({ id, title, url }) => ({ id, title, url }))
      });
    } catch (err) {
      debug.collections.push({
        collection,
        url,
        error: String(err?.message ?? err),
        document_count: 0,
        documents: []
      });
    }
  }

  const documents = chooseSummaryDocuments(allDocs).map(
    ({ title, url, collection }) => ({ title, url, collection })
  );

  debug.selected = documents;

  return includeDebug ? { documents, debug } : documents;
}
