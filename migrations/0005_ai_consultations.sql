PRAGMA foreign_keys = ON;

/* Qualified leads collected by the AI consultant.  The payload keeps the
   structured travel brief (party, dates, preferences, budget and contact)
   together so it can be mapped to amoCRM/Bitrix fields later. */
CREATE TABLE IF NOT EXISTS ai_consultations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'sent_to_manager', 'in_progress', 'closed')),
  intent TEXT NOT NULL DEFAULT 'complex_tour',
  summary TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ai_consultations_queue
  ON ai_consultations(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_consultations_session
  ON ai_consultations(session_id, created_at DESC);
