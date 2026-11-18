#!/bin/zsh
set -e

python3 - <<'PY'
from pathlib import Path
import json

p = Path("package.json")
pkg = json.loads(p.read_text())
pkg.setdefault("scripts", {})["sync:committee-votes"] = "node scripts/import-committee-votes.js"
pkg["scripts"]["test:committee-votes"] = "node --test tests/committee-vote-parser.test.js"
p.write_text(json.dumps(pkg, indent=2) + "\n")

p = Path("scripts/sync-daily-actions.js")
s = p.read_text()

if "function importMissingCommitteeVotes()" not in s:
    marker = """function importMissingFloorVotes() {
  const result = spawnSync(
    'node',
    ['scripts/import-floor-rollcalls.js', '--missing-only'],
    { stdio:'inherit' }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`floor vote importer exited ${result.status}`);
}
"""
    addition = marker + """
function importMissingCommitteeVotes() {
  const result = spawnSync(
    'node',
    ['scripts/import-committee-votes.js', '--missing-only'],
    { stdio:'inherit' }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`committee vote importer exited ${result.status}`);
}
"""
    if marker not in s:
        raise SystemExit("Could not find importMissingFloorVotes() in sync-daily-actions.js")
    s = s.replace(marker, addition)

old = """    console.log('Importing newly discovered floor roll calls...');
    importMissingFloorVotes();

    for (const [key, hash] of pendingState) saveState(key, hash);"""
new = """    console.log('Importing newly discovered floor roll calls...');
    importMissingFloorVotes();

    console.log('Importing newly discovered committee motions...');
    importMissingCommitteeVotes();

    for (const [key, hash] of pendingState) saveState(key, hash);"""

if old not in s:
    raise SystemExit("Could not find floor vote import call in sync-daily-actions.js")
s = s.replace(old, new)
p.write_text(s)
PY

npm install
npm run test:committee-votes
