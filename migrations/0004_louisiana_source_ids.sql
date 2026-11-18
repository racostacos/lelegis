-- Stable Louisiana Legislature source identifiers.
ALTER TABLE legislators ADD COLUMN source_member_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_legislators_source_member
  ON legislators(chamber, source_member_id)
  WHERE source_member_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bills_session_official_bill_id
  ON bills(session_id, official_bill_id)
  WHERE official_bill_id IS NOT NULL;
