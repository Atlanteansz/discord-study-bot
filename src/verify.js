function hexToBytes(hex) {
  if (typeof hex !== "string" || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const val = parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(val)) return null;
    bytes[i / 2] = val;
  }
  return bytes;
}

export async function verifyDiscordRequest(request, publicKeyHex) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");

  if (!signature || !timestamp || !publicKeyHex) {
    return { isValid: false, body: null };
  }

  const sigBytes = hexToBytes(signature);
  const keyBytes = hexToBytes(publicKeyHex);
  if (!sigBytes || !keyBytes || sigBytes.length !== 64 || keyBytes.length !== 32) {
    return { isValid: false, body: null };
  }

  const bodyText = await request.text();
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(timestamp + bodyText);

  try {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    const isValid = await crypto.subtle.verify(
      { name: "Ed25519" },
      cryptoKey,
      sigBytes,
      messageBytes
    );
    return { isValid, body: bodyText };
  } catch {
    return { isValid: false, body: null };
  }
}
