ALTER TABLE demo_audit_log ADD COLUMN actor_id TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE demo_audit_log ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_demo_audit_actor ON demo_audit_log(session_id, actor_role, actor_id, created_at DESC);
