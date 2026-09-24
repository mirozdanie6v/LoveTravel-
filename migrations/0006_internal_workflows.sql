PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS demo_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT NOT NULL DEFAULT '{}',
  after_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_demo_audit_session_created ON demo_audit_log(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS demo_order_workflows (
  session_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  operation_type TEXT NOT NULL DEFAULT 'none',
  requested_date TEXT,
  reason TEXT NOT NULL DEFAULT '',
  manager_note TEXT NOT NULL DEFAULT '',
  workflow_status TEXT NOT NULL DEFAULT 'Нет запроса',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(session_id, order_id),
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS demo_customer_records (
  session_id TEXT NOT NULL,
  customer_key TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  manager_note TEXT NOT NULL DEFAULT '',
  task_text TEXT NOT NULL DEFAULT '',
  task_due TEXT,
  task_done INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(session_id, customer_key),
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE
);
