import fs from "node:fs";
import path from "node:path";

function loadDevVars() {
  const envPath = path.resolve(".dev.vars");
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, "utf-8");
  const vars = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      vars[key] = val;
    }
  }
  return vars;
}

const devVars = loadDevVars();
const token = process.env.DISCORD_TOKEN || devVars.DISCORD_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID || devVars.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID || devVars.DISCORD_GUILD_ID;

if (!token || !applicationId) {
  console.error("Missing DISCORD_TOKEN or DISCORD_APPLICATION_ID in environment or .dev.vars");
  process.exit(1);
}

const commands = [
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
            description: "YYYY-MM-DD or YYYY-MM-DD HH:mm (Asia/Manila)",
            required: true
          }
        ]
      },
      {
        type: 1,
        name: "list",
        description: "List upcoming course deadlines",
        options: [
          {
            type: 3,
            name: "course",
            description: "Optional course code filter",
            required: false
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

const url = guildId
  ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
  : `https://discord.com/api/v10/applications/${applicationId}/commands`;

const response = await fetch(url, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(commands)
});

if (response.ok) {
  const data = await response.json();
  console.log(`Registered ${data.length} command(s) successfully.`);
} else {
  const err = await response.text();
  console.error(`Failed to register commands: ${response.status} ${err}`);
  process.exit(1);
}
