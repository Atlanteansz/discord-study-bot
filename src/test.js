import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";
import { verifyDiscordRequest } from "./verify.js";

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

test("verifyDiscordRequest returns true for valid signature", async () => {
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

test("verifyDiscordRequest returns false for invalid signature", async () => {
  const body = JSON.stringify({ type: 1 });
  const timestamp = "1700000000";
  const { pubHex } = await createKeyPairAndSignature(body, timestamp);
  const fakeSig = "00".repeat(64);

  const request = new Request("https://worker.dev", {
    method: "POST",
    headers: {
      "x-signature-ed25519": fakeSig,
      "x-signature-timestamp": timestamp
    },
    body
  });

  const result = await verifyDiscordRequest(request, pubHex);
  assert.equal(result.isValid, false);
});

test("verifyDiscordRequest returns false when headers are missing", async () => {
  const body = JSON.stringify({ type: 1 });
  const requestWithoutHeaders = new Request("https://worker.dev", {
    method: "POST",
    body
  });

  const result = await verifyDiscordRequest(requestWithoutHeaders, "ab".repeat(32));
  assert.equal(result.isValid, false);
});

test("verifyDiscordRequest returns false when body is tampered", async () => {
  const originalBody = JSON.stringify({ type: 1 });
  const timestamp = "1700000000";
  const { pubHex, sigHex } = await createKeyPairAndSignature(originalBody, timestamp);

  const tamperedRequest = new Request("https://worker.dev", {
    method: "POST",
    headers: {
      "x-signature-ed25519": sigHex,
      "x-signature-timestamp": timestamp
    },
    body: JSON.stringify({ type: 2 })
  });

  const result = await verifyDiscordRequest(tamperedRequest, pubHex);
  assert.equal(result.isValid, false);
});

test("worker returns 401 when request is not signed", async () => {
  const request = new Request("https://worker.dev", {
    method: "POST",
    body: JSON.stringify({ type: 1 })
  });

  const response = await worker.fetch(request, { DISCORD_PUBLIC_KEY: "00".repeat(32) });
  assert.equal(response.status, 401);
});

test("worker handles PING and responds with PONG", async () => {
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

  const response = await worker.fetch(request, { DISCORD_PUBLIC_KEY: pubHex });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.type, 1);
});

test("worker handles /help application command with embed", async () => {
  const body = JSON.stringify({
    type: 2,
    data: { name: "help" }
  });
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

  const response = await worker.fetch(request, { DISCORD_PUBLIC_KEY: pubHex });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.type, 4);
  assert.equal(data.data.embeds.length, 1);
  assert.equal(data.data.embeds[0].title, "Study Bot Help");
});
