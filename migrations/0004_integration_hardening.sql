PRAGMA foreign_keys = ON;

-- Distinguish real demo-customer orders from seeded backoffice examples.
-- Existing rows become backoffice samples (0); newly created tourist orders are explicitly marked 1.
ALTER TABLE orders ADD COLUMN customer_visible INTEGER NOT NULL DEFAULT 0 CHECK (customer_visible IN (0,1));

-- Session expiry is optional for existing rows and populated/extended by the Worker.
ALTER TABLE demo_sessions ADD COLUMN expires_at TEXT;

-- Promotions can remain display-only, or become functional DEMO discounts.
ALTER TABLE demo_promotions ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'none'
  CHECK (discount_type IN ('none','percent_bps','fixed_minor'));
ALTER TABLE demo_promotions ADD COLUMN discount_value INTEGER NOT NULL DEFAULT 0
  CHECK (discount_value >= 0);

-- Token-independent notification queue. Events are persisted now and can be delivered
-- by Telegram after bot/chat secrets are configured.
CREATE TABLE IF NOT EXISTS notification_outbox (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('manager','owner','customer')),
  event_type TEXT NOT NULL,
  order_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','skipped','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_orders_session_customer_visible
  ON orders(session_id, customer_visible, created_at);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_session_status
  ON notification_outbox(session_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_order
  ON notification_outbox(order_id, created_at);
