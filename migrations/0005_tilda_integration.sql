PRAGMA foreign_keys = ON;

-- Raw, idempotent ingress for current/future Tilda forms.
-- This does not pretend arbitrary Tilda leads are complete excursion orders: field mapping
-- is finalized only after MAX TOUR chooses which forms/hidden fields should create bookings.
CREATE TABLE IF NOT EXISTS tilda_webhook_inbox (
  id TEXT PRIMARY KEY,
  tranid TEXT NOT NULL UNIQUE,
  formid TEXT,
  referer TEXT,
  name TEXT,
  phone TEXT,
  email TEXT,
  comments TEXT,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','mapped','ignored','failed')),
  mapped_order_id TEXT,
  last_error TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tilda_webhook_inbox_status
  ON tilda_webhook_inbox(status, received_at);
CREATE INDEX IF NOT EXISTS idx_tilda_webhook_inbox_formid
  ON tilda_webhook_inbox(formid, received_at);
