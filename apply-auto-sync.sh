#!/bin/zsh
set -e

cp scripts/import-legislators-history-safe.js scripts/import-legislators.js
cp scripts/import-floor-rollcalls-auto.js scripts/import-floor-rollcalls.js

python3 - <<'PY'
from pathlib import Path
import json

p = Path("package.json")
pkg = json.loads(p.read_text())
scripts = pkg.setdefault("scripts", {})
scripts["sync:sessions"] = "node scripts/sync-sessions.js"
scripts["sync:daily-actions"] = "node scripts/sync-daily-actions.js"
scripts["sync:legislators"] = "node scripts/import-legislators.js"
scripts["sync:floor-votes"] = "node scripts/import-floor-rollcalls.js"
scripts["test:auto-sync"] = "node --test tests/session-parser.test.js tests/daily-actions-parser.test.js"
p.write_text(json.dumps(pkg, indent=2) + "\n")
PY

npm install
npm run test:auto-sync
