CREATE TABLE IF NOT EXISTS guild_configs (
  guild_id TEXT PRIMARY KEY,
  due_soon_role TEXT,
  overdue_role TEXT,
  alert_channel TEXT,
  due_soon_minutes INTEGER NOT NULL DEFAULT 60,
  second_alert_hours INTEGER,
  updated_at INTEGER NOT NULL
);

ALTER TABLE deadlines ADD COLUMN alert_early_sent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deadlines ADD COLUMN alert_second_sent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deadlines ADD COLUMN alert_overdue_sent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deadlines ADD COLUMN alert_failures INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_deadlines_alerts ON deadlines(is_completed, due_timestamp);
