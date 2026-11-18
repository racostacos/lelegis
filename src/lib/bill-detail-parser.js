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
      .replace(/<\/(?:div|p|li|tr|td|th|h[1-6]|option|section|span)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function isoDate(value) {
  const m = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return `${year}-${String(Number(m[1])).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

export function parsePrimaryAuthor(html, instrument) {
  const text = stripHtml(html);
  const compact = text.replace(/\s+/g, ' ').trim();
  const escaped = instrument.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const heading = compact.match(
    new RegExp(`${escaped}\\s+by\\s+(?:(?:Representative|Rep\\.?|Senator|Sen\\.?)\\s+)?(.+?)(?=\\s+\\||\\s+[A-Z][A-Z0-9/&'(). -]{1,80}:)`, 'i')
  );
  if (heading?.[1]) return heading[1].replace(/\s*\(primary\)\s*$/i, '').replace(/\s+/g, ' ').trim();

  const lines = text.split('\n').map(x => x.trim()).filter(Boolean);
  const primaryLine = lines.find(x => /\(primary\)\s*$/i.test(x));
  if (primaryLine) {
    return primaryLine.replace(/\s*\(primary\)\s*$/i, '').replace(/^Authors?\s+/i, '').trim();
  }

  return null;
}

function chamber(value='') {
  const v = value.trim().toUpperCase();
  if (v === 'H' || v === 'HOUSE') return 'HOUSE';
  if (v === 'S' || v === 'SENATE') return 'SENATE';
  return null;
}

export function parseActionHistory(html) {
  const lines = stripHtml(html).split('\n').map(x => x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const out = [];
  for (let i=0;i<lines.length;i++) {
    if (!/^\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})$/.test(lines[i])) continue;
    const date = lines[i];
    let ch = null, chAt=-1;
    for (let j=i+1;j<=Math.min(i+4,lines.length-1);j++) {
      ch = chamber(lines[j]);
      if (ch) { chAt=j; break; }
    }
    if (!ch) continue;
    let page = null, action = null;
    for (let j=chAt+1;j<=Math.min(chAt+7,lines.length-1);j++) {
      const x = lines[j];
      if (/^\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})$/.test(x)) break;
      if (!page && /^\d+$/.test(x)) { page=x; continue; }
      if (x.length >= 8 && !/^(Date|Chamber|Journal|Page|Action)$/i.test(x) && !chamber(x)) { action=x; break; }
    }
    if (!action) continue;
    out.push({
      action_date: isoDate(date),
      chamber: ch,
      official_text: action,
      normalized_action: /signed by the governor/i.test(action) ? 'SIGNED' :
        /effective date/i.test(action) ? 'EFFECTIVE_DATE_SET' :
        /reported/i.test(action) ? 'REPORTED' :
        /referred to/i.test(action) ? 'REFERRED_TO_COMMITTEE' :
        /enrolled/i.test(action) ? 'ENROLLED' :
        /prefiled/i.test(action) ? 'PREFILED' : 'OTHER',
      journal_page: page,
      journal_url: null,
      video_url: null,
      source_order: out.length + 1
    });
  }
  return out;
}

export function parseVoteLinks(html) {
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = decodeEntities(m[2]);
    const text = stripHtml(m[3]).replace(/\s+/g,' ').trim();
    if (!/\bvote\b/i.test(text)) continue;
    let url;
    try { url = new URL(href, 'https://www.legis.la.gov/').toString(); } catch { continue; }
    const key = `${text}|${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const seq = text.match(/#(\d+)/)?.[1] ?? null;
    const ch = /^House Vote/i.test(text) ? 'HOUSE' : /^Senate Vote/i.test(text) ? 'SENATE' :
      /\bH-[A-Z&]+\b/i.test(text) ? 'HOUSE' : /\bS-[A-Z&]+\b/i.test(text) ? 'SENATE' : null;
    const committee = text.match(/\b([HS]-[A-Z&]+)\b/i)?.[1]?.toUpperCase() ?? null;
    const dateText = text.match(/\b(\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4}))\b/)?.[1] ?? null;
    const motion = text.match(/\b(?:HB|SB|HCR|SCR|HR|SR)\s*\d+\s+(.+?)\s+\(#\d+\)/i)?.[1]?.trim() ?? null;
    out.push({text,source_url:url,sequence_number:seq?Number(seq):null,chamber:ch,committee_short_name:committee,vote_date:dateText?isoDate(dateText):null,motion});
  }
  return out;
}

function eventFromAction(a) {
  const t = a.official_text;
  const c = t.match(/reported (?:favorably|with amendments)\s*\((\d+)\s*-\s*(\d+)\)/i);
  if (c) return {chamber:a.chamber,event_type:'COMMITTEE',motion:'Committee Vote',sequence_number:null,vote_date:a.action_date,vote_time:null,yea_total:Number(c[1]),nay_total:Number(c[2]),absent_total:null,present_total:null,vote_method:'ROLL_CALL',source_url:null,committee_short_name:null};
  let f = t.match(/yeas?\s+(\d+)\s*,?\s+nays?\s+(\d+)/i);
  if (!f) f = t.match(/vote of\s+(\d+)\s+yeas?\s+and\s+(\d+)\s+nays?/i);
  if (!f) return null;
  return {chamber:a.chamber,event_type:'FLOOR',motion:/concurred/i.test(t)?'CONCUR IN SENATE AMENDMENTS':'FINAL PASSAGE',sequence_number:null,vote_date:a.action_date,vote_time:null,yea_total:Number(f[1]),nay_total:Number(f[2]),absent_total:null,present_total:null,vote_method:'ROLL_CALL',source_url:null,committee_short_name:null};
}

export function deriveVoteEvents(actions, links) {
  const events = actions.map(eventFromAction).filter(Boolean);
  for (const l of links) {
    let match = null;
    if (l.committee_short_name) {
      match = events.find(e => e.event_type==='COMMITTEE' && e.chamber===l.chamber && (!l.vote_date || e.vote_date===l.vote_date));
    } else if (l.sequence_number) {
      match = events.find(e => e.event_type==='FLOOR' && e.chamber===l.chamber && l.motion && e.motion.toLowerCase()===l.motion.toLowerCase());
      if (!match) match = events.find(e => e.event_type==='FLOOR' && e.chamber===l.chamber && !e.source_url && !e.sequence_number);
    }
    if (match) {
      match.source_url=l.source_url; match.sequence_number=l.sequence_number??match.sequence_number; match.motion=l.motion??match.motion; match.committee_short_name=l.committee_short_name??match.committee_short_name;
    } else if (l.chamber && (l.sequence_number || l.committee_short_name)) {
      events.push({chamber:l.chamber,event_type:l.committee_short_name?'COMMITTEE':'FLOOR',motion:l.motion??'Vote',sequence_number:l.sequence_number,vote_date:l.vote_date,vote_time:null,yea_total:null,nay_total:null,absent_total:null,present_total:null,vote_method:'ROLL_CALL',source_url:l.source_url,committee_short_name:l.committee_short_name});
    }
  }
  return events;
}

export function parseBillDetails(html, instrument) {
  const actions = parseActionHistory(html);
  const links = parseVoteLinks(html);
  return { primary_author_text: parsePrimaryAuthor(html,instrument), actions, vote_events: deriveVoteEvents(actions,links) };
}
