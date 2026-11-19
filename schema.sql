CREATE TABLE IF NOT EXISTS deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  course TEXT NOT NULL,
  title TEXT NOT NULL,
  due_timestamp INTEGER NOT NULL,
  is_completed INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  alert_early_sent INTEGER NOT NULL DEFAULT 0,
  alert_second_sent INTEGER NOT NULL DEFAULT 0,
  alert_overdue_sent INTEGER NOT NULL DEFAULT 0,
  alert_failures INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deadlines_guild ON deadlines(guild_id, is_completed, due_timestamp);
CREATE INDEX IF NOT EXISTS idx_deadlines_due ON deadlines(due_timestamp);
CREATE INDEX IF NOT EXISTS idx_deadlines_alerts ON deadlines(is_completed, due_timestamp);

CREATE TABLE IF NOT EXISTS guild_configs (
  guild_id TEXT PRIMARY KEY,
  due_soon_role TEXT,
  overdue_role TEXT,
  alert_channel TEXT,
  due_soon_minutes INTEGER NOT NULL DEFAULT 60,
  second_alert_hours INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message TEXT NOT NULL,
  remind_timestamp INTEGER NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders(sent, remind_timestamp);
