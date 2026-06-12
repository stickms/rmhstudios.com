/**
 * Discord Bot — Main Entry Point
 *
 * Standalone Discord.js bot process for command-driven interactions.
 * Runs alongside the socket server and web app.
 *
 * Commands:
 *   /lightsout             — Launch the Lights Out activity
 *   /leaderboard [game]    — Show today's guild leaderboard
 *   /streak [game] [user]  — Show personal streak & stats
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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type Interaction,
} from 'discord.js';
import { logger } from './logger';
import { disconnectPrisma } from './prisma-client';
import { handleCommand } from './command-handler';
import { handlePush } from './commands/rmhbot-push';
import { handleChat } from './chat-handler';

// ─── Command imports ─────────────────────────────────────────────

import * as lightsoutCommand from './commands/lightsout';
import * as leaderboardCommand from './commands/leaderboard';
import * as streakCommand from './commands/streak';
import * as rmhbotCommand from './commands/rmhbot';
import * as rmhbotContinueCommand from './commands/rmhbot-continue';
import * as rmhbotPushCommand from './commands/rmhbot-push';
import * as chatCommand from './commands/chat';

// ─── Types ───────────────────────────────────────────────────────

interface Command {
  data: { name: string; toJSON(): object };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

// ─── Command registry ────────────────────────────────────────────
// Add new commands here as you build more activities.

const commands = new Collection<string, Command>();
commands.set(lightsoutCommand.data.name, lightsoutCommand);
commands.set(leaderboardCommand.data.name, leaderboardCommand);
commands.set(streakCommand.data.name, streakCommand);
commands.set(rmhbotCommand.data.name, rmhbotCommand);
commands.set(rmhbotContinueCommand.data.name, rmhbotContinueCommand);
commands.set(rmhbotPushCommand.data.name, rmhbotPushCommand);
commands.set(chatCommand.data.name, chatCommand);

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

    const route = guildId
      ? Routes.applicationGuildCommands(CLIENT_ID!, guildId)
      : Routes.applicationCommands(CLIENT_ID!);

    // Fetch existing commands so we can preserve the Entry Point command
    // (type 4). Discord's bulk PUT removes commands not in the body, but
    // the Entry Point command cannot be removed via bulk update (error 50240).
    const existing = (await rest.get(route)) as Array<{ type?: number }>;
    const entryPointCommands = existing.filter(cmd => cmd.type === 4);

    await rest.put(route, { body: [...commandData, ...entryPointCommands] });
    logger.info({ event: 'commands_registered', scope: guildId ? 'guild' : 'global', guildId });
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

client.once('clientReady', (c) => {
  logger.info({
    event: 'bot_ready',
    user: c.user.tag,
    guilds: c.guilds.cache.size,
  });
});

client.on('interactionCreate', async (interaction: Interaction) => {
  // ── Slash commands ────────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
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
      logger.error({ event: 'command_error', command: interaction.commandName, error: String(err) });

      const reply = { content: 'Something went wrong.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
    return;
  }

  // ── Button interactions ───────────────────────────────────────
  if (interaction.isButton()) {
    await handleButtonInteraction(interaction).catch(err => {
      logger.error({ event: 'button_error', customId: interaction.customId, error: String(err) });
    });
    return;
  }

  // ── Modal submissions ─────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    await handleModalSubmit(interaction).catch(err => {
      logger.error({ event: 'modal_error', customId: interaction.customId, error: String(err) });
    });
    return;
  }
});

async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  const [action, ownerId] = interaction.customId.split(':');

  if (action === 'rmhbot_continue') {
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: 'This session belongs to another user.', ephemeral: true });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`rmhbot_continue_modal:${ownerId}`)
      .setTitle('Continue Editing');

    const input = new TextInputBuilder()
      .setCustomId('request')
      .setLabel('What would you like to change next?')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (action === 'rmhbot_push') {
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: 'This session belongs to another user.', ephemeral: true });
      return;
    }
    await handlePush(interaction, ownerId);
    return;
  }

  if (action === 'chat_continue') {
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: 'This chat belongs to another user.', ephemeral: true });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`chat_continue_modal:${ownerId}`)
      .setTitle('Keep talking with Alex 💬');

    const input = new TextInputBuilder()
      .setCustomId('message')
      .setLabel('What do you wanna say?')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }
}

async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const [action, ownerId] = interaction.customId.split(':');

  if (action === 'rmhbot_continue_modal') {
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: 'This session belongs to another user.', ephemeral: true });
      return;
    }

    const request = interaction.fields.getTextInputValue('request');
    await handleCommand(interaction, { isNew: false, request, attachment: null });
    return;
  }

  if (action === 'chat_continue_modal') {
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: 'This chat belongs to another user.', ephemeral: true });
      return;
    }

    const message = interaction.fields.getTextInputValue('message');
    await handleChat(interaction, message, false);
    return;
  }
}

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
