PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS favorites (
  session_id TEXT NOT NULL,
  tour_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, tour_id),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS travelers (
  session_id TEXT NOT NULL,
  traveler_key TEXT NOT NULL,
  role TEXT NOT NULL,
  label TEXT NOT NULL,
  full_name TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  primary_flag INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, traveler_key),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  tour_id TEXT NOT NULL,
  title TEXT NOT NULL,
  trip_date TEXT NOT NULL,
  trip_time TEXT,
  status TEXT NOT NULL,
  paid TEXT NOT NULL,
  rest TEXT NOT NULL,
  total TEXT NOT NULL,
  booking_type TEXT NOT NULL,
  receipt TEXT NOT NULL,
  paid_at TEXT,
  people TEXT,
  image TEXT,
  rules TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_bookings_session_created ON bookings(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_tours (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
