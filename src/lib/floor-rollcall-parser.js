function cleanLines(text = '') {
  return String(text)
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function parseTotal(line) {
  const m = line.match(/^Total\s*--\s*(\d+)$/i);
  return m ? Number(m[1]) : null;
}

function parseDate(value) {
  const m = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${String(Number(m[1])).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

function sectionName(line) {
  const upper = line.toUpperCase();
  if (upper === 'YEAS' || upper === 'YEA') return 'YEA';
  if (upper === 'NAYS' || upper === 'NAY') return 'NAY';
  if (upper === 'ABSENT') return 'ABSENT';
  if (upper === 'PRESENT') return 'PRESENT';
  if (upper === 'NOT VOTING') return 'NOT_VOTING';
  return null;
}

export function parseFloorRollCallText(text) {
  const lines = cleanLines(text);

  const sequence = Number(lines.find(l => /^Sequence:/i.test(l))?.match(/Sequence:\s*(\d+)/i)?.[1] ?? 0) || null;
  const dateLine = lines.find(l => /^Date:/i.test(l));
  const timeLine = lines.find(l => /^Time:/i.test(l));
  const date = dateLine ? parseDate(dateLine) : null;
  const time = timeLine?.replace(/^Time:\s*/i, '').trim() ?? null;

  const billLineIndex = lines.findIndex(l => /^(HB|SB|HCR|SCR|HR|SR)\s+\d+\s+BY\b/i.test(l));
  const billLine = billLineIndex >= 0 ? lines[billLineIndex] : null;
  const instrument = billLine?.match(/^(HB|SB|HCR|SCR|HR|SR)\s+(\d+)/i);
  const normalizedInstrument = instrument ? `${instrument[1].toUpperCase()}${Number(instrument[2])}` : null;

  const motion = billLineIndex >= 0
    ? (lines.slice(billLineIndex + 1).find(l => !/^Date:|^Time:|^ROLL CALL$/i.test(l)) ?? null)
    : null;

  const members = [];
  const totals = { YEA: null, NAY: null, ABSENT: null, PRESENT: null, NOT_VOTING: null };
  let current = null;

  for (const line of lines) {
    const section = sectionName(line);
    if (section) {
      current = section;
      continue;
    }

    const total = parseTotal(line);
    if (total != null && current) {
      totals[current] = total;
      current = null;
      continue;
    }

    if (!current) continue;
    if (/^The roll was called/i.test(line)) continue;

    members.push({ label: line, vote: current });
  }

  return {
    sequence_number: sequence,
    instrument: normalizedInstrument,
    motion,
    vote_date: date,
    vote_time: time,
    totals,
    members
  };
}

export function normalizeVoteLabel(label = '') {
  return String(label)
    .replace(/^Mr\.\s+/i, '')
    .replace(/^Mrs\.\s+/i, '')
    .replace(/^Ms\.\s+/i, '')
    .trim();
}

function simple(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s,-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveVoteLabel(rows, label) {
  const normalized = normalizeVoteLabel(label);

  if (/^(Speaker|President)$/i.test(normalized)) {
    return { match: null, reason: 'office_title' };
  }

  let last = normalized;
  let initial = null;

  const comma = normalized.match(/^(.+?),\s*([A-Z])\.?$/i);
  if (comma) {
    last = comma[1].trim();
    initial = comma[2].toLowerCase();
  }

  const candidates = (rows ?? []).filter(row => simple(row.last_name) === simple(last));

  if (initial) {
    const narrowed = candidates.filter(row => simple(row.first_name).startsWith(initial));
    if (narrowed.length === 1) return { match: narrowed[0], reason: null };
    if (narrowed.length > 1) return { match: null, reason: 'ambiguous_initial' };
    return { match: null, reason: 'not_found' };
  }

  if (candidates.length === 1) return { match: candidates[0], reason: null };
  if (candidates.length > 1) return { match: null, reason: 'ambiguous_last_name' };
  return { match: null, reason: 'not_found' };
}
