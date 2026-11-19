export async function insertDeadline(db, { guildId, channelId, course, title, dueTimestamp, createdBy }) {
  const statement = db.prepare(
    "INSERT INTO deadlines (guild_id, channel_id, course, title, due_timestamp, is_completed, created_by, alert_early_sent, alert_second_sent, alert_overdue_sent, alert_failures, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, 0, 0, 0, 0, ?)"
  );
  const res = await statement.bind(
    guildId,
    channelId,
    course.trim().toUpperCase(),
    title.trim(),
    dueTimestamp,
    createdBy || null,
    Math.floor(Date.now() / 1000)
  ).run();
  return res.meta?.last_row_id || null;
}

export async function getUpcomingDeadlines(db, { guildId, course, minTimestamp, limit = 25 }) {
  if (course && course.trim()) {
    const statement = db.prepare(
      "SELECT id, course, title, due_timestamp, is_completed, created_by FROM deadlines WHERE guild_id = ? AND course = ? AND is_completed = 0 AND due_timestamp >= ? ORDER BY due_timestamp ASC LIMIT ?"
    );
    const result = await statement.bind(guildId, course.trim().toUpperCase(), minTimestamp, limit).all();
    return result.results || [];
  }
  const statement = db.prepare(
    "SELECT id, course, title, due_timestamp, is_completed, created_by FROM deadlines WHERE guild_id = ? AND is_completed = 0 AND due_timestamp >= ? ORDER BY due_timestamp ASC LIMIT ?"
  );
  const result = await statement.bind(guildId, minTimestamp, limit).all();
  return result.results || [];
}

export async function getActiveDeadlinesForGuild(db, guildId, limit = 25) {
  const statement = db.prepare(
    "SELECT id, course, title, due_timestamp, created_by FROM deadlines WHERE guild_id = ? AND is_completed = 0 ORDER BY due_timestamp ASC LIMIT ?"
  );
  const result = await statement.bind(guildId, limit).all();
  return result.results || [];
}

export async function getDeadlineById(db, { guildId, id }) {
  const statement = db.prepare(
    "SELECT id, course, title, due_timestamp, is_completed, created_by FROM deadlines WHERE id = ? AND guild_id = ?"
  );
  return await statement.bind(id, guildId).first();
}

export async function completeDeadline(db, { guildId, id }) {
  const statement = db.prepare(
    "UPDATE deadlines SET is_completed = 1 WHERE id = ? AND guild_id = ? AND is_completed = 0"
  );
  const res = await statement.bind(id, guildId).run();
  return res.meta?.changes > 0 || res.success;
}

export async function deleteDeadline(db, { guildId, id }) {
  const statement = db.prepare(
    "DELETE FROM deadlines WHERE id = ? AND guild_id = ?"
  );
  const res = await statement.bind(id, guildId).run();
  return res.meta?.changes > 0 || res.success;
}

export async function getGuildConfig(db, guildId) {
  const statement = db.prepare(
    "SELECT guild_id, due_soon_role, overdue_role, alert_channel, due_soon_minutes, second_alert_hours, updated_at FROM guild_configs WHERE guild_id = ?"
  );
  return await statement.bind(guildId).first();
}

export async function upsertGuildConfig(db, { guildId, dueSoonRole, overdueRole, alertChannel, dueSoonMinutes, secondAlertHours }) {
  const statement = db.prepare(
    "INSERT INTO guild_configs (guild_id, due_soon_role, overdue_role, alert_channel, due_soon_minutes, second_alert_hours, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET due_soon_role = excluded.due_soon_role, overdue_role = excluded.overdue_role, alert_channel = excluded.alert_channel, due_soon_minutes = excluded.due_soon_minutes, second_alert_hours = excluded.second_alert_hours, updated_at = excluded.updated_at"
  );
  const res = await statement.bind(
    guildId,
    dueSoonRole || null,
    overdueRole || null,
    alertChannel || null,
    dueSoonMinutes || 60,
    secondAlertHours || null,
    Math.floor(Date.now() / 1000)
  ).run();
  return res.success;
}

export async function clearGuildConfigSetting(db, guildId, setting) {
  const now = Math.floor(Date.now() / 1000);
  if (setting === "all") {
    const statement = db.prepare("DELETE FROM guild_configs WHERE guild_id = ?");
    const res = await statement.bind(guildId).run();
    return res.success;
  }
  if (setting === "due_soon_role") {
    const statement = db.prepare("UPDATE guild_configs SET due_soon_role = NULL, updated_at = ? WHERE guild_id = ?");
    const res = await statement.bind(now, guildId).run();
    return res.success;
  }
  if (setting === "overdue_role") {
    const statement = db.prepare("UPDATE guild_configs SET overdue_role = NULL, updated_at = ? WHERE guild_id = ?");
    const res = await statement.bind(now, guildId).run();
    return res.success;
  }
  if (setting === "alert_channel") {
    const statement = db.prepare("UPDATE guild_configs SET alert_channel = NULL, updated_at = ? WHERE guild_id = ?");
    const res = await statement.bind(now, guildId).run();
    return res.success;
  }
  if (setting === "due_soon_minutes") {
    const statement = db.prepare("UPDATE guild_configs SET due_soon_minutes = 60, updated_at = ? WHERE guild_id = ?");
    const res = await statement.bind(now, guildId).run();
    return res.success;
  }
  if (setting === "second_alert_hours") {
    const statement = db.prepare("UPDATE guild_configs SET second_alert_hours = NULL, updated_at = ? WHERE guild_id = ?");
    const res = await statement.bind(now, guildId).run();
    return res.success;
  }
  return false;
}

export async function getDeadlinesForAlerts(db, limit = 20) {
  const statement = db.prepare(
    "SELECT id, guild_id, channel_id, course, title, due_timestamp, alert_early_sent, alert_second_sent, alert_overdue_sent, alert_failures FROM deadlines WHERE is_completed = 0 AND (alert_overdue_sent = 0 OR alert_early_sent = 0) AND alert_failures < 3 ORDER BY due_timestamp ASC LIMIT ?"
  );
  const result = await statement.bind(limit).all();
  return result.results || [];
}

export async function updateDeadlineAlertStatus(db, { id, earlySent, secondSent, overdueSent }) {
  const statement = db.prepare(
    "UPDATE deadlines SET alert_early_sent = COALESCE(?, alert_early_sent), alert_second_sent = COALESCE(?, alert_second_sent), alert_overdue_sent = COALESCE(?, alert_overdue_sent), alert_failures = 0 WHERE id = ?"
  );
  const res = await statement.bind(
    earlySent !== undefined ? earlySent : null,
    secondSent !== undefined ? secondSent : null,
    overdueSent !== undefined ? overdueSent : null,
    id
  ).run();
  return res.success;
}

export async function recordDeadlineAlertFailure(db, id) {
  const statement = db.prepare(
    "UPDATE deadlines SET alert_failures = alert_failures + 1 WHERE id = ?"
  );
  const res = await statement.bind(id).run();
  return res.success;
}

export async function abandonDeadlineAlert(db, { id, alertType }) {
  if (alertType === "overdue") {
    const statement = db.prepare("UPDATE deadlines SET alert_overdue_sent = 1 WHERE id = ?");
    return await statement.bind(id).run();
  }
  if (alertType === "early") {
    const statement = db.prepare("UPDATE deadlines SET alert_early_sent = 1 WHERE id = ?");
    return await statement.bind(id).run();
  }
  if (alertType === "second") {
    const statement = db.prepare("UPDATE deadlines SET alert_second_sent = 1 WHERE id = ?");
    return await statement.bind(id).run();
  }
}

export async function insertReminder(db, { userId, channelId, message, remindTimestamp }) {
  const statement = db.prepare(
    "INSERT INTO reminders (user_id, channel_id, message, remind_timestamp, sent, created_at) VALUES (?, ?, ?, ?, 0, ?)"
  );
  return await statement.bind(
    userId,
    channelId,
    message.trim(),
    remindTimestamp,
    Math.floor(Date.now() / 1000)
  ).run();
}

export async function getDueReminders(db, currentTimestamp, limit = 20) {
  const statement = db.prepare(
    "SELECT id, user_id, channel_id, message, remind_timestamp FROM reminders WHERE sent = 0 AND remind_timestamp <= ? ORDER BY remind_timestamp ASC LIMIT ?"
  );
  const result = await statement.bind(currentTimestamp, limit).all();
  return result.results || [];
}

export async function markReminderSent(db, id) {
  const statement = db.prepare(
    "UPDATE reminders SET sent = 1 WHERE id = ? AND sent = 0"
  );
  const res = await statement.bind(id).run();
  return res.meta?.changes > 0 || res.success;
}
