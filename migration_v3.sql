CREATE TABLE IF NOT EXISTS user_permissions (
  user_id     TEXT PRIMARY KEY,
  name        TEXT DEFAULT '',
  email       TEXT DEFAULT '',
  provider    TEXT DEFAULT '',
  permissions TEXT DEFAULT '{}',
  status      TEXT DEFAULT 'active',
  created_at  TEXT NOT NULL,
  last_seen   TEXT
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  company      TEXT DEFAULT '',
  phone        TEXT DEFAULT '',
  requested_at TEXT NOT NULL,
  status       TEXT DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_approval_user ON approval_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_requests(status);
