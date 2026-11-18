-- Session-aware roll-call identity aliases.

CREATE TABLE IF NOT EXISTS legislator_vote_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  chamber TEXT NOT NULL,
  vote_label TEXT NOT NULL,
  legislator_id INTEGER NOT NULL,
  alias_type TEXT NOT NULL DEFAULT 'ROLL_CALL',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, chamber, vote_label),
  FOREIGN KEY(session_id) REFERENCES sessions(id),
  FOREIGN KEY(legislator_id) REFERENCES legislators(id)
);

CREATE INDEX IF NOT EXISTS idx_legislator_vote_aliases_lookup
  ON legislator_vote_aliases(session_id, chamber, vote_label);

INSERT INTO legislators (
  official_id, first_name, last_name, display_name,
  chamber, district_number, party, is_active
)
SELECT
  'HIST-26RS-H077-MARK-WRIGHT',
  'Mark', 'Wright', 'Mark Wright',
  'HOUSE', 77, 'Republican', 0
WHERE NOT EXISTS (
  SELECT 1 FROM legislators
  WHERE chamber = 'HOUSE'
    AND lower(last_name) = 'wright'
    AND district_number = 77
);

INSERT INTO legislators (
  official_id, first_name, last_name, display_name,
  chamber, district_number, party, is_active
)
SELECT
  'HIST-26RS-H092-JOSEPH-STAGNI',
  'Joseph', 'Stagni', 'Joseph A. Stagni',
  'HOUSE', 92, 'Republican', 0
WHERE NOT EXISTS (
  SELECT 1 FROM legislators
  WHERE chamber = 'HOUSE'
    AND lower(last_name) = 'stagni'
    AND district_number = 92
);

INSERT INTO legislators (
  official_id, first_name, last_name, display_name,
  chamber, district_number, party, is_active
)
SELECT
  'HIST-26RS-S014-LARRY-SELDERS',
  'Larry', 'Selders', 'Larry Selders',
  'SENATE', 14, 'Democrat', 0
WHERE NOT EXISTS (
  SELECT 1 FROM legislators
  WHERE chamber = 'SENATE'
    AND lower(last_name) = 'selders'
    AND district_number = 14
);

INSERT INTO legislator_vote_aliases (session_id, chamber, vote_label, legislator_id)
SELECT s.id, 'HOUSE', 'Mr. Speaker', l.id
FROM sessions s, legislators l
WHERE s.session_code = '26RS'
  AND l.chamber = 'HOUSE'
  AND l.district_number = 41
  AND lower(l.last_name) = 'devillier'
ON CONFLICT(session_id, chamber, vote_label) DO UPDATE SET
  legislator_id = excluded.legislator_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO legislator_vote_aliases (session_id, chamber, vote_label, legislator_id)
SELECT s.id, 'HOUSE', 'Johnson, T.', l.id
FROM sessions s, legislators l
WHERE s.session_code = '26RS'
  AND l.chamber = 'HOUSE'
  AND l.district_number = 21
  AND lower(l.last_name) = 'johnson'
ON CONFLICT(session_id, chamber, vote_label) DO UPDATE SET
  legislator_id = excluded.legislator_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO legislator_vote_aliases (session_id, chamber, vote_label, legislator_id)
SELECT s.id, 'HOUSE', 'Stagni', l.id
FROM sessions s, legislators l
WHERE s.session_code = '26RS'
  AND l.chamber = 'HOUSE'
  AND l.district_number = 92
  AND lower(l.last_name) = 'stagni'
ON CONFLICT(session_id, chamber, vote_label) DO UPDATE SET
  legislator_id = excluded.legislator_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO legislator_vote_aliases (session_id, chamber, vote_label, legislator_id)
SELECT s.id, 'HOUSE', 'Wright', l.id
FROM sessions s, legislators l
WHERE s.session_code = '26RS'
  AND l.chamber = 'HOUSE'
  AND l.district_number = 77
  AND lower(l.last_name) = 'wright'
ON CONFLICT(session_id, chamber, vote_label) DO UPDATE SET
  legislator_id = excluded.legislator_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO legislator_vote_aliases (session_id, chamber, vote_label, legislator_id)
SELECT s.id, 'SENATE', 'Mr. President', l.id
FROM sessions s, legislators l
WHERE s.session_code = '26RS'
  AND l.chamber = 'SENATE'
  AND l.district_number = 9
  AND lower(l.last_name) = 'henry'
ON CONFLICT(session_id, chamber, vote_label) DO UPDATE SET
  legislator_id = excluded.legislator_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO legislator_vote_aliases (session_id, chamber, vote_label, legislator_id)
SELECT s.id, 'SENATE', 'Selders', l.id
FROM sessions s, legislators l
WHERE s.session_code = '26RS'
  AND l.chamber = 'SENATE'
  AND l.district_number = 14
  AND lower(l.last_name) = 'selders'
ON CONFLICT(session_id, chamber, vote_label) DO UPDATE SET
  legislator_id = excluded.legislator_id,
  updated_at = CURRENT_TIMESTAMP;
