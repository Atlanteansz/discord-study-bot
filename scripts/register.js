import fs from "node:fs";
import path from "node:path";
import { COMMAND_DEFINITIONS } from "../src/commands.js";

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

const url = guildId
  ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
  : `https://discord.com/api/v10/applications/${applicationId}/commands`;

const response = await fetch(url, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(COMMAND_DEFINITIONS)
});

if (response.ok) {
  const data = await response.json();
  console.log(`Registered ${data.length} command(s) successfully.`);
} else {
  const err = await response.text();
  console.error(`Failed to register commands: ${response.status} ${err}`);
  process.exit(1);
}
