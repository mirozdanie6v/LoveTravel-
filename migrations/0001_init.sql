PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  source_url TEXT,
  data_status TEXT NOT NULL DEFAULT 'verifiedSite',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS destinations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  data_status TEXT NOT NULL DEFAULT 'verifiedSite',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tours (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  direction TEXT NOT NULL,
  category TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1,
  source_url TEXT NOT NULL,
  price_mode TEXT NOT NULL,
  pricing_rules_json TEXT NOT NULL,
  required_fields_json TEXT NOT NULL,
  schedule_mode TEXT NOT NULL,
  pickup TEXT,
  back TEXT,
  description TEXT NOT NULL,
  program_json TEXT NOT NULL,
  included_json TEXT NOT NULL,
  extra_costs_json TEXT NOT NULL,
  what_to_take_json TEXT NOT NULL,
  images_json TEXT NOT NULL,
  badges_json TEXT NOT NULL,
  data_status TEXT NOT NULL DEFAULT 'verifiedSite',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS demo_sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS demo_tour_overrides (
  session_id TEXT NOT NULL,
  tour_id TEXT NOT NULL,
  override_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, tour_id),
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS demo_user_created_tours (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  tour_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS demo_availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  tour_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  label TEXT NOT NULL,
  data_status TEXT NOT NULL DEFAULT 'demoAvailability',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, tour_id, date),
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS demo_promotions (
  session_id TEXT NOT NULL,
  tour_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  value TEXT NOT NULL DEFAULT '',
  data_status TEXT NOT NULL DEFAULT 'demoPromo',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, tour_id),
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS demo_directions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data_status TEXT NOT NULL DEFAULT 'userCreatedDemo',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, name)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  display_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  tour_id TEXT NOT NULL,
  tour_title TEXT NOT NULL,
  selected_date TEXT NOT NULL,
  participants_summary TEXT NOT NULL,
  pricing_snapshot_json TEXT NOT NULL,
  hotel TEXT NOT NULL,
  transfer_minor INTEGER NOT NULL,
  total_minor INTEGER NOT NULL,
  paid_minor INTEGER NOT NULL DEFAULT 0,
  remaining_minor INTEGER NOT NULL,
  payment_choice TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  payment_state TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Новый',
  source TEXT NOT NULL,
  customer TEXT NOT NULL,
  contact TEXT NOT NULL,
  participant_data_json TEXT NOT NULL,
  data_status TEXT NOT NULL DEFAULT 'demoInput',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, idempotency_key),
  UNIQUE(session_id, display_id)
);

CREATE TABLE IF NOT EXISTS order_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  birth_date TEXT,
  passport TEXT,
  child_height INTEGER,
  child_age INTEGER,
  price_minor INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  simulated INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  UNIQUE(session_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source TEXT,
  tour_id TEXT,
  order_id TEXT,
  amount_minor INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  demo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS manager_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
