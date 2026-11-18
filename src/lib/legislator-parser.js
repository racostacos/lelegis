const PARTY_MAP = new Map([
  ['republican', 'Republican'],
  ['democrat', 'Democrat'],
  ['independent', 'Independent']
]);

const SUFFIX_RE = /^(?:Jr\.?|Sr\.?|II|III|IV|V)$/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@legis\.la\.gov/i;
const PHONE_RE = /\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}/;

export function decodeEntities(value = '') {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export function stripHtml(value = '') {
  return decodeEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li|tr|td|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function parseListingName(rawName) {
  const source = decodeEntities(stripHtml(rawName)).replace(/\s+/g, ' ').trim();
  const pieces = source.split(',').map((s) => s.trim()).filter(Boolean);

  if (pieces.length < 2) {
    const tokens = source.split(/\s+/).filter(Boolean);
    return {
      displayName: source,
      firstName: tokens[0] ?? null,
      lastName: tokens.length > 1 ? tokens[tokens.length - 1] : null
    };
  }

  let surname = pieces[0];
  let suffix = null;
  let given;

  if (pieces.length >= 3 && SUFFIX_RE.test(pieces[1])) {
    suffix = pieces[1].replace(/\.$/, '');
    given = pieces.slice(2).join(' ');
  } else {
    given = pieces.slice(1).join(' ');

    const surnameTokens = surname.split(/\s+/);
    const surnameTail = surnameTokens[surnameTokens.length - 1];
    if (SUFFIX_RE.test(surnameTail)) {
      suffix = surnameTail.replace(/\.$/, '');
      surname = surnameTokens.slice(0, -1).join(' ');
    }

    const givenTokens = given.split(/\s+/);
    const givenTail = givenTokens[givenTokens.length - 1];
    if (!suffix && SUFFIX_RE.test(givenTail)) {
      suffix = givenTail.replace(/\.$/, '');
      given = givenTokens.slice(0, -1).join(' ');
    }
  }

  const firstToken = given.match(/^([^\s"]+)/)?.[1] ?? null;
  const displayName = [given, surname, suffix].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  return {
    displayName,
    firstName: firstToken,
    lastName: surname || null
  };
}

export function officialId(chamber, districtNumber) {
  const prefix = chamber === 'HOUSE' ? 'H' : chamber === 'SENATE' ? 'S' : null;
  if (!prefix || !Number.isInteger(districtNumber) || districtNumber < 1) {
    throw new Error(`Cannot build official_id for ${chamber} district ${districtNumber}`);
  }
  return `${prefix}${String(districtNumber).padStart(3, '0')}`;
}

function normalizeParty(value) {
  const normalized = value.trim().toLowerCase();
  return PARTY_MAP.get(normalized) ?? 'Other';
}

function normalizePhone(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 10) return value.trim();
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function absoluteUrl(href, baseUrl) {
  try {
    return new URL(decodeEntities(href), baseUrl).toString();
  } catch {
    return null;
  }
}

function findMemberAnchors(html, chamber) {
  const anchorRe = /<a\b([^>]*?)href\s*=\s*(["'])(.*?)\2([^>]*)>([\s\S]*?)<\/a>/gi;
  const matches = [];
  let match;
  const profileNeedle = chamber === 'HOUSE' ? /(?:H_Reps\/)?members(?:2)?\?ID=\d+/i : /smembers\?ID=\d+/i;

  while ((match = anchorRe.exec(html)) !== null) {
    const href = decodeEntities(match[3]);
    const name = stripHtml(match[5]);
    if (!profileNeedle.test(href)) continue;
    if (!name || !name.includes(',')) continue;
    matches.push({ index: match.index, end: anchorRe.lastIndex, href, name });
  }
  return matches;
}

function parseBlock(blockHtml, chamber, baseUrl, anchor) {
  const text = stripHtml(blockHtml).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  const districtMatch = text.match(/\bDistrict\s*#?\s*(\d{1,3})\b/i);
  const partyMatch = text.match(/\b(Republican|Democrat|Independent)\b/i);
  const emailMatch = text.match(EMAIL_RE);
  const phoneMatch = text.match(PHONE_RE);

  if (!districtMatch || !partyMatch) return null;

  const districtNumber = Number(districtMatch[1]);
  const party = normalizeParty(partyMatch[1]);
  const email = emailMatch ? emailMatch[0].toLowerCase() : null;
  const phone = phoneMatch ? normalizePhone(phoneMatch[0]) : null;

  let officeAddress = null;
  if (partyMatch && phoneMatch) {
    const start = partyMatch.index + partyMatch[0].length;
    const end = phoneMatch.index;
    if (end > start) {
      officeAddress = text.slice(start, end)
        .replace(/^\s*District\s*#?\s*\d{1,3}\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim() || null;
    }
  }

  const parsedName = parseListingName(anchor.name);

  return {
    official_id: officialId(chamber, districtNumber),
    first_name: parsedName.firstName,
    last_name: parsedName.lastName,
    display_name: parsedName.displayName,
    chamber,
    district_number: districtNumber,
    party,
    email,
    phone,
    office_address: officeAddress,
    photo_url: null,
    profile_url: absoluteUrl(anchor.href, baseUrl),
    is_active: 1
  };
}

export function parseLegislatorListing(html, { chamber, baseUrl }) {
  if (!['HOUSE', 'SENATE'].includes(chamber)) throw new Error(`Unsupported chamber: ${chamber}`);
  const anchors = findMemberAnchors(html, chamber);
  const members = [];

  for (let i = 0; i < anchors.length; i += 1) {
    const current = anchors[i];
    const next = anchors[i + 1];
    const blockEnd = next ? next.index : Math.min(html.length, current.end + 5000);
    const block = html.slice(current.index, blockEnd);
    const member = parseBlock(block, chamber, baseUrl, current);
    if (member) members.push(member);
  }

  return members;
}

export function validateLegislators(houseMembers, senateMembers) {
  const errors = [];

  function validateChamber(members, chamber, expectedCount, maxDistrict) {
    if (members.length !== expectedCount) {
      errors.push(`${chamber}: expected ${expectedCount} members, found ${members.length}`);
    }

    const seen = new Map();
    for (const member of members) {
      const key = `${member.chamber}:${member.district_number}`;
      seen.set(member.district_number, (seen.get(member.district_number) ?? 0) + 1);
      if (member.chamber !== chamber) errors.push(`${key}: wrong chamber`);
      if (!member.display_name) errors.push(`${key}: missing display_name`);
      if (!member.party) errors.push(`${key}: missing party`);
      if (!member.profile_url) errors.push(`${key}: missing profile_url`);
      if (!member.last_name) errors.push(`${key}: missing last_name`);
    }

    for (let district = 1; district <= maxDistrict; district += 1) {
      const count = seen.get(district) ?? 0;
      if (count === 0) errors.push(`${chamber}: missing district ${district}`);
      if (count > 1) errors.push(`${chamber}: duplicate district ${district}`);
    }
  }

  validateChamber(houseMembers, 'HOUSE', 105, 105);
  validateChamber(senateMembers, 'SENATE', 39, 39);

  if (errors.length) {
    const error = new Error(`Legislator validation failed:\n${errors.map((e) => `- ${e}`).join('\n')}`);
    error.validationErrors = errors;
    throw error;
  }

  return { house: 105, senate: 39, total: 144 };
}
