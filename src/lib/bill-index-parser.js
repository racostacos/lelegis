const ENTITY_MAP = new Map([
  ['nbsp', ' '],
  ['amp', '&'],
  ['quot', '"'],
  ['apos', "'"],
  ['lt', '<'],
  ['gt', '>']
]);

export function decodeEntities(value = '') {
  return value
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITY_MAP.get(name.toLowerCase()) ?? whole);
}

export function stripHtml(value = '') {
  return decodeEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:div|p|li|tr|td|th|h[1-6]|option|section)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function normalizeStatus(status = '') {
  const s = status.toLowerCase();

  if (s.includes('signed by the governor')) return 'SIGNED';
  if (s.includes('became law without') || s.includes('became law w/o')) return 'ENACTED';
  if (s.includes('veto')) return 'VETOED';
  if (s.includes('withdrawn')) return 'WITHDRAWN';
  if (s.includes('substitute adopted') || s.includes('became hb') || s.includes('became sb')) return 'SUBSTITUTED';
  if (s.includes('rejected')) return 'REJECTED';
  if (s.includes('sent to the secretary of state')) return 'ADOPTED';
  if (s.includes('subject to call')) return 'SUBJECT_TO_CALL';
  if (s.includes('finally passed') || s.includes('enrolled')) return 'PASSED';
  if (s.includes('pending')) return 'PENDING';
  return 'ACTIVE';
}

export function instrumentParts(instrument) {
  const match = String(instrument).trim().toUpperCase().match(/^(HB|SB|HCR|SCR|HR|SR)(\d+)$/);
  if (!match) throw new Error(`Invalid legislative instrument: ${instrument}`);

  const instrumentType = match[1];
  const billNumber = Number(match[2]);
  const originChamber = instrumentType.startsWith('H') ? 'HOUSE' : 'SENATE';

  return { instrument: `${instrumentType}${billNumber}`, instrumentType, billNumber, originChamber };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseBillInfoPage(html, instrument, sourceUrl) {
  const parts = instrumentParts(instrument);
  const text = stripHtml(html);
  const compact = text.replace(/\s+/g, ' ').trim();
  const escaped = escapeRegex(parts.instrument);

  const heading = compact.match(new RegExp(`(?:^|\\s)${escaped}\\s+by\\s+(.+?)(?=\\s+\\||\\s{2,}|\\s+[A-Z][A-Z0-9/&'(). -]{1,80}:)`));
  const hasInstrumentHeading = new RegExp(`(?:^|\\s)${escaped}\\s+by\\s+`, 'i').test(compact);
  const statusMatch = compact.match(/Current Status:\s*(.+?)(?=\s+(?:Text|Amendments|Digests|Notes|Notices|Votes|Authors)(?:\s+Image:)?\b|\s+Date\s+Chamber\s+Journal\b|$)/i);

  if (!hasInstrumentHeading || !statusMatch) return null;

  const headingIndex = compact.search(new RegExp(`(?:^|\\s)${escaped}\\s+by\\s+`, 'i'));
  const statusIndex = compact.search(/Current Status:/i);
  const between = headingIndex >= 0 && statusIndex > headingIndex
    ? compact.slice(headingIndex, statusIndex)
    : compact;

  const descriptionMatches = [...between.matchAll(/\b([A-Z][A-Z0-9/&'(). -]{1,80}):\s+(.+?)(?=(?:\s+[A-Z][A-Z0-9/&'(). -]{1,80}:)|$)/g)];
  const descriptionMatch = descriptionMatches.at(-1);
  if (!descriptionMatch) return null;

  const subject = descriptionMatch[1].replace(/\s+/g, ' ').trim();
  const officialDescription = descriptionMatch[2]
    .replace(/\s+\|\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const officialStatus = statusMatch[1].replace(/\s+/g, ' ').trim();

  if (!subject || !officialDescription || !officialStatus) return null;

  return {
    official_bill_id: null,
    ...parts,
    subject,
    official_description: officialDescription,
    official_status: officialStatus,
    normalized_status: normalizeStatus(officialStatus),
    source_url: sourceUrl,
    primary_author_text: heading?.[1]?.replace(/\s+/g, ' ').trim() ?? null
  };
}

export function validateBillIndex(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('Bill index validation failed: no instruments were discovered');
  }

  const errors = [];
  const seen = new Set();

  for (const record of records) {
    const key = record.instrument;
    if (seen.has(key)) errors.push(`duplicate instrument ${key}`);
    seen.add(key);

    if (!/^(HB|SB|HCR|SCR|HR|SR)\d+$/.test(record.instrument)) errors.push(`${key}: invalid instrument`);
    if (!['HOUSE', 'SENATE'].includes(record.originChamber)) errors.push(`${key}: invalid origin chamber`);
    if (!record.subject) errors.push(`${key}: missing subject`);
    if (!record.official_description) errors.push(`${key}: missing description`);
    if (!record.official_status) errors.push(`${key}: missing status`);
    if (!record.source_url) errors.push(`${key}: missing source URL`);
  }

  if (errors.length) {
    throw new Error(`Bill index validation failed:\n${errors.map((e) => `- ${e}`).join('\n')}`);
  }

  return {
    total: records.length,
    byType: Object.fromEntries(
      ['HB', 'SB', 'HCR', 'SCR', 'HR', 'SR'].map((type) => [
        type,
        records.filter((r) => r.instrumentType === type).length
      ])
    )
  };
}
