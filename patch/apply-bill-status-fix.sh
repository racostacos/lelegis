#!/bin/zsh
set -e

python3 - <<'PY'
from pathlib import Path

parser = Path("src/lib/bill-index-parser.js")
s = parser.read_text()

old = r'''  const statusMatch = compact.match(/Current Status:\s*(.+?)(?=\s+(?:Text Image:|Amendments Image:|Digests Image:|Notes Image:|Notices Image:|Votes Image:|Authors Image:|Date Chamber Journal|$))/i);'''
new = r'''  const statusMatch = compact.match(/Current Status:\s*(.+?)(?=\s+(?:Text|Amendments|Digests|Notes|Notices|Votes|Authors)(?:\s+Image:)?\b|\s+Date\s+Chamber\s+Journal\b|$)/i);'''

if old not in s:
    raise SystemExit("ERROR: expected status matcher was not found")

parser.write_text(s.replace(old, new))

tests = Path("tests/bills.test.js")
t = tests.read_text()

anchor = "test('parses a House bill page', () => {\n"
addition = r'''
test('stops status before document sections', () => {
  const html = `
    <html><body>
      <div>HB1 by Representative Jack McFarland |</div>
      <div>APPROPRIATIONS: Provides for the ordinary operating expenses of state government for Fiscal Year 2026-2027</div>
      <div>Current Status: Signed by the Governor - Act 3</div>
      <div>Text</div>
      <div>Amendments</div>
      <div>Digests</div>
      <div>Votes</div>
      <div>Authors</div>
      <div>HB1 Act 3 HB1 Enrolled House Vote on HB 1 FINAL PASSAGE Jack McFarland (primary)</div>
    </body></html>`;

  const result = parseBillInfoPage(
    html,
    'HB1',
    'https://legis.la.gov/legis/BillInfo.aspx?s=26RS&b=HB1'
  );

  assert.equal(result.official_status, 'Signed by the Governor - Act 3');
  assert.equal(result.normalized_status, 'SIGNED');
});

'''
if "stops status before document sections" not in t:
    if anchor not in t:
        raise SystemExit("ERROR: expected test anchor not found")
    t = t.replace(anchor, addition + anchor)

tests.write_text(t)
print("Applied bill status boundary fix.")
PY

npm run test:bills
