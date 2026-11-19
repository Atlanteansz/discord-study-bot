import {
  parseManilaDateTime,
  formatManila12Hour,
  getDateAutocompleteChoices
} from "./date.js";
import {
  insertDeadline,
  getUpcomingDeadlines,
  getActiveDeadlinesForGuild,
  getDeadlineById,
  completeDeadline,
  deleteDeadline,
  getGuildConfig,
  upsertGuildConfig,
  clearGuildConfigSetting,
  insertReminder
} from "./db.js";
import { findQuestionById, getRandomQuestion } from "./questions.js";

export const INTERACTION_TYPE = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4
};

export const RESPONSE_TYPE = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  UPDATE_MESSAGE: 7,
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8
};

const COLOR = {
  PRIMARY: 0x3498db,
  SUCCESS: 0x2ecc71,
  DANGER: 0xe74c3c
};

export function checkManageGuild(permissionsBitfield) {
  if (!permissionsBitfield) return false;
  try {
    const perms = BigInt(permissionsBitfield);
    const MANAGE_GUILD = 1n << 5n;
    const ADMINISTRATOR = 1n << 3n;
    return (perms & MANAGE_GUILD) === MANAGE_GUILD || (perms & ADMINISTRATOR) === ADMINISTRATOR;
  } catch {
    return false;
  }
}

export const COMMAND_DEFINITIONS = [
  {
    name: "help",
    description: "Display study bot commands and usage"
  },
  {
    name: "deadline",
    description: "Manage course assignment deadlines",
    options: [
      {
        type: 1,
        name: "add",
        description: "Add a course deadline (Asia/Manila time)",
        options: [
          {
            type: 3,
            name: "course",
            description: "Course code (e.g. CS101, NET201)",
            required: true
          },
          {
            type: 3,
            name: "title",
            description: "Assignment or task title",
            required: true
          },
          {
            type: 3,
            name: "date",
            description: "Date (YYYY-MM-DD or choose suggestion)",
            required: true,
            autocomplete: true
          },
          {
            type: 4,
            name: "hour",
            description: "Hour (1-12)",
            required: true,
            min_value: 1,
            max_value: 12
          },
          {
            type: 4,
            name: "minute",
            description: "Minute (0-59)",
            required: true,
            min_value: 0,
            max_value: 59
          },
          {
            type: 3,
            name: "period",
            description: "AM or PM",
            required: true,
            choices: [
              { name: "AM", value: "AM" },
              { name: "PM", value: "PM" }
            ]
          }
        ]
      },
      {
        type: 1,
        name: "list",
        description: "List upcoming course deadlines and overdue deadlines from the past 7 days",
        options: [
          {
            type: 3,
            name: "course",
            description: "Optional course code filter",
            required: false
          }
        ]
      },
      {
        type: 1,
        name: "done",
        description: "Mark a deadline as completed",
        options: [
          {
            type: 4,
            name: "id",
            description: "Deadline ID to complete",
            required: true,
            autocomplete: true
          }
        ]
      },
      {
        type: 1,
        name: "delete",
        description: "Delete a deadline",
        options: [
          {
            type: 4,
            name: "id",
            description: "Deadline ID to delete",
            required: true,
            autocomplete: true
          }
        ]
      }
    ]
  },
  {
    name: "config",
    description: "Manage server alert settings and notification roles",
    default_member_permissions: "32",
    options: [
      {
        type: 1,
        name: "set",
        description: "Configure deadline alert roles and channels",
        options: [
          {
            type: 8,
            name: "due_soon_role",
            description: "Role to ping for early deadline alerts",
            required: false
          },
          {
            type: 8,
            name: "overdue_role",
            description: "Role to ping when a deadline becomes overdue",
            required: false
          },
          {
            type: 7,
            name: "alert_channel",
            description: "Channel to post alerts to (falls back to deadline channel)",
            channel_types: [0, 5],
            required: false
          },
          {
            type: 4,
            name: "due_soon_minutes",
            description: "Minutes before due date to send early alert (15 to 1440, default 60)",
            min_value: 15,
            max_value: 1440,
            required: false
          },
          {
            type: 4,
            name: "second_alert_hours",
            description: "Hours before due date for an extra early alert (1 to 168, optional)",
            min_value: 1,
            max_value: 168,
            required: false
          }
        ]
      },
      {
        type: 1,
        name: "view",
        description: "View current server alert settings"
      },
      {
        type: 1,
        name: "clear",
        description: "Remove a server alert setting or reset all",
        options: [
          {
            type: 3,
            name: "setting",
            description: "Setting to remove",
            required: true,
            choices: [
              { name: "Due Soon Role", value: "due_soon_role" },
              { name: "Overdue Role", value: "overdue_role" },
              { name: "Alert Channel", value: "alert_channel" },
              { name: "Due Soon Minutes", value: "due_soon_minutes" },
              { name: "Second Alert Hours", value: "second_alert_hours" },
              { name: "All Settings", value: "all" }
            ]
          }
        ]
      }
    ]
  },
  {
    name: "remind",
    description: "Set a study reminder",
    options: [
      {
        type: 4,
        name: "minutes",
        description: "Minutes until reminder (e.g. 15, 60)",
        required: true
      },
      {
        type: 3,
        name: "message",
        description: "Reminder note or task",
        required: true
      }
    ]
  },
  {
    name: "quiz",
    description: "Practice questions with interactive buttons",
    options: [
      {
        type: 3,
        name: "subject",
        description: "Subject filter (e.g. cloud, networking, git, security)",
        required: false
      }
    ]
  }
];

function getOptionMap(options) {
  if (!Array.isArray(options)) return {};
  const map = {};
  for (const opt of options) {
    map[opt.name] = opt.value;
  }
  return map;
}

function requireGuild(interaction) {
  if (!interaction.guild_id) {
    return {
      type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: "Server Only Command",
            description: "This command can only be used inside a Discord server, not in direct messages.",
            color: COLOR.DANGER,
            footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
          }
        ],
        flags: 64
      }
    };
  }
  return null;
}

export function handleHelpCommand() {
  return {
    type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [
        {
          title: "Study Bot Help",
          description: "Commands for managing study schedules and quizzes.",
          color: COLOR.PRIMARY,
          fields: [
            {
              name: "/help",
              value: "Display this list of commands.",
              inline: false
            },
            {
              name: "/deadline add",
              value: "Add a deadline (Asia/Manila time). Options: course, title, date (autocomplete), hour (1-12), minute (0-59), period (AM/PM).",
              inline: false
            },
            {
              name: "/deadline list",
              value: "List upcoming course deadlines and overdue deadlines from the past 7 days. Optional course filter: `/deadline list course:CS101`.",
              inline: false
            },
            {
              name: "/deadline done",
              value: "Mark a deadline as completed so it no longer appears in upcoming lists. Syntax: `/deadline done id:1`.",
              inline: false
            },
            {
              name: "/deadline delete",
              value: "Delete a deadline. Only the creator or members with Manage Server can delete.",
              inline: false
            },
            {
              name: "/config set",
              value: "Configure notification roles (due_soon_role, overdue_role), alert channel, and alert timings (Manage Server required).",
              inline: false
            },
            {
              name: "/config view",
              value: "View current server notification and alert settings.",
              inline: false
            },
            {
              name: "/config clear",
              value: "Clear a server alert setting or reset all settings to default.",
              inline: false
            },
            {
              name: "/remind",
              value: "Schedule personal reminders delivered directly to this channel.",
              inline: false
            },
            {
              name: "/quiz",
              value: "Practice study questions with interactive answer buttons.",
              inline: false
            }
          ],
          footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
        }
      ]
    }
  };
}

export async function handleDeadlineCommand(interaction, db) {
  const guildCheck = requireGuild(interaction);
  if (guildCheck) {
    return guildCheck;
  }

  if (!db) {
    return {
      type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: "Database Unavailable",
            description: "D1 database binding DB is not configured.",
            color: COLOR.DANGER,
            footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
          }
        ],
        flags: 64
      }
    };
  }

  const subcommand = interaction.data?.options?.[0];
  const subName = subcommand?.name;
  const options = getOptionMap(subcommand?.options);

  if (subName === "add") {
    const course = typeof options.course === "string" ? options.course.trim() : "";
    const title = typeof options.title === "string" ? options.title.trim() : "";

    if (!course) {
      return {
        type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: "Missing Course Code",
              description: "Course is required (e.g. CS101, NET201).",
              color: COLOR.DANGER,
              footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
            }
          ],
          flags: 64
        }
      };
    }

    if (!title) {
      return {
        type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: "Missing Title",
              description: "Assignment or task title is required.",
              color: COLOR.DANGER,
              footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
            }
          ],
          flags: 64
        }
      };
    }

    const dateResult = parseManilaDateTime({
      dateStr: options.date,
      hour: options.hour,
      minute: options.minute,
      period: options.period
    });

    if (!dateResult.valid) {
      return {
        type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: "Invalid Input",
              description: dateResult.error,
              color: COLOR.DANGER,
              footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
            }
          ],
          flags: 64
        }
      };
    }

    const userId = interaction.member?.user?.id || interaction.user?.id;
    const deadlineId = await insertDeadline(db, {
      guildId: interaction.guild_id,
      channelId: interaction.channel_id,
      course,
      title,
      dueTimestamp: dateResult.timestamp,
      createdBy: userId
    });

    return {
      type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: "Deadline Added",
            color: COLOR.SUCCESS,
            fields: [
              { name: "Course", value: course.toUpperCase(), inline: true },
              { name: "Title", value: title, inline: true },
              {
                name: "Due (Asia/Manila)",
                value: formatManila12Hour(dateResult.timestamp),
                inline: false
              },
              {
                name: "Countdown",
                value: `<t:${dateResult.timestamp}:F> (<t:${dateResult.timestamp}:R>)`,
                inline: false
              }
            ],
            footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
          }
        ],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 4,
                label: "Delete",
                custom_id: `delete_deadline:${deadlineId || "recent"}`
              }
            ]
          }
        ]
      }
    };
  }

  if (subName === "list") {
    const course = typeof options.course === "string" ? options.course.trim() : "";
    const now = Math.floor(Date.now() / 1000);
    const minTimestamp = now - 7 * 86400;

    const deadlines = await getUpcomingDeadlines(db, {
      guildId: interaction.guild_id,
      course,
      minTimestamp,
      limit: 25
    });

    if (deadlines.length === 0) {
      return {
        type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: course ? `Deadlines: ${course.toUpperCase()}` : "Upcoming Deadlines",
              description: course
                ? `No active or recent deadlines found for **${course.toUpperCase()}**.`
                : "No active or recent deadlines found in this server.",
              color: COLOR.PRIMARY,
              footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
            }
          ]
        }
      };
    }

    const fields = deadlines.map((item) => {
      const isOverdue = item.due_timestamp < now;
      const titleText = isOverdue
        ? `ID #${item.id} • [${item.course}] ${item.title} ⚠️ OVERDUE`
        : `ID #${item.id} • [${item.course}] ${item.title}`;
      const descText = isOverdue
        ? `📅 ${formatManila12Hour(item.due_timestamp)}\n⚠️ Overdue by <t:${item.due_timestamp}:R> (<t:${item.due_timestamp}:F>)`
        : `📅 ${formatManila12Hour(item.due_timestamp)}\n⏳ <t:${item.due_timestamp}:F> (<t:${item.due_timestamp}:R>)`;
      return {
        name: titleText,
        value: descText,
        inline: false
      };
    });

    return {
      type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: course ? `Deadlines: ${course.toUpperCase()}` : "Deadlines",
            color: COLOR.PRIMARY,
            fields,
            footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
          }
        ]
      }
    };
  }

  if (subName === "done") {
    const rawId = options.id;
    const numId = Number(rawId);
    if (!Number.isInteger(numId) || numId <= 0) {
      return {
        type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: "Invalid Deadline ID",
              description: "Please specify a valid positive deadline ID.",
              color: COLOR.DANGER,
              footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
            }
          ],
          flags: 64
        }
      };
    }

    const completed = await completeDeadline(db, {
      guildId: interaction.guild_id,
      id: numId
    });

    if (!completed) {
      const existing = await getDeadlineById(db, {
        guildId: interaction.guild_id,
        id: numId
      });
      if (existing && existing.is_completed) {
        return {
          type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [
              {
                title: "Already Completed",
                description: `Deadline **#${numId}** is already marked as completed.`,
                color: COLOR.PRIMARY,
                footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
              }
            ],
            flags: 64
          }
        };
      }
      return {
        type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: "Deadline Not Found",
              description: `No active deadline with ID **#${numId}** was found in this server.`,
              color: COLOR.DANGER,
              footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
            }
          ],
          flags: 64
        }
      };
    }

    return {
      type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: "Deadline Completed",
            description: `Marked deadline **#${numId}** as completed. It will no longer trigger alerts or appear in active lists.`,
            color: COLOR.SUCCESS,
            footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
          }
        ]
      }
    };
  }

  if (subName === "delete") {
    const rawId = options.id;
    const numId = Number(rawId);
    if (!Number.isInteger(numId) || numId <= 0) {
      return {
        type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: "Invalid Deadline ID",
              description: "Please specify a valid positive deadline ID to delete.",
              color: COLOR.DANGER,
              footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
            }
          ],
          flags: 64
        }
      };
    }

    const deadline = await getDeadlineById(db, {
      guildId: interaction.guild_id,
      id: numId
    });

    if (!deadline) {
      return {
        type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: "Deadline Not Found",
              description: `Deadline **#${numId}** was not found or has already been deleted.`,
              color: COLOR.PRIMARY,
              footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
            }
          ],
          flags: 64
        }
      };
    }

    const userId = interaction.member?.user?.id || interaction.user?.id;
    const hasManage = checkManageGuild(interaction.member?.permissions);

    if (deadline.created_by && deadline.created_by !== userId && !hasManage) {
      return {
        type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "You do not have permission to delete this deadline. Only the creator or a member with Manage Server can delete it.",
          flags: 64
        }
      };
    }

    await deleteDeadline(db, {
      guildId: interaction.guild_id,
      id: numId
    });

    return {
      type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: "Deadline Deleted",
            description: `Deleted deadline **#${numId}** [${deadline.course}] ${deadline.title}.`,
            color: COLOR.DANGER,
            footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
          }
        ]
      }
    };
  }

  return {
    type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: "Invalid deadline subcommand.",
      flags: 64
    }
  };
}

export async function handleConfigCommand(interaction, db) {
  const guildCheck = requireGuild(interaction);
  if (guildCheck) {
    return guildCheck;
  }

  if (!checkManageGuild(interaction.member?.permissions)) {
    return {
      type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: "Permission Denied",
            description: "You need the Manage Server permission to configure Study Bot settings.",
            color: COLOR.DANGER,
            footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
          }
        ],
        flags: 64
      }
    };
  }

  if (!db) {
    return {
      type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: "Database Unavailable",
            description: "D1 database binding DB is not configured.",
            color: COLOR.DANGER,
            footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
          }
        ],
        flags: 64
      }
    };
  }

  const subcommand = interaction.data?.options?.[0];
  const subName = subcommand?.name;
  const options = getOptionMap(subcommand?.options);

  if (subName === "set") {
    const hasAnyOption =
      options.due_soon_role !== undefined ||
      options.overdue_role !== undefined ||
      options.alert_channel !== undefined ||
      options.due_soon_minutes !== undefined ||
      options.second_alert_hours !== undefined;

    if (!hasAnyOption) {
      return {
        type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: "No Settings Provided",
              description: "Please specify at least one option to update.",
              color: COLOR.DANGER,
              footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
            }
          ],
          flags: 64
        }
      };
    }

    if (
      options.due_soon_role === interaction.guild_id ||
      options.overdue_role === interaction.guild_id
    ) {
      return {
        type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: "Invalid Role",
              description: "The @everyone role cannot be used for alert pings. Please select a specific role.",
              color: COLOR.DANGER,
              footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
            }
          ],
          flags: 64
        }
      };
    }

    if (options.due_soon_minutes !== undefined) {
      const m = Number(options.due_soon_minutes);
      if (!Number.isInteger(m) || m < 15 || m > 1440) {
        return {
          type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [
              {
                title: "Invalid Parameter",
                description: "due_soon_minutes must be an integer between 15 and 1440.",
                color: COLOR.DANGER,
                footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
              }
            ],
            flags: 64
          }
        };
      }
    }

    if (options.second_alert_hours !== undefined) {
      const h = Number(options.second_alert_hours);
      if (!Number.isInteger(h) || h < 1 || h > 168) {
        return {
          type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [
              {
                title: "Invalid Parameter",
                description: "second_alert_hours must be an integer between 1 and 168.",
                color: COLOR.DANGER,
                footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
              }
            ],
            flags: 64
          }
        };
      }
    }

    const existing = await getGuildConfig(db, interaction.guild_id);
    const dueSoonRole = options.due_soon_role !== undefined ? options.due_soon_role : existing?.due_soon_role;
    const overdueRole = options.overdue_role !== undefined ? options.overdue_role : existing?.overdue_role;
    const alertChannel = options.alert_channel !== undefined ? options.alert_channel : existing?.alert_channel;
    const dueSoonMinutes = options.due_soon_minutes !== undefined ? Number(options.due_soon_minutes) : (existing?.due_soon_minutes || 60);
    const secondAlertHours = options.second_alert_hours !== undefined ? Number(options.second_alert_hours) : existing?.second_alert_hours;

    await upsertGuildConfig(db, {
      guildId: interaction.guild_id,
      dueSoonRole,
      overdueRole,
      alertChannel,
      dueSoonMinutes,
      secondAlertHours
    });

    return {
      type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: "Server Configuration Updated",
            color: COLOR.SUCCESS,
            fields: [
              {
                name: "Due Soon Role",
                value: dueSoonRole ? `<@&${dueSoonRole}>` : "Not set (no ping)",
                inline: true
              },
              {
                name: "Overdue Role",
                value: overdueRole ? `<@&${overdueRole}>` : "Not set (no ping)",
                inline: true
              },
              {
                name: "Alert Channel",
                value: alertChannel ? `<#${alertChannel}>` : "Not set (falls back to deadline channel)",
                inline: false
              },
              {
                name: "Due Soon Alert",
                value: `${dueSoonMinutes} minutes before due`,
                inline: true
              },
              {
                name: "Second Alert",
                value: secondAlertHours ? `${secondAlertHours} hours before due` : "Disabled",
                inline: true
              }
            ],
            footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
          }
        ]
      }
    };
  }

  if (subName === "view") {
    const config = await getGuildConfig(db, interaction.guild_id);

    return {
      type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: "Server Alert Configuration",
            color: COLOR.PRIMARY,
            fields: [
              {
                name: "Due Soon Role",
                value: config?.due_soon_role ? `<@&${config.due_soon_role}>` : "Not set (no ping)",
                inline: true
              },
              {
                name: "Overdue Role",
                value: config?.overdue_role ? `<@&${config.overdue_role}>` : "Not set (no ping)",
                inline: true
              },
              {
                name: "Alert Channel",
                value: config?.alert_channel ? `<#${config.alert_channel}>` : "Not set (falls back to deadline channel)",
                inline: false
              },
              {
                name: "Due Soon Alert",
                value: `${config?.due_soon_minutes || 60} minutes before due`,
                inline: true
              },
              {
                name: "Second Alert",
                value: config?.second_alert_hours ? `${config.second_alert_hours} hours before due` : "Disabled",
                inline: true
              }
            ],
            footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
          }
        ]
      }
    };
  }

  if (subName === "clear") {
    const setting = options.setting;
    await clearGuildConfigSetting(db, interaction.guild_id, setting);

    return {
      type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: "Configuration Cleared",
            description: setting === "all" ? "Reset all server alert configurations to defaults." : `Cleared setting: **${setting}**.`,
            color: COLOR.SUCCESS,
            footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
          }
        ]
      }
    };
  }

  return {
    type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: "Invalid config subcommand.",
      flags: 64
    }
  };
}

export async function handleDeleteButton(interaction, db) {
  const customId = interaction.data?.custom_id;
  if (!customId || !customId.startsWith("delete_deadline:")) {
    return null;
  }

  const rawId = customId.split(":")[1];
  const numId = Number(rawId);

  const guildCheck = requireGuild(interaction);
  if (guildCheck) {
    return guildCheck;
  }

  if (!db || !Number.isInteger(numId)) {
    return {
      type: RESPONSE_TYPE.UPDATE_MESSAGE,
      data: {
        embeds: [
          {
            title: "Deadline Deleted",
            description: "This deadline has already been deleted.",
            color: COLOR.DANGER,
            footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
          }
        ],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 4,
                label: "Deleted",
                custom_id: "deleted_disabled",
                disabled: true
              }
            ]
          }
        ]
      }
    };
  }

  const deadline = await getDeadlineById(db, {
    guildId: interaction.guild_id,
    id: numId
  });

  if (!deadline) {
    return {
      type: RESPONSE_TYPE.UPDATE_MESSAGE,
      data: {
        embeds: [
          {
            title: "Deadline Deleted",
            description: "This deadline has already been deleted.",
            color: COLOR.DANGER,
            footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
          }
        ],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 4,
                label: "Deleted",
                custom_id: "deleted_disabled",
                disabled: true
              }
            ]
          }
        ]
      }
    };
  }

  const userId = interaction.member?.user?.id || interaction.user?.id;
  const hasManage = checkManageGuild(interaction.member?.permissions);

  if (deadline.created_by && deadline.created_by !== userId && !hasManage) {
    return {
      type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "You do not have permission to delete this deadline. Only the creator or a member with Manage Server can delete it.",
        flags: 64
      }
    };
  }

  await deleteDeadline(db, {
    guildId: interaction.guild_id,
    id: numId
  });

  return {
    type: RESPONSE_TYPE.UPDATE_MESSAGE,
    data: {
      embeds: [
        {
          title: "Deadline Deleted",
          description: `Deadline **#${numId}** [${deadline.course}] ${deadline.title} was deleted.`,
          color: COLOR.DANGER,
          footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
        }
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 4,
              label: "Deleted",
              custom_id: "deleted_disabled",
              disabled: true
            }
          ]
        }
      ]
    }
  };
}

export async function handleRemindCommand(interaction, db) {
  if (!db) {
    return {
      type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: "Database Unavailable",
            description: "D1 database binding DB is not configured.",
            color: COLOR.DANGER,
            footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
          }
        ],
        flags: 64
      }
    };
  }

  const options = getOptionMap(interaction.data?.options);
  const minutes = options.minutes;
  const message = typeof options.message === "string" ? options.message.trim() : "";

  if (typeof minutes !== "number" || minutes < 1 || minutes > 43200) {
    return {
      type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: "Invalid Reminder Duration",
            description: "Minutes must be a positive integer between 1 and 43200 (30 days).",
            color: COLOR.DANGER,
            footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
          }
        ],
        flags: 64
      }
    };
  }

  if (!message) {
    return {
      type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: "Missing Reminder Message",
            description: "Please specify a message for your reminder.",
            color: COLOR.DANGER,
            footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
          }
        ],
        flags: 64
      }
    };
  }

  const userId = interaction.member?.user?.id || interaction.user?.id;
  const channelId = interaction.channel_id;

  if (!channelId || !userId) {
    return {
      type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "Unable to determine origin channel or user for reminder.",
        flags: 64
      }
    };
  }

  const remindTimestamp = Math.floor(Date.now() / 1000) + minutes * 60;

  await insertReminder(db, {
    userId,
    channelId,
    message,
    remindTimestamp
  });

  return {
    type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [
        {
          title: "Reminder Scheduled",
          description: `I will ping you in this channel <t:${remindTimestamp}:R>.`,
          color: COLOR.SUCCESS,
          fields: [
            { name: "Message", value: message, inline: false },
            { name: "Scheduled (Asia/Manila)", value: formatManila12Hour(remindTimestamp), inline: true },
            { name: "Trigger Time", value: `<t:${remindTimestamp}:F>`, inline: true }
          ],
          footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
        }
      ]
    }
  };
}

export function handleQuizCommand(interaction) {
  const options = getOptionMap(interaction.data?.options);
  const subject = typeof options.subject === "string" ? options.subject.trim() : null;

  const question = getRandomQuestion(subject);
  if (!question) {
    return {
      type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: "Quiz Question Not Found",
            description: `No questions found for subject **${subject}**. Available subjects: cloud, networking, git, security.`,
            color: COLOR.DANGER,
            footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
          }
        ],
        flags: 64
      }
    };
  }

  const letters = ["A", "B", "C", "D"];
  const buttons = question.choices.map((choice, idx) => ({
    type: 2,
    style: 2,
    label: `${letters[idx]}. ${choice.length > 70 ? choice.slice(0, 67) + "..." : choice}`,
    custom_id: `quiz:${question.id}:${idx}`
  }));

  return {
    type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [
        {
          title: `Study Quiz: ${question.subject.toUpperCase()}`,
          description: question.question,
          color: COLOR.PRIMARY,
          footer: { text: "Select your answer below • Study Bot" }
        }
      ],
      components: [
        {
          type: 1,
          components: buttons
        }
      ]
    }
  };
}

export function handleQuizButton(interaction) {
  const customId = interaction.data?.custom_id;
  if (!customId || !customId.startsWith("quiz:")) {
    return null;
  }

  const [, questionId, choiceIdxStr] = customId.split(":");
  const choiceIdx = parseInt(choiceIdxStr, 10);
  const question = findQuestionById(questionId);

  if (!question) {
    return {
      type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "Quiz question no longer available.",
        flags: 64
      }
    };
  }

  const isCorrect = choiceIdx === question.answerIndex;
  const letters = ["A", "B", "C", "D"];
  const responder = interaction.member?.user?.username || interaction.user?.username || "Student";

  const updatedButtons = question.choices.map((choice, idx) => {
    let style = 2;
    if (idx === question.answerIndex) {
      style = 3;
    } else if (idx === choiceIdx) {
      style = 4;
    }
    return {
      type: 2,
      style,
      label: `${letters[idx]}. ${choice.length > 70 ? choice.slice(0, 67) + "..." : choice}`,
      custom_id: `quiz:${question.id}:${idx}`,
      disabled: true
    };
  });

  const resultText = isCorrect
    ? `✅ **Correct!** (${letters[question.answerIndex]}. ${question.choices[question.answerIndex]})\n\n${question.explanation}`
    : `❌ **Incorrect.** You selected **${letters[choiceIdx]}**.\n\n**Correct Answer**: **${letters[question.answerIndex]}. ${question.choices[question.answerIndex]}**\n\n${question.explanation}`;

  return {
    type: RESPONSE_TYPE.UPDATE_MESSAGE,
    data: {
      embeds: [
        {
          title: `Study Quiz: ${question.subject.toUpperCase()}`,
          description: question.question,
          color: isCorrect ? COLOR.SUCCESS : COLOR.DANGER,
          fields: [
            {
              name: isCorrect ? "Result" : "Evaluation",
              value: resultText,
              inline: false
            }
          ],
          footer: { text: `Answered by ${responder} • Study Bot` }
        }
      ],
      components: [
        {
          type: 1,
          components: updatedButtons
        }
      ]
    }
  };
}

export async function handleAutocomplete(interaction, env) {
  const { name } = interaction.data;
  if (name === "deadline") {
    const subcommand = interaction.data?.options?.[0];
    const focusedOption = subcommand?.options?.find((opt) => opt.focused === true);

    if (focusedOption?.name === "date") {
      const choices = getDateAutocompleteChoices(focusedOption.value);
      return {
        type: RESPONSE_TYPE.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
        data: { choices }
      };
    }

    if (focusedOption?.name === "id") {
      if (!interaction.guild_id || !env?.DB) {
        return {
          type: RESPONSE_TYPE.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
          data: { choices: [] }
        };
      }
      const active = await getActiveDeadlinesForGuild(env.DB, interaction.guild_id, 25);
      const query = String(focusedOption.value || "").toLowerCase().trim();
      const choices = active
        .map((d) => ({
          name: `#${d.id} [${d.course}] ${d.title}`.slice(0, 100),
          value: d.id
        }))
        .filter((c) => !query || c.name.toLowerCase().includes(query) || String(c.value).includes(query))
        .slice(0, 25);
      return {
        type: RESPONSE_TYPE.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
        data: { choices }
      };
    }
  }

  return {
    type: RESPONSE_TYPE.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: { choices: [] }
  };
}

export async function handleInteraction(interaction, env) {
  if (interaction.type === INTERACTION_TYPE.PING) {
    return { type: RESPONSE_TYPE.PONG };
  }

  if (interaction.type === INTERACTION_TYPE.APPLICATION_COMMAND_AUTOCOMPLETE) {
    return await handleAutocomplete(interaction, env);
  }

  if (interaction.type === INTERACTION_TYPE.MESSAGE_COMPONENT) {
    const deleteResponse = await handleDeleteButton(interaction, env?.DB);
    if (deleteResponse) {
      return deleteResponse;
    }
    const buttonResponse = handleQuizButton(interaction);
    if (buttonResponse) {
      return buttonResponse;
    }
  }

  if (interaction.type === INTERACTION_TYPE.APPLICATION_COMMAND) {
    const { name } = interaction.data;
    if (name === "help") {
      return handleHelpCommand();
    }
    if (name === "deadline") {
      return await handleDeadlineCommand(interaction, env?.DB);
    }
    if (name === "config") {
      return await handleConfigCommand(interaction, env?.DB);
    }
    if (name === "remind") {
      return await handleRemindCommand(interaction, env?.DB);
    }
    if (name === "quiz") {
      return handleQuizCommand(interaction);
    }
  }

  return {
    type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: "Unknown command or interaction.",
      flags: 64
    }
  };
}
