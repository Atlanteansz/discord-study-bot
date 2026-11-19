export async function insertDeadline(db, { guildId, channelId, course, title, dueTimestamp, createdBy }) {
  const statement = db.prepare(
    "INSERT INTO deadlines (guild_id, channel_id, course, title, due_timestamp, is_completed, created_by, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)"
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
