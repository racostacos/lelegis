#!/bin/zsh
set -e

python3 - <<'PY'
from pathlib import Path
import json

index = Path("src/index.js")
s = index.read_text()

import_line = "import { refreshBillDetailsForRequest } from './lib/bill-detail-sync.js';\n"
if import_line not in s:
    s = import_line + s

old = """        await refreshBillForRequest(env.DB, instrument);
        const bill = await getBillDetail(env, instrument);"""
new = """        await refreshBillForRequest(env.DB, instrument);
        await refreshBillDetailsForRequest(env.DB, instrument);
        const bill = await getBillDetail(env, instrument);"""

if old not in s:
    raise SystemExit("ERROR: expected bill-detail request block not found in src/index.js")

index.write_text(s.replace(old, new))

pkg = Path("package.json")
data = json.loads(pkg.read_text())
data["scripts"]["test:bill-detail"] = "node --test tests/bill-detail.test.js"
pkg.write_text(json.dumps(data, indent=2) + "\n")

print("Applied lazy bill-detail integration.")
PY

npm run test:bill-detail
