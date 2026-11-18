function decodeEntities(value = '') {
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

function stripHtml(value = '') {
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

function decodeAttr(value = '') {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

export function isoDate(value) {
  const m = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return `${year}-${String(Number(m[1])).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

export function normalizeAction(text = '') {
  const s = text.toLowerCase();
  if (s.includes('prefiled')) return 'PREFILED';
  if (s.includes('signed by the governor')) return 'SIGNED';
  if (s.includes('sent to the governor')) return 'SENT_TO_GOVERNOR';
  if (s.includes('finally passed') && s.includes('senate')) return 'PASSED_SENATE';
  if (s.includes('finally passed') && s.includes('house')) return 'PASSED_HOUSE';
  if (s.includes('reported favorably')) return 'REPORTED_FAVORABLY';
  if (s.includes('referred to')) return 'REFERRED_TO_COMMITTEE';
  if (s.includes('ordered engrossed') || s.includes('engrossed')) return 'ENGROSSED';
  if (s.includes('enrolled')) return 'ENROLLED';
  if (s.includes('scheduled for floor')) return 'SCHEDULED_FOR_FLOOR';
  if (s.includes('received in the senate')) return 'RECEIVED_IN_SENATE';
  if (s.includes('received from the senate')) return 'RETURNED_TO_HOUSE';
  if (s.includes('effective date')) return 'EFFECTIVE_DATE_SET';
  return 'OTHER';
}

export function parsePrimaryAuthor(html, instrument) {
  const compact = stripHtml(html).replace(/\s+/g, ' ').trim();
  const escaped = instrument.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = compact.match(
    new RegExp(`${escaped}\\s+by\\s+(?:(?:Representative|Rep\\.?|Senator|Sen\\.?)\\s+)?(.+?)\\s+\\|`, 'i')
  );
  if (!m) return null;
  return m[1]
    .replace(/\s*\(primary\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

function parseCells(rowHtml) {
  return [...rowHtml.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)]
    .map((m) => stripHtml(m[1]).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function chamberFromCell(value = '') {
  const v = value.trim().toUpperCase();
  if (v === 'H' || v === 'HOUSE') return 'HOUSE';
  if (v === 'S' || v === 'SENATE') return 'SENATE';
  return null;
}

export function parseActionHistory(html) {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const actions = [];

  for (const row of rows) {
    const cells = parseCells(row[1]);
    if (cells.length < 3) continue;

    const dateIndex = cells.findIndex((c) => /^\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})$/.test(c));
    if (dateIndex < 0) continue;

    const chamberIndex = cells.findIndex((c, i) => i > dateIndex && chamberFromCell(c));
    if (chamberIndex < 0) continue;

    let actionText = null;
    let actionIndex = -1;
    for (let i = cells.length - 1; i >= 0; i -= 1) {
      const c = cells[i];
      if (
        c.length >= 8 &&
        !/^\d+$/.test(c) &&
        !/^\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})$/.test(c) &&
        !chamberFromCell(c)
      ) {
        actionText = c;
        actionIndex = i;
        break;
      }
    }

    if (!actionText) continue;

    const journalPage = cells
      .slice(chamberIndex + 1, actionIndex)
      .find((c) => /^\d+$/.test(c)) ?? null;

    actions.push({
      action_date: isoDate(cells[dateIndex]),
      chamber: chamberFromCell(cells[chamberIndex]),
      official_text: actionText,
      normalized_action: normalizeAction(actionText),
      journal_page: journalPage,
      journal_url: null,
      video_url: null,
      source_order: actions.length + 1
    });
  }

  return actions;
}

export function parseVoteLinks(html) {
  const out = [];
  const re = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m;

  while ((m = re.exec(html)) !== null) {
    const href = decodeAttr(m[2]);
    const text = stripHtml(m[3]).replace(/\s+/g, ' ').trim();

    if (!/vote/i.test(text) && !/CommitteeVote\.aspx|ViewDocument\.aspx/i.test(href)) continue;

    let url = null;
    try {
      url = new URL(href, 'https://www.legis.la.gov/').toString();
    } catch {
      continue;
    }

    const seq = text.match(/#(\d+)/)?.[1];
    const chamber =
      /^House Vote/i.test(text) ? 'HOUSE' :
      /^Senate Vote/i.test(text) ? 'SENATE' :
      /\bH-[A-Z&]+\b/i.test(text) ? 'HOUSE' :
      /\bS-[A-Z&]+\b/i.test(text) ? 'SENATE' :
      null;

    const committee = text.match(/\b([HS]-[A-Z&]+)\b/i)?.[1]?.toUpperCase() ?? null;
    const dateText = text.match(/\b(\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4}))\b/)?.[1] ?? null;

    let motion = null;
    const motionMatch = text.match(/\b(?:HB|SB|HCR|SCR|HR|SR)\s*\d+\s+(.+?)\s+\(#\d+\)/i);
    if (motionMatch) motion = motionMatch[1].trim();

    out.push({
      text,
      source_url: url,
      sequence_number: seq ? Number(seq) : null,
      chamber,
      committee_short_name: committee,
      vote_date: dateText ? isoDate(dateText) : null,
      motion
    });
  }

  return out;
}

function floorVoteFromAction(action) {
  const text = action.official_text;

  let totals = text.match(/yeas?\s+(\d+)\s*,?\s+nays?\s+(\d+)/i);
  if (!totals) totals = text.match(/(\d+)\s+yeas?\s+(?:and|,)\s+(\d+)\s+nays?/i);
  if (!totals) return null;

  return {
    chamber: action.chamber,
    event_type: 'FLOOR',
    motion: /final passage/i.test(text) || /finally passed/i.test(text) ? 'Final Passage' : 'Floor Vote',
    sequence_number: null,
    vote_date: action.action_date,
    vote_time: null,
    yea_total: Number(totals[1]),
    nay_total: Number(totals[2]),
    absent_total: null,
    present_total: null,
    vote_method: 'ROLL_CALL',
    source_url: null,
    committee_short_name: null
  };
}

function committeeVoteFromAction(action) {
  const m = action.official_text.match(/reported favorably\s*\((\d+)\s*-\s*(\d+)\)/i);
  if (!m) return null;
  return {
    chamber: action.chamber,
    event_type: 'COMMITTEE',
    motion: 'Favorably',
    sequence_number: null,
    vote_date: action.action_date,
    vote_time: null,
    yea_total: Number(m[1]),
    nay_total: Number(m[2]),
    absent_total: null,
    present_total: null,
    vote_method: 'ROLL_CALL',
    source_url: null,
    committee_short_name: null
  };
}

export function deriveVoteEvents(actions, voteLinks) {
  const events = [];

  for (const action of actions) {
    const event = committeeVoteFromAction(action) ?? floorVoteFromAction(action);
    if (event) events.push(event);
  }

  for (const link of voteLinks) {
    let match = null;

    if (link.committee_short_name) {
      match = events.find((e) =>
        e.event_type === 'COMMITTEE' &&
        e.chamber === link.chamber &&
        (!link.vote_date || e.vote_date === link.vote_date)
      );
    } else if (link.sequence_number) {
      match = events.find((e) =>
        e.event_type === 'FLOOR' &&
        e.chamber === link.chamber
      );
    }

    if (match) {
      match.source_url = link.source_url;
      if (link.sequence_number) match.sequence_number = link.sequence_number;
      if (link.motion) match.motion = link.motion;
      if (link.committee_short_name) match.committee_short_name = link.committee_short_name;
      continue;
    }

    if (link.chamber && (link.sequence_number || link.committee_short_name)) {
      events.push({
        chamber: link.chamber,
        event_type: link.committee_short_name ? 'COMMITTEE' : 'FLOOR',
        motion: link.motion ?? (link.committee_short_name ? 'Committee Vote' : 'Floor Vote'),
        sequence_number: link.sequence_number,
        vote_date: link.vote_date,
        vote_time: null,
        yea_total: null,
        nay_total: null,
        absent_total: null,
        present_total: null,
        vote_method: 'ROLL_CALL',
        source_url: link.source_url,
        committee_short_name: link.committee_short_name
      });
    }
  }

  return events;
}

export function parseBillDetails(html, instrument) {
  const actions = parseActionHistory(html);
  const voteLinks = parseVoteLinks(html);
  return {
    primary_author_text: parsePrimaryAuthor(html, instrument),
    actions,
    vote_events: deriveVoteEvents(actions, voteLinks)
  };
}
