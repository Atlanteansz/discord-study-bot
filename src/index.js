import { verifyDiscordRequest } from "./verify.js";
import { handleInteraction } from "./commands.js";
import { getDueReminders, markReminderSent } from "./db.js";

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

    const responsePayload = await handleInteraction(interaction, env);
    return jsonResponse(responsePayload);
  },

  async scheduled(controller, env) {
    if (!env?.DB || !env?.DISCORD_TOKEN) {
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const dueReminders = await getDueReminders(env.DB, now);

    for (const reminder of dueReminders) {
      const url = `https://discord.com/api/v10/channels/${reminder.channel_id}/messages`;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bot ${env.DISCORD_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            content: `<@${reminder.user_id}> ⏰ **Study Reminder**: ${reminder.message}`,
            embeds: [
              {
                title: "Study Reminder",
                description: reminder.message,
                color: 0x3498db,
                footer: { text: "Study Bot • Scheduled Reminder" }
              }
            ]
          })
        });

        if (response.ok || response.status === 404 || response.status === 403) {
          await markReminderSent(env.DB, reminder.id);
        }
      } catch {}
    }
  }
};
