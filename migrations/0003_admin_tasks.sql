PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT 'Администратор',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'done', 'cancelled')),
  due_date TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_queue ON admin_tasks(status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_due_date ON admin_tasks(due_date);
