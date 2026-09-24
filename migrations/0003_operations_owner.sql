PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS demo_order_operations (
  session_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  assigned_manager TEXT NOT NULL DEFAULT '',
  pickup_note TEXT NOT NULL DEFAULT '',
  internal_note TEXT NOT NULL DEFAULT '',
  last_contact_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, order_id),
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS demo_owner_settings (
  session_id TEXT PRIMARY KEY,
  manager_sla_minutes INTEGER NOT NULL DEFAULT 15,
  manager_notifications INTEGER NOT NULL DEFAULT 1,
  owner_digest TEXT NOT NULL DEFAULT 'Ежедневно',
  sales_focus TEXT NOT NULL DEFAULT 'Премиум экскурсии',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_demo_order_operations_session ON demo_order_operations(session_id, updated_at);
