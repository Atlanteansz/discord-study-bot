import { parseManilaDate, formatManilaDate } from "./date.js";
import { insertDeadline, getUpcomingDeadlines, insertReminder } from "./db.js";
import { findQuestionById, getRandomQuestion } from "./questions.js";

export const INTERACTION_TYPE = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3
};

export const RESPONSE_TYPE = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  UPDATE_MESSAGE: 7
};

const COLOR = {
  PRIMARY: 0x3498db,
  SUCCESS: 0x2ecc71,
  DANGER: 0xe74c3c
};

function getOptionMap(options) {
  if (!Array.isArray(options)) return {};
  const map = {};
  for (const opt of options) {
    map[opt.name] = opt.value;
  }
  return map;
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
              value: "Add a course deadline (Asia/Manila time). Syntax: `/deadline add course:CS101 title:Midterm date:YYYY-MM-DD HH:mm`",
              inline: false
            },
            {
              name: "/deadline list",
              value: "List upcoming course deadlines. Optional course code filter: `/deadline list course:CS101`",
              inline: false
            },
            {
              name: "/remind",
              value: "Schedule a reminder delivered directly to this channel. Syntax: `/remind minutes:30 message:Read slides`",
              inline: false
            },
            {
              name: "/quiz",
              value: "Practice study questions with interactive buttons. Syntax: `/quiz subject:cloud`",
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
    const dateStr = typeof options.date === "string" ? options.date.trim() : "";

    if (!course || !title || !dateStr) {
      return {
        type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: "Missing Parameters",
              description: "Course, title, and date are all required.",
              color: COLOR.DANGER,
              footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
            }
          ],
          flags: 64
        }
      };
    }

    const dateResult = parseManilaDate(dateStr);
    if (!dateResult.valid) {
      return {
        type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: "Invalid Deadline Date",
              description: dateResult.error,
              color: COLOR.DANGER,
              footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
            }
          ],
          flags: 64
        }
      };
    }

    await insertDeadline(db, {
      course,
      title,
      dueTimestamp: dateResult.timestamp,
      guildId: interaction.guild_id,
      channelId: interaction.channel_id,
      createdBy: interaction.member?.user?.id || interaction.user?.id
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
              { name: "Due (Asia/Manila)", value: `${formatManilaDate(dateResult.timestamp)} (UTC+8)`, inline: false },
              { name: "Countdown", value: `<t:${dateResult.timestamp}:F> (<t:${dateResult.timestamp}:R>)`, inline: false }
            ],
            footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
          }
        ]
      }
    };
  }

  if (subName === "list") {
    const course = typeof options.course === "string" ? options.course.trim() : "";
    const deadlines = await getUpcomingDeadlines(db, course);

    if (deadlines.length === 0) {
      return {
        type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: "Upcoming Deadlines",
              description: course
                ? `No upcoming deadlines recorded for **${course.toUpperCase()}**.`
                : "No upcoming deadlines recorded.",
              color: COLOR.PRIMARY,
              footer: { text: "Study Bot • Asia/Manila (UTC+8)" }
            }
          ]
        }
      };
    }

    return {
      type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: course ? `Upcoming Deadlines: ${course.toUpperCase()}` : "Upcoming Deadlines",
            color: COLOR.PRIMARY,
            fields: deadlines.map((item) => ({
              name: `[${item.course}] ${item.title}`,
              value: `📅 Due: ${formatManilaDate(item.due_timestamp)} (UTC+8)\n⏳ <t:${item.due_timestamp}:F> (<t:${item.due_timestamp}:R>)`,
              inline: false
            })),
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

  const remindTimestamp = Math.floor(Date.now() / 1000) + (minutes * 60);

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
            { name: "Scheduled (Asia/Manila)", value: `${formatManilaDate(remindTimestamp)} (UTC+8)`, inline: true },
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

export async function handleInteraction(interaction, env) {
  if (interaction.type === INTERACTION_TYPE.PING) {
    return { type: RESPONSE_TYPE.PONG };
  }

  if (interaction.type === INTERACTION_TYPE.MESSAGE_COMPONENT) {
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
