export async function insertDeadline(db, { course, title, dueTimestamp, guildId, channelId, createdBy }) {
  const statement = db.prepare(
    "INSERT INTO deadlines (course, title, due_timestamp, guild_id, channel_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  return await statement.bind(
    course.trim().toUpperCase(),
    title.trim(),
    dueTimestamp,
    guildId || null,
    channelId || null,
    createdBy || null,
    Math.floor(Date.now() / 1000)
  ).run();
}

export async function getUpcomingDeadlines(db, course, limit = 10) {
  const now = Math.floor(Date.now() / 1000);
  if (course && course.trim()) {
    const statement = db.prepare(
      "SELECT id, course, title, due_timestamp FROM deadlines WHERE course = ? AND due_timestamp >= ? ORDER BY due_timestamp ASC LIMIT ?"
    );
    const result = await statement.bind(course.trim().toUpperCase(), now, limit).all();
    return result.results || [];
  }
  const statement = db.prepare(
    "SELECT id, course, title, due_timestamp FROM deadlines WHERE due_timestamp >= ? ORDER BY due_timestamp ASC LIMIT ?"
  );
  const result = await statement.bind(now, limit).all();
  return result.results || [];
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
