PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS demo_broadcast_campaigns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  segment TEXT NOT NULL DEFAULT 'all',
  tour_id TEXT,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'prepared',
  recipient_count INTEGER NOT NULL DEFAULT 0,
  deliverable_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT 'demo',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_demo_broadcast_campaigns_session_created
  ON demo_broadcast_campaigns(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS demo_broadcast_recipients (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  customer_key TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  telegram_username TEXT NOT NULL DEFAULT '',
  telegram_chat_id TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'waiting_contact',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES demo_broadcast_campaigns(id) ON DELETE CASCADE,
  UNIQUE(campaign_id, customer_key)
);

CREATE INDEX IF NOT EXISTS idx_demo_broadcast_recipients_campaign_status
  ON demo_broadcast_recipients(campaign_id, delivery_status, created_at);

CREATE TABLE IF NOT EXISTS demo_site_sync_outbox (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'waiting_integration',
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_demo_site_sync_outbox_session_status
  ON demo_site_sync_outbox(session_id, status, created_at);
