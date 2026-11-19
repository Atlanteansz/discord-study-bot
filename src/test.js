import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";
import { verifyDiscordRequest } from "./verify.js";
import { parseManilaDate, formatManilaDate } from "./date.js";
import { handleInteraction, handleQuizButton } from "./commands.js";
import { getRandomQuestion, findQuestionById } from "./questions.js";

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
                const [course, title, due_timestamp, guild_id, channel_id, created_by, created_at] = args;
                deadlines.push({
                  id: deadlines.length + 1,
                  course,
                  title,
                  due_timestamp,
                  guild_id,
                  channel_id,
                  created_by,
                  created_at
                });
                return { success: true, meta: { changes: 1 } };
              }
              if (sql.startsWith("INSERT INTO reminders")) {
                const [user_id, channel_id, message, remind_timestamp, created_at] = args;
                reminders.push({
                  id: reminders.length + 1,
                  user_id,
                  channel_id,
                  message,
                  remind_timestamp,
                  sent: 0,
                  created_at
                });
                return { success: true, meta: { changes: 1 } };
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
            async all() {
              if (sql.includes("FROM deadlines")) {
                return { results: [...deadlines] };
              }
              if (sql.includes("FROM reminders")) {
                const [maxTimestamp] = args;
                const matches = reminders.filter((r) => r.sent === 0 && r.remind_timestamp <= maxTimestamp);
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

test("parseManilaDate converts valid future date and time to UTC timestamp", () => {
  const refNow = Date.UTC(2026, 10, 19, 0, 0, 0);
  const result = parseManilaDate("2026-11-20 15:30", refNow);
  assert.equal(result.valid, true);

  const expectedUtcMs = Date.UTC(2026, 10, 20, 7, 30, 0);
  assert.equal(result.timestamp, Math.floor(expectedUtcMs / 1000));
});

test("parseManilaDate defaults date-only format to 23:59 Manila time", () => {
  const refNow = Date.UTC(2026, 10, 19, 0, 0, 0);
  const result = parseManilaDate("2026-11-20", refNow);
  assert.equal(result.valid, true);

  const expectedUtcMs = Date.UTC(2026, 10, 20, 15, 59, 0);
  assert.equal(result.timestamp, Math.floor(expectedUtcMs / 1000));
});

test("parseManilaDate rejects past dates and invalid formats", () => {
  const refNow = Date.UTC(2026, 10, 20, 0, 0, 0);
  const pastResult = parseManilaDate("2026-11-18 10:00", refNow);
  assert.equal(pastResult.valid, false);
  assert.match(pastResult.error, /future/i);

  const badFormat = parseManilaDate("invalid-date", refNow);
  assert.equal(badFormat.valid, false);

  const badNumbers = parseManilaDate("2026-13-40", refNow);
  assert.equal(badNumbers.valid, false);
});

test("formatManilaDate correctly formats UTC timestamp into Asia/Manila time", () => {
  const utcSeconds = Math.floor(Date.UTC(2026, 10, 20, 7, 30, 0) / 1000);
  const formatted = formatManilaDate(utcSeconds);
  assert.equal(formatted, "2026-11-20 15:30");
});

test("/deadline add saves deadline to database and formats response embed", async () => {
  const mockDb = createMockDb();
  const interaction = {
    type: 2,
    data: {
      name: "deadline",
      options: [
        {
          name: "add",
          type: 1,
          options: [
            { name: "course", value: "CS101" },
            { name: "title", value: "Project Phase 1" },
            { name: "date", value: "2099-12-31 23:59" }
          ]
        }
      ]
    },
    guild_id: "guild_123",
    channel_id: "channel_456",
    member: { user: { id: "user_789" } }
  };

  const response = await handleInteraction(interaction, { DB: mockDb });
  assert.equal(response.type, 4);
  assert.equal(response.data.embeds[0].title, "Deadline Added");
  assert.equal(mockDb.deadlines.length, 1);
  assert.equal(mockDb.deadlines[0].course, "CS101");
});

test("/deadline list returns formatted upcoming deadlines", async () => {
  const mockDb = createMockDb();
  mockDb.deadlines.push({
    id: 1,
    course: "NET201",
    title: "Exam Review",
    due_timestamp: Math.floor(Date.now() / 1000) + 3600
  });

  const interaction = {
    type: 2,
    data: {
      name: "deadline",
      options: [{ name: "list", type: 1, options: [] }]
    }
  };

  const response = await handleInteraction(interaction, { DB: mockDb });
  assert.equal(response.type, 4);
  assert.equal(response.data.embeds[0].fields.length, 1);
  assert.match(response.data.embeds[0].fields[0].name, /NET201/);
});

test("/remind schedules a reminder in database", async () => {
  const mockDb = createMockDb();
  const interaction = {
    type: 2,
    data: {
      name: "remind",
      options: [
        { name: "minutes", value: 30 },
        { name: "message", value: "Read lecture slides" }
      ]
    },
    channel_id: "channel_456",
    user: { id: "user_789" }
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
