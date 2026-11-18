-- Better Auth core tables + LeLegis user preference tables.
-- Schema follows Better Auth's SQLite/Kysely core schema naming.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL,
  "image" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "expiresAt" DATE NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" DATE,
  "refreshTokenExpiresAt" DATE,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" DATE NOT NULL,
  "createdAt" DATE,
  "updatedAt" DATE
);

CREATE INDEX IF NOT EXISTS idx_auth_session_user ON "session" ("userId");
CREATE INDEX IF NOT EXISTS idx_auth_session_token ON "session" ("token");
CREATE INDEX IF NOT EXISTS idx_auth_account_user ON "account" ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_provider_account ON "account" ("providerId", "accountId");
CREATE INDEX IF NOT EXISTS idx_auth_verification_identifier ON "verification" ("identifier");

CREATE TABLE IF NOT EXISTS user_bill_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  bill_id INTEGER NOT NULL REFERENCES bills (id) ON DELETE CASCADE,
  position TEXT NOT NULL CHECK (position IN ('YES','NO')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, bill_id)
);

CREATE INDEX IF NOT EXISTS idx_user_bill_positions_user
  ON user_bill_positions (user_id);

CREATE INDEX IF NOT EXISTS idx_user_bill_positions_bill
  ON user_bill_positions (bill_id);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  public_profile INTEGER NOT NULL DEFAULT 0,
  public_alignment INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
