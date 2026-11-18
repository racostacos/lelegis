-- History-safe legislative memberships + automation state.

CREATE TABLE IF NOT EXISTS legislator_memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  legislator_id INTEGER NOT NULL,
  chamber TEXT NOT NULL,
  district_number INTEGER NOT NULL,
  source_member_id TEXT,
  start_date TEXT,
  end_date TEXT,
  is_current INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(session_id) REFERENCES sessions(id),
  FOREIGN KEY(legislator_id) REFERENCES legislators(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_legislator_memberships_current_seat
  ON legislator_memberships(session_id, chamber, district_number)
  WHERE is_current = 1;

CREATE INDEX IF NOT EXISTS idx_legislator_memberships_member
  ON legislator_memberships(legislator_id, session_id);

CREATE TABLE IF NOT EXISTS sync_state (
  sync_key TEXT PRIMARY KEY,
  sync_value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
