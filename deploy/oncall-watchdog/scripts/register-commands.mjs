#!/usr/bin/env node
// Register the watchdog's Discord slash commands (currently `/page`) in one server.
//
//   DISCORD_BOT_TOKEN=… node deploy/oncall-watchdog/scripts/register-commands.mjs <application id> <guild id>
//
// Run once, and again whenever the command definition below changes. Guild
// commands update instantly (global ones can take an hour). The token is read
// from the environment only — never pass it as an argument.

const [appId, guildId] = process.argv.slice(2);
const token = process.env.DISCORD_BOT_TOKEN;
if (!appId || !guildId || !token) {
  console.error('usage: DISCORD_BOT_TOKEN=… register-commands.mjs <application id> <guild id>');
  process.exit(2);
}

const STRING = 3;
const INTEGER = 4;
export const COMMANDS = [
  {
    name: 'page',
    description: 'Cut a ticket to on-call',
    options: [
      {
        type: INTEGER,
        name: 'severity',
        description: 'How bad is it?',
        required: true,
        choices: [
          { name: 'SEV1 — all hands: pages on-call and escalation', value: 1 },
          { name: 'SEV2 — page on-call now', value: 2 },
          { name: 'SEV3 — needs attention in business hours', value: 3 },
          { name: 'SEV4 — low priority', value: 4 },
          { name: 'SEV5 — FYI', value: 5 },
        ],
      },
      { type: STRING, name: 'title', description: 'One line: what is wrong', required: true, max_length: 100 },
      { type: STRING, name: 'details', description: 'What you saw, where, since when', max_length: 1500 },
    ],
  },
];

const res = await fetch(`https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`, {
  method: 'PUT',
  headers: { authorization: `Bot ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify(COMMANDS),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Discord rejected the commands (HTTP ${res.status}):`, JSON.stringify(body).slice(0, 500));
  process.exit(1);
}
process.stdout.write(`Registered: ${body.map((c) => `/${c.name}`).join(', ')}\n`);
