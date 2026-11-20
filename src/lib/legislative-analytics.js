import { isCeremonialResolution } from './ceremonial-resolutions.js';

const CHAMBERS = new Set(['ALL', 'HOUSE', 'SENATE']);
const TYPES = new Set(['ALL', 'HB', 'SB', 'HR', 'SR', 'HCR', 'SCR']);
const countBy = (items, key) => {
  const counts = new Map();
  for (const item of items) {
    const value = String(key(item) ?? '').trim() || 'Not classified';
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

const partyGroup = value => {
  const party = String(value ?? '').trim().toUpperCase();
  if (['D', 'DEM', 'DEMOCRAT', 'DEMOCRATIC'].includes(party)) return 'Democrats';
  if (['R', 'REP', 'REPUBLICAN'].includes(party)) return 'Republicans';
  if (['I', 'IND', 'INDEPENDENT'].includes(party)) return 'Independents';
  return party ? 'Other parties' : 'Not recorded';
};

export async function getLegislativeAnalytics(env, input = {}, { preview = false } = {}) {
  const sessions = (await env.DB.prepare(
    `SELECT s.id, s.session_code, s.session_name, s.start_date,
            (SELECT COUNT(*) FROM bills b WHERE b.session_id=s.id) AS indexed_bills
       FROM sessions s ORDER BY s.start_date DESC, s.id DESC`
  ).all()).results ?? [];
  const selected = sessions.find(s => s.session_code === input.session)
    ?? sessions.find(s => Number(s.indexed_bills) > 0)
    ?? sessions[0];
  const chamber = CHAMBERS.has(String(input.chamber ?? '').toUpperCase()) ? String(input.chamber).toUpperCase() : 'ALL';
  const type = TYPES.has(String(input.type ?? '').toUpperCase()) ? String(input.type).toUpperCase() : 'ALL';
  const filters = { session: selected?.session_code ?? '', chamber, type };
  if (!selected) return { sessions, filters, total: 0, subjects: [], outcomes: [], authors: [], months: [], chambers: [], parties: [] };

  // The same eligibility rule as the main bill tracker; don't change stored records.
  const all = (await env.DB.prepare(`
    SELECT id, instrument, subject, official_description, normalized_status,
           origin_chamber, instrument_type
    FROM bills
    WHERE session_id=?1 AND (?2='ALL' OR origin_chamber=?2)
      AND (?3='ALL' OR instrument_type=?3)
  `).bind(selected.id, chamber, type).all()).results ?? [];
  const bills = all.filter(b => !isCeremonialResolution(b));
  const ids = new Set(bills.map(b => b.id));
  const [actionResult, authorResult] = await Promise.all([
    env.DB.prepare(`
      SELECT ba.bill_id, ba.action_date
      FROM bill_actions ba JOIN bills b ON b.id=ba.bill_id
      WHERE b.session_id=?1 AND (?2='ALL' OR b.origin_chamber=?2)
        AND (?3='ALL' OR b.instrument_type=?3)
        AND ba.action_date IS NOT NULL
    `).bind(selected.id, chamber, type).all(),
    preview ? Promise.resolve({ results: [] }) : env.DB.prepare(`
      SELECT ba.bill_id, l.id AS legislator_id, l.display_name, l.chamber, l.party
      FROM bill_authors ba
      JOIN bills b ON b.id=ba.bill_id
      JOIN legislators l ON l.id=ba.legislator_id
      WHERE b.session_id=?1 AND (?2='ALL' OR b.origin_chamber=?2)
        AND (?3='ALL' OR b.instrument_type=?3)
        AND ba.author_type='PRIMARY'
    `).bind(selected.id, chamber, type).all()
  ]);
  const months = countBy((actionResult.results ?? [])
    .filter(a => ids.has(a.bill_id) && /^\d{4}-\d{2}-\d{2}/.test(String(a.action_date)))
    .map(a => ({ month: String(a.action_date).slice(0, 7) })), a => a.month)
    .sort((a, b) => a.label.localeCompare(b.label));
  const authors = [];
  const primaryParties = new Map();
  if (!preview) {
    const grouped = new Map();
    for (const a of (authorResult.results ?? [])) {
      if (!ids.has(a.bill_id)) continue;
      if (!primaryParties.has(a.bill_id)) primaryParties.set(a.bill_id, new Set());
      primaryParties.get(a.bill_id).add(partyGroup(a.party));
      const key = a.legislator_id;
      if (!grouped.has(key)) grouped.set(key, { id: key, name: a.display_name, chamber: a.chamber, count: 0 });
      grouped.get(key).count++;
    }
    authors.push(...[...grouped.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)));
  }
  // Count each instrument exactly once. Unknown and mixed authorship stay separate.
  const partyCounts = new Map([['Democrats', 0], ['Republicans', 0]]);
  if (!preview) {
    for (const bill of bills) {
      const groups = primaryParties.get(bill.id);
      const label = !groups?.size ? 'Not recorded'
        : groups.size === 1 ? [...groups][0] : 'Multiple parties';
      partyCounts.set(label, (partyCounts.get(label) ?? 0) + 1);
    }
  }
  const parties = [...partyCounts].map(([label, count]) => ({ label, count }))
    .filter(row => row.count > 0 || ['Democrats', 'Republicans'].includes(row.label));
  return {
    sessions, filters, total: bills.length,
    subjects: countBy(bills, b => b.subject),
    outcomes: countBy(bills, b => b.normalized_status),
    chambers: countBy(bills, b => b.origin_chamber),
    parties,
    authors, months
  };
}
