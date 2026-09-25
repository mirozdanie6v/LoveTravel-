PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 210000,
  role TEXT NOT NULL CHECK (role IN ('manager', 'admin', 'owner')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  succeeded INTEGER NOT NULL DEFAULT 0 CHECK (succeeded IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_lookup
  ON admin_login_attempts(email, ip_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_customer_profiles (
  session_id TEXT PRIMARY KEY,
  phone TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'Mini App',
  segment TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES admin_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS admin_messages (
  id TEXT PRIMARY KEY,
  booking_id TEXT,
  customer_session_id TEXT,
  channel TEXT NOT NULL DEFAULT 'telegram',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('draft', 'queued', 'sent', 'failed', 'cancelled')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_admin_messages_booking ON admin_messages(booking_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_notification_rules (
  rule_key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  requires_confirmation INTEGER NOT NULL DEFAULT 0 CHECK (requires_confirmation IN (0, 1)),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES admin_users(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO admin_notification_rules(rule_key,title,description,enabled,requires_confirmation) VALUES
  ('trip_day_before','Напоминание о поездке за день','Время, pickup, что взять, контакт менеджера',1,0),
  ('trip_three_hours','Напоминание за 3 часа','Короткое сообщение с временем выезда и местом встречи',1,0),
  ('guide_balance','Остаток к оплате гиду','Только для заказов с депозитом 30%',1,0),
  ('payment_pending','Ждёт оплаты','Через 30 минут после незавершённой оплаты',1,0),
  ('group_confirmed','Группа набралась','Подтверждение участия и подготовка',1,0),
  ('group_cancelled','Группа не набралась','Предложить дату или возврат',1,0),
  ('weather_cancel','Погода / отмена','Администратор сначала проверяет предпросмотр',1,1);

CREATE TABLE IF NOT EXISTS admin_broadcasts (
  id TEXT PRIMARY KEY,
  segment TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'sent', 'failed', 'cancelled')),
  recipient_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_entity
  ON admin_audit_log(entity_type, entity_id, created_at DESC);
