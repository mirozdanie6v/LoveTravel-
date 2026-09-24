PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS demo_group_departures (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  tour_id TEXT NOT NULL,
  tour_title TEXT NOT NULL,
  departure_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'gathering',
  target_people INTEGER,
  min_people INTEGER,
  created_by TEXT NOT NULL DEFAULT 'tourist',
  cancellation_reason TEXT NOT NULL DEFAULT '',
  data_status TEXT NOT NULL DEFAULT 'demoInput',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_demo_group_departures_session_tour_date
  ON demo_group_departures(session_id, tour_id, departure_date, status);

CREATE TABLE IF NOT EXISTS demo_group_members (
  id TEXT PRIMARY KEY,
  departure_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  contact TEXT NOT NULL,
  telegram_username TEXT NOT NULL DEFAULT '',
  adults INTEGER NOT NULL DEFAULT 1,
  children_json TEXT NOT NULL DEFAULT '[]',
  seats INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (departure_id) REFERENCES demo_group_departures(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_demo_group_members_departure
  ON demo_group_members(departure_id, status, created_at);

CREATE TABLE IF NOT EXISTS demo_refund_cases (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  order_id TEXT,
  group_departure_id TEXT,
  reason TEXT NOT NULL,
  rule_code TEXT NOT NULL,
  retention_percent INTEGER,
  requested_refund_minor INTEGER,
  provider_refund_id TEXT,
  status TEXT NOT NULL DEFAULT 'manager_review',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (group_departure_id) REFERENCES demo_group_departures(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_demo_refund_cases_session_status
  ON demo_refund_cases(session_id, status, created_at DESC);
