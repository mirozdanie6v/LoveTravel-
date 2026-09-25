CREATE TABLE IF NOT EXISTS ai_conversation_memory (
  session_id TEXT PRIMARY KEY,
  memory_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_conversation_memory_updated_at
  ON ai_conversation_memory(updated_at);
