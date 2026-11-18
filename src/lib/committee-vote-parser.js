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

function textStream(html = '') {
  return decodeEntities(
    String(html)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDateTime(value = '') {
  const m = String(value).match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}:\d{2}:\d{2}\s+[AP]M)/i
  );
  if (!m) return { date: null, time: null };
  return {
    date: `${m[3]}-${String(Number(m[1])).padStart(2,'0')}-${String(Number(m[2])).padStart(2,'0')}`,
    time: m[4].toUpperCase()
  };
}

function parseMemberVotes(block = '') {
  const clean = String(block)
    .replace(/\|\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const out = [];
  const re = /([A-ZÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9"'’.\- ]*(?:,\s*(?:Jr\.?|Sr\.?|II|III|IV|V),?)?(?:,\s*[A-ZÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9"'’.\- ]*)?)\s+(Yea|Nay|Absent|Present)\b/gi;
  let m;

  while ((m = re.exec(clean)) !== null) {
    let label = m[1].trim();

    // If the regex consumed the prior vote token's trailing text, trim to the
    // last plausible comma-delimited Louisiana member name.
    label = label.replace(/^(?:Yea|Nay|Absent|Present)\s+/i, '').trim();

    if (!label || /^Vote$/i.test(label)) continue;

    out.push({
      label,
      vote: m[2].toUpperCase() === 'YEA' ? 'YEA'
        : m[2].toUpperCase() === 'NAY' ? 'NAY'
        : m[2].toUpperCase() === 'ABSENT' ? 'ABSENT'
        : 'PRESENT'
    });
  }

  return out;
}

export function parseCommitteeVotePage(html) {
  const text = textStream(html);

  const chamberMatch = text.match(/\b(House|Senate)\s+Committee\s+on\s+([^|]+?)(?=\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b)/i);
  const chamber = chamberMatch
    ? chamberMatch[1].toUpperCase() === 'HOUSE' ? 'HOUSE' : 'SENATE'
    : /\bHouse Committee on\b/i.test(text) ? 'HOUSE'
    : /\bSenate Committee on\b/i.test(text) ? 'SENATE'
    : null;

  const committeeName = text.match(/\b(?:House|Senate)\s+Committee\s+on\s+(.+?)(?=\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b)/i)?.[0] ?? null;

  const bill = text.match(/\b(HB|SB|HCR|SCR|HR|SR)\s*(\d+)\s+by\s+[A-Z]/i);
  const instrument = bill ? `${bill[1].toUpperCase()}${Number(bill[2])}` : null;

  const motions = [];
  const motionStart = /\bMotion made by:\s*/gi;
  const starts = [];
  let m;

  while ((m = motionStart.exec(text)) !== null) starts.push(m.index);

  for (let idx = 0; idx < starts.length; idx += 1) {
    const start = starts[idx];
    const end = starts[idx + 1] ?? text.length;
    let block = text.slice(start, end);

    // Do not let the next bill/final-action footer leak into this motion.
    block = block.split(/\bFinal action:/i)[0];

    const madeBy = block.match(/\bMotion made by:\s*(.+?)\s+Motion(?:\s*\(Final\))?:/i)?.[1]?.trim() ?? null;
    const motionMatch = block.match(/\bMotion(\s*\(Final\))?:\s*(.+?)\s+Motion date:/i);
    if (!motionMatch) continue;

    const final = Boolean(motionMatch[1]);
    const motionText = motionMatch[2].trim();

    const dt = block.match(/\bMotion date:\s*(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M)/i)?.[1] ?? null;
    const { date, time } = parseDateTime(dt ?? '');

    const voteRaw = block.match(/\bVote:\s*(Without Objection|\d+\s*-\s*\d+)/i)?.[1]?.trim() ?? null;

    let vote_method = null;
    let yea_total = null;
    let nay_total = null;

    if (/without objection/i.test(voteRaw ?? '')) {
      vote_method = 'WITHOUT_OBJECTION';
    } else {
      const totals = voteRaw?.match(/^(\d+)\s*-\s*(\d+)$/);
      if (totals) {
        vote_method = 'ROLL_CALL';
        yea_total = Number(totals[1]);
        nay_total = Number(totals[2]);
      }
    }

    const votePos = block.search(/\bVote:\s*/i);
    let memberBlock = votePos >= 0 ? block.slice(votePos) : '';

    // Remove the Vote label/value before extracting member names.
    memberBlock = memberBlock.replace(/\bVote:\s*(?:Without Objection|\d+\s*-\s*\d+)/i, ' ');

    // Context is the nearest Amendment or bill heading before this motion.
    const prefix = text.slice(Math.max(0, start - 500), start);
    const amendmentMatches = [...prefix.matchAll(/\bAmendment:\s*(.+?)(?=\s+Motion made by:|\s+(?:HB|SB|HCR|SCR|HR|SR)\s*\d+\s+by\b)/gi)];
    const context = amendmentMatches.length
      ? `Amendment: ${amendmentMatches[amendmentMatches.length - 1][1].trim()}`
      : null;

    motions.push({
      motion: final ? `FINAL: ${motionText}` : motionText,
      motion_made_by: madeBy,
      context,
      vote_date: date,
      vote_time: time,
      vote_method,
      yea_total,
      nay_total,
      members: vote_method === 'ROLL_CALL' ? parseMemberVotes(memberBlock) : []
    });
  }

  return {
    chamber,
    committee_name: committeeName,
    instrument,
    motions
  };
}

function normalized(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/["'.]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9, ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveCommitteeMember(rows, label) {
  const source = String(label).trim();
  const parts = source.split(',').map(x => x.trim()).filter(Boolean);

  // Louisiana sometimes formats suffixes as "Egan, Sr., Peter F."
  let last = null;
  let given = null;

  if (parts.length >= 3 && /^(jr|sr|ii|iii|iv|v)\.?$/i.test(parts[1])) {
    last = normalized(parts[0]);
    given = normalized(parts.slice(2).join(' '));
  } else if (parts.length >= 2) {
    last = normalized(parts[0]);
    given = normalized(parts.slice(1).join(' '));
  } else {
    last = normalized(source);
  }

  const candidates = (rows ?? []).filter(r => normalized(r.last_name) === last);

  if (!given) {
    return candidates.length === 1
      ? { match: candidates[0], reason: null }
      : { match: null, reason: candidates.length ? 'ambiguous' : 'not_found' };
  }

  if (candidates.length === 1) return { match: candidates[0], reason: null };

  const narrowed = candidates.filter(r => {
    const first = normalized(r.first_name);
    const display = normalized(r.display_name);
    return given.startsWith(first) || display.includes(given) || given.includes(first);
  });

  return narrowed.length === 1
    ? { match: narrowed[0], reason: null }
    : { match: null, reason: narrowed.length ? 'ambiguous' : 'not_found' };
}
