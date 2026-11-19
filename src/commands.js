export const INTERACTION_TYPE = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3
};

export const RESPONSE_TYPE = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4
};

export function handleHelpCommand() {
  return {
    type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [
        {
          title: "Study Bot Help",
          description: "Commands for managing study schedules and quizzes.",
          color: 0x3498db,
          fields: [
            {
              name: "/help",
              value: "Display this list of commands.",
              inline: false
            },
            {
              name: "/deadline",
              value: "Track and list course deadlines (Asia/Manila time).",
              inline: false
            },
            {
              name: "/remind",
              value: "Schedule personal reminders delivered directly to the channel.",
              inline: false
            },
            {
              name: "/quiz",
              value: "Practice study questions with interactive answer buttons.",
              inline: false
            }
          ]
        }
      ]
    }
  };
}

export function handleInteraction(interaction) {
  if (interaction.type === INTERACTION_TYPE.PING) {
    return { type: RESPONSE_TYPE.PONG };
  }

  if (interaction.type === INTERACTION_TYPE.APPLICATION_COMMAND) {
    const { name } = interaction.data;
    if (name === "help") {
      return handleHelpCommand();
    }
  }

  return {
    type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: "Unknown command.",
      flags: 64
    }
  };
}
