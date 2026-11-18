#!/bin/zsh
set -e

python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/bill-detail-sync.js")
s = p.read_text()

old = """  const hasActions = await db.prepare(
    `SELECT EXISTS(SELECT 1 FROM bill_actions WHERE bill_id = ?1) AS has_actions`
  ).bind(bill.id).first();

  const shouldRefresh =
    !Number(hasActions?.has_actions ?? 0) ||
    !bill.detail_synced_at ||
    (bill.is_active && isStale(bill.detail_synced_at, DETAIL_REFRESH_MINUTES));"""

new = """  const completeness = await db.prepare(
    `SELECT
       EXISTS(SELECT 1 FROM bill_actions WHERE bill_id = ?1) AS has_actions,
       EXISTS(
         SELECT 1 FROM bill_authors
          WHERE bill_id = ?1 AND author_type = 'PRIMARY'
       ) AS has_primary_author,
       act_number,
       effective_date
     FROM bills
     WHERE id = ?1`
  ).bind(bill.id).first();

  const shouldRefresh =
    !Number(completeness?.has_actions ?? 0) ||
    !Number(completeness?.has_primary_author ?? 0) ||
    !completeness?.act_number ||
    !completeness?.effective_date ||
    !bill.detail_synced_at ||
    (bill.is_active && isStale(bill.detail_synced_at, DETAIL_REFRESH_MINUTES));"""

if old not in s:
    raise SystemExit("ERROR: expected completeness block not found")

p.write_text(s.replace(old, new))
print("Patched partial-detail refresh logic.")
PY
