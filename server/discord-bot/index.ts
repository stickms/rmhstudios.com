/**
 * Discord Bot — Main Entry Point
 *
 * Standalone Discord.js bot process for command-driven interactions.
 * Runs alongside the socket server and web app.
 *
 * Commands:
 *   /lightsout play        — Launch the Lights Out activity
 *   /lightsout leaderboard — Show today's guild leaderboard
 *   /lightsout streak      — Show personal streak & stats
 *
 * Designed for easy extension: add new command files in ./commands/
 * and register them in the commands map below.
 */

import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Collection,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js';
import { logger } from './logger';
import { disconnectPrisma } from './prisma-client';

// ─── Command imports ─────────────────────────────────────────────

import * as lightsoutCommand from './commands/lightsout';

// ─── Types ───────────────────────────────────────────────────────

interface Command {
  data: { name: string; toJSON(): object };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

// ─── Command registry ────────────────────────────────────────────
// Add new commands here as you build more activities.

const commands = new Collection<string, Command>();
commands.set(lightsoutCommand.data.name, lightsoutCommand);

// ─── Startup validation ──────────────────────────────────────────

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_ACTIVITY_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_BOT_CLIENT_ID ?? process.env.DISCORD_ACTIVITY_CLIENT_ID;

if (!BOT_TOKEN) {
  logger.error({ event: 'fatal_missing_token', message: 'DISCORD_BOT_TOKEN or DISCORD_ACTIVITY_BOT_TOKEN is required' });
  process.exit(1);
}

if (!CLIENT_ID) {
  logger.error({ event: 'fatal_missing_client_id', message: 'DISCORD_BOT_CLIENT_ID or DISCORD_ACTIVITY_CLIENT_ID is required' });
  process.exit(1);
}

// ─── Register slash commands with Discord ────────────────────────

async function registerCommands(): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN!);

  const commandData = commands.map(cmd => cmd.data.toJSON());

  try {
    logger.info({ event: 'registering_commands', count: commandData.length });

    // Use guild-specific registration in dev, global in production
    const guildId = process.env.DISCORD_DEV_GUILD_ID;

    if (guildId) {
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID!, guildId),
        { body: commandData },
      );
      logger.info({ event: 'commands_registered', scope: 'guild', guildId });
    } else {
      await rest.put(
        Routes.applicationCommands(CLIENT_ID!),
        { body: commandData },
      );
      logger.info({ event: 'commands_registered', scope: 'global' });
    }
  } catch (err) {
    logger.error({ event: 'command_registration_failed', error: String(err) });
    throw err;
  }
}

// ─── Create client ───────────────────────────────────────────────

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ─── Event handlers ──────────────────────────────────────────────

client.once('ready', (c) => {
  logger.info({
    event: 'bot_ready',
    user: c.user.tag,
    guilds: c.guilds.cache.size,
  });
});

client.on('interactionCreate', async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    logger.warn({ event: 'unknown_command', name: interaction.commandName });
    return;
  }

  try {
    logger.info({
      event: 'command_received',
      command: interaction.commandName,
      subcommand: interaction.options.getSubcommand(false) ?? undefined,
      userId: interaction.user.id,
      guildId: interaction.guildId ?? undefined,
    });

    await command.execute(interaction);
  } catch (err) {
    logger.error({
      event: 'command_error',
      command: interaction.commandName,
      error: String(err),
    });

    const reply = { content: 'Something went wrong.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

// ─── Graceful shutdown ───────────────────────────────────────────

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ event: 'shutdown_start', signal });

  client.destroy();
  await disconnectPrisma();

  logger.info({ event: 'shutdown_complete' });
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Start ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  await registerCommands();
  await client.login(BOT_TOKEN);
}

main().catch(err => {
  logger.error({ event: 'startup_failed', error: String(err) });
  process.exit(1);
});
