PRAGMA foreign_keys = ON;

ALTER TABLE user_settings ADD COLUMN house_district INTEGER;
ALTER TABLE user_settings ADD COLUMN senate_district INTEGER;

CREATE TABLE IF NOT EXISTS user_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  bill_id INTEGER NOT NULL REFERENCES bills (id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0 AND length(body) <= 4000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_comments_user ON user_comments (user_id);
CREATE INDEX IF NOT EXISTS idx_user_comments_bill ON user_comments (bill_id);

CREATE TABLE IF NOT EXISTS comment_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL REFERENCES user_comments (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes (comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user ON comment_likes (user_id);
