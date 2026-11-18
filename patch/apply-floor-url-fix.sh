#!/bin/zsh
set -e

python3 - <<'PY'
from pathlib import Path

p = Path("scripts/import-floor-rollcalls.js")
s = p.read_text()

import_line = "import { canonicalLouisianaDocumentUrl } from '../src/lib/louisiana-document-url.js';\n"
if import_line not in s:
    marker = "import { parseFloorRollCallText, resolveVoteLabel } from '../src/lib/floor-rollcall-parser.js';\n"
    if marker not in s:
        raise SystemExit("Could not find floor-rollcall parser import")
    s = s.replace(marker, marker + import_line)

old = """async function extractPdfText(url) {
  const response = await fetch(url, {"""
new = """async function extractPdfText(url) {
  const canonicalUrl = canonicalLouisianaDocumentUrl(url);
  const response = await fetch(canonicalUrl, {"""
if old not in s:
    raise SystemExit("Could not find extractPdfText()")
s = s.replace(old, new)

old = """  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);"""
new = """  if (!response.ok) {
    throw new Error(`${canonicalUrl} returned HTTP ${response.status} (stored URL: ${url})`);
  }"""
if old not in s:
    raise SystemExit("Could not find HTTP error line")
s = s.replace(old, new)

p.write_text(s)
print("Patched floor vote URL canonicalization.")
PY

node --test tests/louisiana-document-url.test.js
