import { verifyDiscordRequest } from "./verify.js";
import { handleInteraction } from "./commands.js";
import { formatManila12Hour } from "./date.js";
import {
  getDueReminders,
  markReminderSent,
  getDeadlinesForAlerts,
  getGuildConfig,
  updateDeadlineAlertStatus,
  recordDeadlineAlertFailure,
  abandonDeadlineAlert
} from "./db.js";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

export async function sendDiscordAlert(token, channelId, roleId, embed) {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: roleId ? `<@&${roleId}>` : "",
        embeds: [embed],
        allowed_mentions: roleId
          ? { parse: [], roles: [roleId], users: [] }
          : { parse: [], roles: [], users: [] }
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function processDeadlineAlerts(env, referenceNow = Math.floor(Date.now() / 1000)) {
  if (!env?.DB || !env?.DISCORD_TOKEN) {
    return;
  }

  const deadlines = await getDeadlinesForAlerts(env.DB, 15);
  let postsCount = 0;
  const maxPostsPerTick = 10;

  for (const deadline of deadlines) {
    if (postsCount >= maxPostsPerTick) {
      break;
    }

    const config = await getGuildConfig(env.DB, deadline.guild_id);
    const dueSoonMinutes = config?.due_soon_minutes || 60;
    const secondAlertHours = config?.second_alert_hours || null;
    const dueSoonRole = config?.due_soon_role || null;
    const overdueRole = config?.overdue_role || null;
    const targetChannelId = config?.alert_channel || deadline.channel_id;

    const earlyThreshold = deadline.due_timestamp - dueSoonMinutes * 60;
    const secondThreshold = secondAlertHours ? deadline.due_timestamp - secondAlertHours * 3600 : null;

    if (referenceNow >= deadline.due_timestamp) {
      if (deadline.alert_overdue_sent === 0 && deadline.alert_failures < 3) {
        postsCount++;
        const roleId = overdueRole;
        const embed = {
          title: `⚠️ Deadline Overdue: [${deadline.course}] ${deadline.title}`,
          color: 0xe74c3c,
          fields: [
            { name: "Course", value: deadline.course, inline: true },
            { name: "Title", value: deadline.title, inline: true },
            { name: "Due (Asia/Manila)", value: formatManila12Hour(deadline.due_timestamp), inline: false },
            { name: "Status", value: `⚠️ Overdue by <t:${deadline.due_timestamp}:R> (<t:${deadline.due_timestamp}:F>)`, inline: false }
          ],
          footer: { text: "Study Bot • Deadline Alert" }
        };

        const failuresBeforePost = deadline.alert_failures;
        const success = await sendDiscordAlert(env.DISCORD_TOKEN, targetChannelId, roleId, embed);
        if (success) {
          await updateDeadlineAlertStatus(env.DB, { id: deadline.id, earlySent: 1, secondSent: 1, overdueSent: 1 });
        } else {
          console.error(`Failed to dispatch overdue alert for deadline ${deadline.id} to channel ${targetChannelId}`);
          await recordDeadlineAlertFailure(env.DB, deadline.id);
          if (failuresBeforePost + 1 >= 3) {
            await abandonDeadlineAlert(env.DB, { id: deadline.id, alertType: "overdue" });
          }
        }
      }
      continue;
    }

    if (referenceNow >= earlyThreshold) {
      if (deadline.alert_early_sent === 0 && deadline.alert_failures < 3) {
        postsCount++;
        const roleId = dueSoonRole;
        const embed = {
          title: `⏰ Deadline Due Soon: [${deadline.course}] ${deadline.title}`,
          color: 0xf39c12,
          fields: [
            { name: "Course", value: deadline.course, inline: true },
            { name: "Title", value: deadline.title, inline: true },
            { name: "Due (Asia/Manila)", value: formatManila12Hour(deadline.due_timestamp), inline: false },
            { name: "Countdown", value: `<t:${deadline.due_timestamp}:F> (<t:${deadline.due_timestamp}:R>)`, inline: false }
          ],
          footer: { text: "Study Bot • Deadline Alert" }
        };

        const failuresBeforePost = deadline.alert_failures;
        const success = await sendDiscordAlert(env.DISCORD_TOKEN, targetChannelId, roleId, embed);
        if (success) {
          await updateDeadlineAlertStatus(env.DB, { id: deadline.id, earlySent: 1, secondSent: 1 });
        } else {
          console.error(`Failed to dispatch early alert for deadline ${deadline.id} to channel ${targetChannelId}`);
          await recordDeadlineAlertFailure(env.DB, deadline.id);
          if (failuresBeforePost + 1 >= 3) {
            await abandonDeadlineAlert(env.DB, { id: deadline.id, alertType: "early" });
          }
        }
      }
      continue;
    }

    if (secondThreshold && referenceNow >= secondThreshold) {
      if (deadline.alert_second_sent === 0 && deadline.alert_failures < 3) {
        postsCount++;
        const roleId = dueSoonRole;
        const embed = {
          title: `📌 Deadline Reminder: [${deadline.course}] ${deadline.title}`,
          color: 0x3498db,
          fields: [
            { name: "Course", value: deadline.course, inline: true },
            { name: "Title", value: deadline.title, inline: true },
            { name: "Due (Asia/Manila)", value: formatManila12Hour(deadline.due_timestamp), inline: false },
            { name: "Countdown", value: `<t:${deadline.due_timestamp}:F> (<t:${deadline.due_timestamp}:R>)`, inline: false }
          ],
          footer: { text: "Study Bot • Deadline Alert" }
        };

        const failuresBeforePost = deadline.alert_failures;
        const success = await sendDiscordAlert(env.DISCORD_TOKEN, targetChannelId, roleId, embed);
        if (success) {
          await updateDeadlineAlertStatus(env.DB, { id: deadline.id, secondSent: 1 });
        } else {
          console.error(`Failed to dispatch second early alert for deadline ${deadline.id} to channel ${targetChannelId}`);
          await recordDeadlineAlertFailure(env.DB, deadline.id);
          if (failuresBeforePost + 1 >= 3) {
            await abandonDeadlineAlert(env.DB, { id: deadline.id, alertType: "second" });
          }
        }
      }
    }
  }
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
    const dueReminders = await getDueReminders(env.DB, now, 10);

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
            ],
            allowed_mentions: { parse: [], roles: [], users: [reminder.user_id] }
          })
        });

        if (response.ok || response.status === 404 || response.status === 403) {
          await markReminderSent(env.DB, reminder.id);
        }
      } catch {}
    }

    await processDeadlineAlerts(env, now);
  }
};
