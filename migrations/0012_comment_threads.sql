PRAGMA foreign_keys = ON;

ALTER TABLE user_comments ADD COLUMN parent_comment_id INTEGER REFERENCES user_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_user_comments_parent
  ON user_comments(parent_comment_id);
