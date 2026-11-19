import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";
import { verifyDiscordRequest } from "./verify.js";
import {
  parseManilaDateTime,
  formatManila12Hour,
  getDateAutocompleteChoices
} from "./date.js";
import {
  COMMAND_DEFINITIONS,
  checkManageGuild,
  handleInteraction,
  handleQuizButton
} from "./commands.js";
import { getRandomQuestion } from "./questions.js";

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function createKeyPairAndSignature(bodyText, timestamp) {
  const keyPair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const rawPub = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const pubHex = bytesToHex(new Uint8Array(rawPub));
  const messageBytes = new TextEncoder().encode(timestamp + bodyText);
  const sigBuffer = await crypto.subtle.sign("Ed25519", keyPair.privateKey, messageBytes);
  const sigHex = bytesToHex(new Uint8Array(sigBuffer));
  return { pubHex, sigHex };
}

function createMockDb() {
  const deadlines = [];
  const reminders = [];

  return {
    deadlines,
    reminders,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              if (sql.startsWith("INSERT INTO deadlines")) {
                const [guild_id, channel_id, course, title, due_timestamp, created_by, created_at] = args;
                const id = deadlines.length + 1;
                deadlines.push({
                  id,
                  guild_id,
                  channel_id,
                  course,
                  title,
                  due_timestamp,
                  is_completed: 0,
                  created_by,
                  created_at
                });
                return { success: true, meta: { last_row_id: id, changes: 1 } };
              }
              if (sql.startsWith("INSERT INTO reminders")) {
                const [user_id, channel_id, message, remind_timestamp, created_at] = args;
                const id = reminders.length + 1;
                reminders.push({
                  id,
                  user_id,
                  channel_id,
                  message,
                  remind_timestamp,
                  sent: 0,
                  created_at
                });
                return { success: true, meta: { last_row_id: id, changes: 1 } };
              }
              if (sql.startsWith("UPDATE deadlines SET is_completed = 1")) {
                const [id, guild_id] = args;
                const dl = deadlines.find((d) => d.id === id && d.guild_id === guild_id && d.is_completed === 0);
                if (dl) {
                  dl.is_completed = 1;
                  return { success: true, meta: { changes: 1 } };
                }
                return { success: true, meta: { changes: 0 } };
              }
              if (sql.startsWith("DELETE FROM deadlines WHERE id = ? AND guild_id = ?")) {
                const [id, guild_id] = args;
                const idx = deadlines.findIndex((d) => d.id === id && d.guild_id === guild_id);
                if (idx !== -1) {
                  deadlines.splice(idx, 1);
                  return { success: true, meta: { changes: 1 } };
                }
                return { success: true, meta: { changes: 0 } };
              }
              if (sql.startsWith("UPDATE reminders SET sent = 1")) {
                const [id] = args;
                const rem = reminders.find((r) => r.id === id && r.sent === 0);
                if (rem) {
                  rem.sent = 1;
                  return { success: true, meta: { changes: 1 } };
                }
                return { success: true, meta: { changes: 0 } };
              }
              return { success: true, meta: { changes: 0 } };
            },
            async first() {
              if (sql.includes("FROM deadlines WHERE id = ? AND guild_id = ?")) {
                const [id, guild_id] = args;
                return deadlines.find((d) => d.id === id && d.guild_id === guild_id) || null;
              }
              return null;
            },
            async all() {
              if (sql.includes("FROM deadlines WHERE guild_id = ? AND course = ?")) {
                const [guild_id, course, minTimestamp, limit] = args;
                const matches = deadlines
                  .filter(
                    (d) =>
                      d.guild_id === guild_id &&
                      d.course === course &&
                      d.is_completed === 0 &&
                      d.due_timestamp >= minTimestamp
                  )
                  .slice(0, limit);
                return { results: matches };
              }
              if (sql.includes("FROM deadlines WHERE guild_id = ? AND is_completed = 0 AND due_timestamp >= ?")) {
                const [guild_id, minTimestamp, limit] = args;
                const matches = deadlines
                  .filter((d) => d.guild_id === guild_id && d.is_completed === 0 && d.due_timestamp >= minTimestamp)
                  .slice(0, limit);
                return { results: matches };
              }
              if (sql.includes("FROM deadlines WHERE guild_id = ? AND is_completed = 0 ORDER BY due_timestamp ASC LIMIT ?")) {
                const [guild_id, limit] = args;
                const matches = deadlines
                  .filter((d) => d.guild_id === guild_id && d.is_completed === 0)
                  .slice(0, limit);
                return { results: matches };
              }
              if (sql.includes("FROM reminders")) {
                const [maxTimestamp, limit] = args;
                const matches = reminders
                  .filter((r) => r.sent === 0 && r.remind_timestamp <= maxTimestamp)
                  .slice(0, limit);
                return { results: matches };
              }
              return { results: [] };
            }
          };
        }
      };
    }
  };
}

function validateOptionOrder(options, commandPath = "") {
  let seenOptional = false;
  for (const opt of options) {
    const fullPath = commandPath ? `${commandPath} > ${opt.name}` : opt.name;
    if (opt.options) {
      validateOptionOrder(opt.options, fullPath);
    }
    const isRequired = opt.required === true;
    if (isRequired && seenOptional) {
      throw new Error(`Required option "${fullPath}" placed after optional option.`);
    }
    if (!isRequired) {
      seenOptional = true;
    }
  }
}

test("every command and subcommand places required options before optional ones", () => {
  for (const cmd of COMMAND_DEFINITIONS) {
    if (cmd.options) {
      validateOptionOrder(cmd.options, cmd.name);
    }
  }
});

test("parseManilaDateTime accepts valid date, hour, minute, and period", () => {
  const refNow = Date.UTC(2026, 10, 19, 0, 0, 0);
  const result = parseManilaDateTime(
    { dateStr: "2026-11-20", hour: 5, minute: 30, period: "PM" },
    refNow
  );
  assert.equal(result.valid, true);
  const expectedUtcMs = Date.UTC(2026, 10, 20, 9, 30, 0);
  assert.equal(result.timestamp, Math.floor(expectedUtcMs / 1000));
});

test("parseManilaDateTime rejects hour 0 and 13 with specific message", () => {
  const refNow = Date.UTC(2026, 10, 19, 0, 0, 0);
  const zeroHour = parseManilaDateTime(
    { dateStr: "2026-11-20", hour: 0, minute: 0, period: "AM" },
    refNow
  );
  assert.equal(zeroHour.valid, false);
  assert.equal(zeroHour.error, "Hour must be between 1 and 12.");

  const thirteenHour = parseManilaDateTime(
    { dateStr: "2026-11-20", hour: 13, minute: 0, period: "PM" },
    refNow
  );
  assert.equal(thirteenHour.valid, false);
  assert.equal(thirteenHour.error, "Hour must be between 1 and 12.");
});

test("parseManilaDateTime rejects minute 60 with specific message", () => {
  const refNow = Date.UTC(2026, 10, 19, 0, 0, 0);
  const result = parseManilaDateTime(
    { dateStr: "2026-11-20", hour: 5, minute: 60, period: "PM" },
    refNow
  );
  assert.equal(result.valid, false);
  assert.equal(result.error, "Minute must be between 0 and 59.");
});

test("parseManilaDateTime rejects invalid period with specific message", () => {
  const refNow = Date.UTC(2026, 10, 19, 0, 0, 0);
  const result = parseManilaDateTime(
    { dateStr: "2026-11-20", hour: 5, minute: 30, period: "NOON" },
    refNow
  );
  assert.equal(result.valid, false);
  assert.equal(result.error, "Period must be AM or PM.");
});

test("parseManilaDateTime handles 12 AM midnight edge case", () => {
  const refNow = Date.UTC(2026, 10, 19, 0, 0, 0);
  const result = parseManilaDateTime(
    {
      dateStr: "2026-11-20",
      hour: 12,
      minute: 0,
      period: "AM"
    },
    refNow
  );
  assert.equal(result.valid, true);
  const expectedUtcMs = Date.UTC(2026, 10, 19, 16, 0, 0);
  assert.equal(result.timestamp, Math.floor(expectedUtcMs / 1000));
});

test("parseManilaDateTime handles 12 PM noon edge case", () => {
  const refNow = Date.UTC(2026, 10, 19, 0, 0, 0);
  const result = parseManilaDateTime(
    {
      dateStr: "2026-11-20",
      hour: 12,
      minute: 0,
      period: "PM"
    },
    refNow
  );
  assert.equal(result.valid, true);
  const expectedUtcMs = Date.UTC(2026, 10, 20, 4, 0, 0);
  assert.equal(result.timestamp, Math.floor(expectedUtcMs / 1000));
});

test("parseManilaDateTime rejects past times", () => {
  const refNow = Date.UTC(2026, 10, 20, 12, 0, 0);
  const result = parseManilaDateTime(
    { dateStr: "2026-11-20", hour: 10, minute: 0, period: "AM" },
    refNow
  );
  assert.equal(result.valid, false);
  assert.match(result.error, /future/i);
});

test("checkManageGuild checks Manage Guild and Administrator permission bits", () => {
  assert.equal(checkManageGuild("32"), true);
  assert.equal(checkManageGuild("8"), true);
  assert.equal(checkManageGuild("0"), false);
  assert.equal(checkManageGuild(null), false);
  assert.equal(checkManageGuild("2147483647"), true);
});

test("/deadline add saves deadline and includes confirmation embed with Delete button", async () => {
  const mockDb = createMockDb();
  const interaction = {
    type: 2,
    guild_id: "guild_abc",
    channel_id: "channel_123",
    data: {
      name: "deadline",
      options: [
        {
          name: "add",
          type: 1,
          options: [
            { name: "course", value: "CS101" },
            { name: "title", value: "Midterm Paper" },
            { name: "date", value: "2099-11-20" },
            { name: "hour", value: 11 },
            { name: "minute", value: 59 },
            { name: "period", value: "PM" }
          ]
        }
      ]
    },
    member: { user: { id: "user_1" } }
  };

  const response = await handleInteraction(interaction, { DB: mockDb });
  assert.equal(response.type, 4);
  assert.equal(response.data.embeds[0].title, "Deadline Added");
  assert.match(response.data.embeds[0].fields[2].value, /11:59 PM \(Asia\/Manila\)/);
  assert.equal(response.data.components.length, 1);
  assert.equal(response.data.components[0].components[0].style, 4);
  assert.match(response.data.components[0].components[0].custom_id, /^delete_deadline:/);
  assert.equal(mockDb.deadlines.length, 1);
  assert.equal(mockDb.deadlines[0].created_by, "user_1");
});

test("delete button allows deletion by creator", async () => {
  const mockDb = createMockDb();
  mockDb.deadlines.push({
    id: 10,
    guild_id: "guild_abc",
    channel_id: "channel_123",
    course: "CS101",
    title: "Essay",
    due_timestamp: Math.floor(Date.now() / 1000) + 7200,
    is_completed: 0,
    created_by: "user_creator"
  });

  const interaction = {
    type: 3,
    guild_id: "guild_abc",
    data: { custom_id: "delete_deadline:10" },
    member: { user: { id: "user_creator" }, permissions: "0" }
  };

  const response = await handleInteraction(interaction, { DB: mockDb });
  assert.equal(response.type, 7);
  assert.equal(response.data.embeds[0].title, "Deadline Deleted");
  assert.equal(mockDb.deadlines.length, 0);
  assert.equal(response.data.components[0].components[0].disabled, true);
});

test("delete button allows deletion by member with Manage Server permission", async () => {
  const mockDb = createMockDb();
  mockDb.deadlines.push({
    id: 11,
    guild_id: "guild_abc",
    channel_id: "channel_123",
    course: "NET201",
    title: "Project",
    due_timestamp: Math.floor(Date.now() / 1000) + 7200,
    is_completed: 0,
    created_by: "user_other"
  });

  const interaction = {
    type: 3,
    guild_id: "guild_abc",
    data: { custom_id: "delete_deadline:11" },
    member: { user: { id: "admin_user" }, permissions: "32" }
  };

  const response = await handleInteraction(interaction, { DB: mockDb });
  assert.equal(response.type, 7);
  assert.equal(response.data.embeds[0].title, "Deadline Deleted");
  assert.equal(mockDb.deadlines.length, 0);
});

test("delete button rejects deletion by unauthorized user with ephemeral message", async () => {
  const mockDb = createMockDb();
  mockDb.deadlines.push({
    id: 12,
    guild_id: "guild_abc",
    channel_id: "channel_123",
    course: "SEC101",
    title: "Quiz",
    due_timestamp: Math.floor(Date.now() / 1000) + 7200,
    is_completed: 0,
    created_by: "user_creator"
  });

  const interaction = {
    type: 3,
    guild_id: "guild_abc",
    data: { custom_id: "delete_deadline:12" },
    member: { user: { id: "intruder_user" }, permissions: "0" }
  };

  const response = await handleInteraction(interaction, { DB: mockDb });
  assert.equal(response.type, 4);
  assert.equal(response.data.flags, 64);
  assert.match(response.data.content, /do not have permission/i);
  assert.equal(mockDb.deadlines.length, 1);
});

test("second click on delete button returns friendly message without error", async () => {
  const mockDb = createMockDb();
  const interaction = {
    type: 3,
    guild_id: "guild_abc",
    data: { custom_id: "delete_deadline:999" },
    member: { user: { id: "user_creator" }, permissions: "0" }
  };

  const response = await handleInteraction(interaction, { DB: mockDb });
  assert.equal(response.type, 7);
  assert.equal(response.data.embeds[0].title, "Deadline Deleted");
  assert.match(response.data.embeds[0].description, /already been deleted/i);
});

test("/deadline delete command removes deadline when authorized", async () => {
  const mockDb = createMockDb();
  mockDb.deadlines.push({
    id: 20,
    guild_id: "guild_abc",
    channel_id: "channel_123",
    course: "CS101",
    title: "Term Paper",
    due_timestamp: Math.floor(Date.now() / 1000) + 7200,
    is_completed: 0,
    created_by: "user_creator"
  });

  const interaction = {
    type: 2,
    guild_id: "guild_abc",
    channel_id: "channel_123",
    data: {
      name: "deadline",
      options: [
        {
          name: "delete",
          type: 1,
          options: [{ name: "id", value: 20 }]
        }
      ]
    },
    member: { user: { id: "user_creator" }, permissions: "0" }
  };

  const response = await handleInteraction(interaction, { DB: mockDb });
  assert.equal(response.type, 4);
  assert.equal(response.data.embeds[0].title, "Deadline Deleted");
  assert.equal(mockDb.deadlines.length, 0);
});

test("verifyDiscordRequest validates authentic signature", async () => {
  const body = JSON.stringify({ type: 1 });
  const timestamp = "1700000000";
  const { pubHex, sigHex } = await createKeyPairAndSignature(body, timestamp);

  const request = new Request("https://worker.dev", {
    method: "POST",
    headers: {
      "x-signature-ed25519": sigHex,
      "x-signature-timestamp": timestamp
    },
    body
  });

  const result = await verifyDiscordRequest(request, pubHex);
  assert.equal(result.isValid, true);
  assert.equal(result.body, body);
});

test("verifyDiscordRequest rejects invalid signature and missing headers", async () => {
  const body = JSON.stringify({ type: 1 });
  const requestWithoutHeaders = new Request("https://worker.dev", {
    method: "POST",
    body
  });
  const missingResult = await verifyDiscordRequest(requestWithoutHeaders, "ab".repeat(32));
  assert.equal(missingResult.isValid, false);

  const timestamp = "1700000000";
  const fakeSig = "00".repeat(64);
  const badSigRequest = new Request("https://worker.dev", {
    method: "POST",
    headers: {
      "x-signature-ed25519": fakeSig,
      "x-signature-timestamp": timestamp
    },
    body
  });
  const badSigResult = await verifyDiscordRequest(badSigRequest, "ab".repeat(32));
  assert.equal(badSigResult.isValid, false);
});

test("getDateAutocompleteChoices returns exactly 25 options labeled properly", () => {
  const refNow = Date.UTC(2026, 10, 19, 0, 0, 0);
  const choices = getDateAutocompleteChoices("", refNow);
  assert.equal(choices.length, 25);
  assert.match(choices[0].name, /^[A-Z][a-z]{2},\s[A-Z][a-z]{2}\s\d+$/);
  assert.match(choices[0].value, /^\d{4}-\d{2}-\d{2}$/);
});

test("autocomplete returns choices for deadline date option", async () => {
  const autocompleteInteraction = {
    type: 4,
    data: {
      name: "deadline",
      options: [
        {
          name: "add",
          type: 1,
          options: [{ name: "date", focused: true, value: "Nov" }]
        }
      ]
    }
  };

  const response = await handleInteraction(autocompleteInteraction, {});
  assert.equal(response.type, 8);
  assert.equal(response.data.choices.length > 0, true);
  assert.equal(response.data.choices.length <= 25, true);
});

test("/deadline commands reject execution outside a Discord server", async () => {
  const interaction = {
    type: 2,
    data: {
      name: "deadline",
      options: [{ name: "list", type: 1 }]
    }
  };

  const response = await handleInteraction(interaction, {});
  assert.equal(response.type, 4);
  assert.equal(response.data.embeds[0].title, "Server Only Command");
});

test("/deadline list displays upcoming deadlines and flags overdue ones up to 7 days", async () => {
  const mockDb = createMockDb();
  const now = Math.floor(Date.now() / 1000);

  mockDb.deadlines.push({
    id: 1,
    guild_id: "guild_abc",
    channel_id: "channel_123",
    course: "CS101",
    title: "Upcoming Project",
    due_timestamp: now + 86400,
    is_completed: 0
  });

  mockDb.deadlines.push({
    id: 2,
    guild_id: "guild_abc",
    channel_id: "channel_123",
    course: "CS101",
    title: "Overdue Quiz",
    due_timestamp: now - 3600,
    is_completed: 0
  });

  const interaction = {
    type: 2,
    guild_id: "guild_abc",
    channel_id: "channel_123",
    data: {
      name: "deadline",
      options: [{ name: "list", type: 1, options: [] }]
    }
  };

  const response = await handleInteraction(interaction, { DB: mockDb });
  assert.equal(response.type, 4);
  const fields = response.data.embeds[0].fields;
  assert.equal(fields.length, 2);
  assert.match(fields[0].name, /Upcoming Project/);
  assert.match(fields[1].name, /OVERDUE/);
});

test("/deadline done marks deadline completed so it is omitted from future lists", async () => {
  const mockDb = createMockDb();
  mockDb.deadlines.push({
    id: 5,
    guild_id: "guild_abc",
    channel_id: "channel_123",
    course: "NET201",
    title: "Lab Report",
    due_timestamp: Math.floor(Date.now() / 1000) + 7200,
    is_completed: 0
  });

  const doneInteraction = {
    type: 2,
    guild_id: "guild_abc",
    channel_id: "channel_123",
    data: {
      name: "deadline",
      options: [
        {
          name: "done",
          type: 1,
          options: [{ name: "id", value: 5 }]
        }
      ]
    }
  };

  const doneResponse = await handleInteraction(doneInteraction, { DB: mockDb });
  assert.equal(doneResponse.type, 4);
  assert.equal(doneResponse.data.embeds[0].title, "Deadline Completed");
  assert.equal(mockDb.deadlines[0].is_completed, 1);

  const listInteraction = {
    type: 2,
    guild_id: "guild_abc",
    channel_id: "channel_123",
    data: {
      name: "deadline",
      options: [{ name: "list", type: 1, options: [] }]
    }
  };

  const listResponse = await handleInteraction(listInteraction, { DB: mockDb });
  assert.equal(listResponse.type, 4);
  assert.match(listResponse.data.embeds[0].description, /No active or recent deadlines/);
});

test("/remind schedules a reminder in database", async () => {
  const mockDb = createMockDb();
  const interaction = {
    type: 2,
    channel_id: "channel_456",
    user: { id: "user_789" },
    data: {
      name: "remind",
      options: [
        { name: "minutes", value: 30 },
        { name: "message", value: "Read lecture slides" }
      ]
    }
  };

  const response = await handleInteraction(interaction, { DB: mockDb });
  assert.equal(response.type, 4);
  assert.equal(response.data.embeds[0].title, "Reminder Scheduled");
  assert.equal(mockDb.reminders.length, 1);
  assert.equal(mockDb.reminders[0].message, "Read lecture slides");
});

test("/quiz returns question embed and interactive buttons", async () => {
  const interaction = {
    type: 2,
    data: {
      name: "quiz",
      options: [{ name: "subject", value: "cloud" }]
    }
  };

  const response = await handleInteraction(interaction, {});
  assert.equal(response.type, 4);
  assert.equal(response.data.components.length, 1);
  assert.equal(response.data.components[0].components.length > 0, true);
  assert.match(response.data.components[0].components[0].custom_id, /^quiz:/);
});

test("handleQuizButton evaluates answer correctness and disables buttons", () => {
  const q = getRandomQuestion();
  assert.notEqual(q, null);

  const correctInteraction = {
    data: { custom_id: `quiz:${q.id}:${q.answerIndex}` },
    user: { username: "Student1" }
  };
  const correctResp = handleQuizButton(correctInteraction);
  assert.equal(correctResp.type, 7);
  assert.equal(correctResp.data.embeds[0].color, 0x2ecc71);
  assert.equal(correctResp.data.components[0].components[0].disabled, true);

  const wrongIdx = (q.answerIndex + 1) % q.choices.length;
  const wrongInteraction = {
    data: { custom_id: `quiz:${q.id}:${wrongIdx}` },
    user: { username: "Student2" }
  };
  const wrongResp = handleQuizButton(wrongInteraction);
  assert.equal(wrongResp.type, 7);
  assert.equal(wrongResp.data.embeds[0].color, 0xe74c3c);
});

test("scheduled handler dispatches due reminder and updates sent flag", async () => {
  const mockDb = createMockDb();
  mockDb.reminders.push({
    id: 1,
    user_id: "user_111",
    channel_id: "channel_222",
    message: "Prepare presentation",
    remind_timestamp: Math.floor(Date.now() / 1000) - 10,
    sent: 0
  });

  const originalFetch = globalThis.fetch;
  let postedUrl = null;
  let postedBody = null;

  globalThis.fetch = async (url, options) => {
    postedUrl = url;
    postedBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: "msg_999" }), { status: 200 });
  };

  try {
    await worker.scheduled({}, { DB: mockDb, DISCORD_TOKEN: "fake_token" });
    assert.equal(postedUrl, "https://discord.com/api/v10/channels/channel_222/messages");
    assert.match(postedBody.content, /Prepare presentation/);
    assert.equal(mockDb.reminders[0].sent, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
