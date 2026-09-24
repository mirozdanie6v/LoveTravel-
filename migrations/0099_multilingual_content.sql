PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tour_translations (
  tour_id TEXT NOT NULL,
  locale TEXT NOT NULL CHECK(locale IN ('ru','vi')),
  title TEXT NOT NULL,
  direction TEXT NOT NULL,
  category TEXT NOT NULL,
  pickup TEXT,
  back TEXT,
  description TEXT NOT NULL,
  program_json TEXT NOT NULL DEFAULT '[]',
  included_json TEXT NOT NULL DEFAULT '[]',
  extra_costs_json TEXT NOT NULL DEFAULT '[]',
  what_to_take_json TEXT NOT NULL DEFAULT '[]',
  badges_json TEXT NOT NULL DEFAULT '[]',
  pricing_text_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tour_id, locale),
  FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS destination_translations (
  destination_id TEXT NOT NULL,
  locale TEXT NOT NULL CHECK(locale IN ('ru','vi')),
  name TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (destination_id, locale),
  FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE CASCADE
);
