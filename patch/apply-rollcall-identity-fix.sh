#!/bin/zsh
set -e

python3 - <<'PY'
from pathlib import Path

p = Path("scripts/import-floor-rollcalls.js")
s = p.read_text()

old = '''function targetEvents() {
  const billFilter = INSTRUMENT
    ? `AND b.instrument = '${INSTRUMENT.replaceAll("'", "''")}'`
    : '';

  return runD1Json(
    `SELECT ve.id, ve.bill_id, ve.chamber, ve.sequence_number, ve.source_url, b.instrument
       FROM vote_events ve
       JOIN bills b ON b.id = ve.bill_id
      WHERE ve.event_type = 'FLOOR'
        AND ve.source_url LIKE '%ViewDocument.aspx?d=%'
        ${billFilter}
      ORDER BY b.id, ve.id`
  );
}'''

new = '''function targetEvents() {
  const billFilter = INSTRUMENT
    ? `AND b.instrument = '${INSTRUMENT.replaceAll("'", "''")}'`
    : '';

  return runD1Json(
    `SELECT ve.id, ve.bill_id, ve.chamber, ve.sequence_number, ve.source_url,
            b.instrument, b.session_id
       FROM vote_events ve
       JOIN bills b ON b.id = ve.bill_id
      WHERE ve.event_type = 'FLOOR'
        AND ve.source_url LIKE '%ViewDocument.aspx?d=%'
        ${billFilter}
      ORDER BY b.id, ve.id`
  );
}

function voteAliases(sessionId, chamber) {
  return runD1Json(
    `SELECT a.vote_label, l.id AS legislator_id, l.display_name
       FROM legislator_vote_aliases a
       JOIN legislators l ON l.id = a.legislator_id
      WHERE a.session_id = ${Number(sessionId)}
        AND a.chamber = '${chamber.replaceAll("'", "''")}'`
  );
}

function exactAlias(aliases, label) {
  const target = String(label).trim().toLowerCase();
  return aliases.find(a => String(a.vote_label).trim().toLowerCase() === target) ?? null;
}'''

if old not in s:
    raise SystemExit("Could not find targetEvents() block")
s = s.replace(old, new)

old = '''  const legislatorsByChamber = new Map();

  for (const event of events) {
    if (!legislatorsByChamber.has(event.chamber)) {
      legislatorsByChamber.set(event.chamber, chamberLegislators(event.chamber));
    }

    const text = await extractPdfText(event.source_url);'''

new = '''  const legislatorsByChamber = new Map();
  const aliasesBySessionChamber = new Map();

  for (const event of events) {
    if (!legislatorsByChamber.has(event.chamber)) {
      legislatorsByChamber.set(event.chamber, chamberLegislators(event.chamber));
    }

    const aliasKey = `${event.session_id}:${event.chamber}`;
    if (!aliasesBySessionChamber.has(aliasKey)) {
      aliasesBySessionChamber.set(
        aliasKey,
        voteAliases(event.session_id, event.chamber)
      );
    }

    const text = await extractPdfText(event.source_url);'''

if old not in s:
    raise SystemExit("Could not find main cache block")
s = s.replace(old, new)

old = '''    const rows = legislatorsByChamber.get(event.chamber);
    const resolved = [];
    const unresolved = [];

    for (const member of parsed.members) {
      const result = resolveVoteLabel(rows, member.label);
      if (result.match) {
        resolved.push({
          legislator_id: result.match.id,
          label: member.label,
          vote: member.vote
        });
      } else {
        unresolved.push({ label: member.label, vote: member.vote, reason: result.reason });
      }
    }'''

new = '''    const rows = legislatorsByChamber.get(event.chamber);
    const aliases = aliasesBySessionChamber.get(`${event.session_id}:${event.chamber}`);
    const resolved = [];
    const unresolved = [];

    for (const member of parsed.members) {
      const alias = exactAlias(aliases, member.label);

      if (alias) {
        resolved.push({
          legislator_id: alias.legislator_id,
          label: member.label,
          vote: member.vote
        });
        continue;
      }

      const result = resolveVoteLabel(rows, member.label);
      if (result.match) {
        resolved.push({
          legislator_id: result.match.id,
          label: member.label,
          vote: member.vote
        });
      } else {
        unresolved.push({ label: member.label, vote: member.vote, reason: result.reason });
      }
    }'''

if old not in s:
    raise SystemExit("Could not find member resolution block")
s = s.replace(old, new)

p.write_text(s)
print("Patched session-aware roll-call aliases.")
PY
