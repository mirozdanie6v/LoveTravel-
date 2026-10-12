CREATE TABLE IF NOT EXISTS travel_guest_sessions (
  token_hash TEXT PRIMARY KEY,
  default_conversation_id TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS travel_conversations (
  session_id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  client_id TEXT NOT NULL,
  revoked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_travel_conversations_owner ON travel_conversations(owner_hash);
CREATE INDEX IF NOT EXISTS idx_travel_conversations_age ON travel_conversations(updated_at);
