CREATE TABLE IF NOT EXISTS staff_accounts (
  telegram_user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN ('manager','admin','owner')),
  display_name TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_staff_accounts_role_active
  ON staff_accounts(role, active);
