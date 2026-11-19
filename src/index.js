import { verifyDiscordRequest } from "./verify.js";
import { handleInteraction } from "./commands.js";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const publicKey = env?.DISCORD_PUBLIC_KEY;
    const { isValid, body } = await verifyDiscordRequest(request, publicKey);

    if (!isValid || !body) {
      return new Response("Unauthorized", { status: 401 });
    }

    let interaction;
    try {
      interaction = JSON.parse(body);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    const responsePayload = handleInteraction(interaction);
    return jsonResponse(responsePayload);
  }
};
