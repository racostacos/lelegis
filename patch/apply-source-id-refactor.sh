#!/bin/zsh
set -e

python3 - <<'PY'
from pathlib import Path
import json
import re

# 1. legislator-parser.js: add source_member_id extracted from profile URL.
p = Path("src/lib/legislator-parser.js")
s = p.read_text()

needle = """function absoluteUrl(href, baseUrl) {
  try {
    return new URL(decodeEntities(href), baseUrl).toString();
  } catch {
    return null;
  }
}
"""
replacement = needle + """
function sourceMemberId(href) {
  try {
    const url = new URL(decodeEntities(href), 'https://legis.la.gov/');
    const id = url.searchParams.get('ID') ?? url.searchParams.get('id');
    return id && /^\\d+$/.test(id) ? id : null;
  } catch {
    return decodeEntities(href).match(/[?&]ID=(\\d+)/i)?.[1] ?? null;
  }
}
"""
if "function sourceMemberId(" not in s:
    if needle not in s:
        raise SystemExit("Could not find absoluteUrl() in legislator parser")
    s = s.replace(needle, replacement)

old = """    official_id: officialId(chamber, districtNumber),
    first_name: parsedName.firstName,"""
new = """    official_id: officialId(chamber, districtNumber),
    source_member_id: sourceMemberId(anchor.href),
    first_name: parsedName.firstName,"""
if "source_member_id: sourceMemberId(anchor.href)" not in s:
    if old not in s:
        raise SystemExit("Could not find legislator return block")
    s = s.replace(old, new)

p.write_text(s)

# 2. import-legislators.js: persist source_member_id.
p = Path("scripts/import-legislators.js")
s = p.read_text()

old = """  official_id = ${sqlString(m.official_id)},
  first_name = ${sqlString(m.first_name)},"""
new = """  official_id = ${sqlString(m.official_id)},
  source_member_id = ${sqlString(m.source_member_id)},
  first_name = ${sqlString(m.first_name)},"""
if "source_member_id = ${sqlString(m.source_member_id)}" not in s:
    if old not in s:
        raise SystemExit("Could not find legislator UPDATE SQL")
    s = s.replace(old, new)

old = """INSERT INTO legislators (official_id, first_name, last_name, display_name, chamber, district_number, party, email, phone, office_address, photo_url, profile_url, is_active)
SELECT ${sqlString(m.official_id)}, ${sqlString(m.first_name)}, ${sqlString(m.last_name)},"""
new = """INSERT INTO legislators (official_id, source_member_id, first_name, last_name, display_name, chamber, district_number, party, email, phone, office_address, photo_url, profile_url, is_active)
SELECT ${sqlString(m.official_id)}, ${sqlString(m.source_member_id)}, ${sqlString(m.first_name)}, ${sqlString(m.last_name)},"""
if "INSERT INTO legislators (official_id, source_member_id" not in s:
    if old not in s:
        raise SystemExit("Could not find legislator INSERT SQL")
    s = s.replace(old, new)

p.write_text(s)

# 3. bill-detail-sync.js: exact primary author source-ID join and canonical bill URL.
p = Path("src/lib/bill-detail-sync.js")
s = p.read_text()

if "parsePrimaryAuthorSource" not in s:
    s = s.replace(
        "import { parseBillDetails } from './bill-detail-parser.js';",
        "import { parseBillDetails } from './bill-detail-parser.js';\nimport { canonicalBillUrl, parsePrimaryAuthorSource } from './louisiana-source-ids.js';"
    )

# Replace fuzzy author resolution call site with exact source-id resolution.
old = """  if (details.primary_author_text) {
    const author = await resolvePrimaryAuthor(db, bill.origin_chamber, details.primary_author_text);

    if (author) {
      statements.push(
        db.prepare(`DELETE FROM bill_authors WHERE bill_id = ?1 AND author_type = 'PRIMARY'`).bind(bill.id)
      );
      statements.push(
        db.prepare(
          `INSERT INTO bill_authors (bill_id, legislator_id, author_type)
           VALUES (?1, ?2, 'PRIMARY')`
        ).bind(bill.id, author.id)
      );
    }
  }"""

new = """  if (details.primary_author_source?.source_member_id) {
    const author = await db.prepare(
      `SELECT id
         FROM legislators
        WHERE chamber = ?1 AND source_member_id = ?2
        ORDER BY is_active DESC, id DESC
        LIMIT 1`
    ).bind(
      details.primary_author_source.chamber ?? bill.origin_chamber,
      details.primary_author_source.source_member_id
    ).first();

    if (author) {
      statements.push(
        db.prepare(`DELETE FROM bill_authors WHERE bill_id = ?1 AND author_type = 'PRIMARY'`).bind(bill.id)
      );
      statements.push(
        db.prepare(
          `INSERT INTO bill_authors (bill_id, legislator_id, author_type)
           VALUES (?1, ?2, 'PRIMARY')`
        ).bind(bill.id, author.id)
      );
    }
  }"""

if old not in s:
    raise SystemExit("Could not find current primary-author write block")
s = s.replace(old, new)

# Pull official bill ID so canonical URL can be used.
old = """    `SELECT b.id, b.instrument, b.origin_chamber, b.official_status, b.detail_synced_at,
            s.id AS session_id, s.session_code, s.start_date, s.is_active"""
new = """    `SELECT b.id, b.instrument, b.origin_chamber, b.official_bill_id, b.official_status, b.detail_synced_at,
            s.id AS session_id, s.session_code, s.start_date, s.is_active"""
if "b.official_bill_id" not in s.split("export async function refreshBillDetailsForRequest",1)[1].split("FROM bills",1)[0]:
    if old not in s:
        raise SystemExit("Could not find bill detail SELECT")
    s = s.replace(old, new)

old = """  const expandedUrl = `${billInfoUrl(bill.session_code, instrument)}&sbi=y`;"""
new = """  const expandedUrl = bill.official_bill_id
    ? `${canonicalBillUrl(String(bill.official_bill_id))}&sbi=y`
    : `${billInfoUrl(bill.session_code, instrument)}&sbi=y`;"""
if new not in s:
    if old not in s:
        raise SystemExit("Could not find expanded bill URL")
    s = s.replace(old, new)

# Add primary author source to parsed details immediately after parseBillDetails.
old = """  const details = parseBillDetails(html, instrument, defaultYear);

  await writeDetails(db, bill, details);"""
new = """  const details = parseBillDetails(html, instrument, defaultYear);
  details.primary_author_source = parsePrimaryAuthorSource(html, bill.origin_chamber);

  await writeDetails(db, bill, details);"""
if "details.primary_author_source = parsePrimaryAuthorSource" not in s:
    if old not in s:
        raise SystemExit("Could not find detail parsing call")
    s = s.replace(old, new)

p.write_text(s)

# 4. package.json scripts + dependency.
p = Path("package.json")
pkg = json.loads(p.read_text())
scripts = pkg.setdefault("scripts", {})
scripts["sync:source-ids"] = "node scripts/backfill-source-ids.js"
scripts["sync:floor-votes"] = "node scripts/import-floor-rollcalls.js"
scripts["test:source-ids"] = "node --test tests/source-ids.test.js"
scripts["test:floor-votes"] = "node --test tests/floor-rollcall.test.js"
deps = pkg.setdefault("dependencies", {})
deps["pdfjs-dist"] = "^5.4.394"
p.write_text(json.dumps(pkg, indent=2) + "\n")

print("Applied source-ID refactor patches.")
PY

npm install
npm run test:source-ids
npm run test:floor-votes
