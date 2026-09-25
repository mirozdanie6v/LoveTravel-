PRAGMA foreign_keys = ON;

/* Shared demo CRM layer: departures created by staff must be visible in the
   Mini App, admin workspace and director dashboard from the same D1 record. */
CREATE TABLE IF NOT EXISTS admin_departures (
  id TEXT PRIMARY KEY,
  tour_id TEXT NOT NULL,
  title TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  trip_date TEXT NOT NULL,
  trip_time TEXT NOT NULL DEFAULT '',
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity > 0),
  min_people INTEGER NOT NULL DEFAULT 1 CHECK (min_people > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'almost_full', 'full', 'cancelled')),
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_departures_date
  ON admin_departures(trip_date, trip_time, status);
CREATE INDEX IF NOT EXISTS idx_admin_departures_tour
  ON admin_departures(tour_id, trip_date);

CREATE TABLE IF NOT EXISTS admin_demo_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_demo_events_created
  ON admin_demo_events(created_at DESC);
