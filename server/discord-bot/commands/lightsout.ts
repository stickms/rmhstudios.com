/**
 * /lightsout command definition
 *
 * Subcommands:
 *   /lightsout play       — Launch the Lights Out activity
 *   /lightsout leaderboard — Show today's guild leaderboard
 *   /lightsout streak      — Show your personal streak & stats
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} from 'discord.js';

import { getPrismaClient } from '../prisma-client';
import { logger } from '../logger';
import {
  getDateSeed,
  createSeededRng,
  formatDateKey,
} from '../../../lib/lights-out/seed';
import { getDailyShape, getShapeLabel } from '../../../lib/lights-out/shapes';
import { generatePuzzle, getOptimalMoves } from '../../../lib/lights-out/lights-out';
import {
  generateBoardImage,
  generateLeaderboardImage,
  generateStreakImage,
  type LeaderboardEntry,
  type StreakStats,
} from '../images';

// ─── Command definition ──────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('lightsout')
  .setDescription('Lights Out — daily puzzle game')
  .addSubcommand(sub =>
    sub
      .setName('play')
      .setDescription('Launch the Lights Out activity')
  )
  .addSubcommand(sub =>
    sub
      .setName('leaderboard')
      .setDescription("Show today's guild leaderboard")
  )
  .addSubcommand(sub =>
    sub
      .setName('streak')
      .setDescription('Show your personal streak & stats')
      .addUserOption(opt =>
        opt
          .setName('user')
          .setDescription('User to view stats for (defaults to you)')
          .setRequired(false)
      )
  );

// ─── Command handler ─────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'play':
      return handlePlay(interaction);
    case 'leaderboard':
      return handleLeaderboard(interaction);
    case 'streak':
      return handleStreak(interaction);
    default:
      await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

// ─── /lightsout play ─────────────────────────────────────────────

async function handlePlay(interaction: ChatInputCommandInteraction): Promise<void> {
  const activityClientId = process.env.DISCORD_ACTIVITY_CLIENT_ID;

  if (!activityClientId) {
    await interaction.reply({
      content: 'Activity not configured. Please set `DISCORD_ACTIVITY_CLIENT_ID`.',
      ephemeral: true,
    });
    return;
  }

  const today = new Date();
  const seed = getDateSeed(today);
  const shape = getDailyShape(seed);
  const shapeLabel = getShapeLabel(shape);
  const dateKey = formatDateKey(today);
  const grid = generatePuzzle(createSeededRng(seed), shape);
  const optimal = getOptimalMoves(grid, shape);

  // Generate a preview board image
  const boardPng = await generateBoardImage(grid, shape, 0, optimal, dateKey);
  const attachment = new AttachmentBuilder(boardPng, { name: 'lightsout-board.png' });

  const embed = new EmbedBuilder()
    .setTitle(`\u{1F526} Lights Out — ${dateKey}`)
    .setDescription(
      `**${shapeLabel}**${optimal != null ? ` · Optimal: ${optimal} moves` : ''}\n\n` +
      'Click **Play** to launch the activity!'
    )
    .setImage('attachment://lightsout-board.png')
    .setColor(0xf59e0b)
    .setFooter({ text: 'Lights Out · Daily Puzzle' })
    .setTimestamp();

  const activityUrl = `https://discord.com/activities/${activityClientId}`;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Play')
      .setStyle(ButtonStyle.Link)
      .setURL(activityUrl)
      .setEmoji('\u{1F3AE}'),
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    files: [attachment],
  });
}

// ─── /lightsout leaderboard ──────────────────────────────────────

async function handleLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    const prisma = getPrismaClient();
    const today = new Date();
    const dateKey = formatDateKey(today);
    const seed = getDateSeed(today);
    const shape = getDailyShape(seed);
    const shapeLabel = getShapeLabel(shape);
    const grid = generatePuzzle(createSeededRng(seed), shape);
    const optimal = getOptimalMoves(grid, shape);

    const participants = await prisma.discordDailyParticipant.findMany({
      where: { guildId: interaction.guildId, dateKey },
      orderBy: [{ status: 'asc' }, { moves: 'asc' }],
    });

    if (participants.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`\u{1F526} Lights Out — ${dateKey}`)
        .setDescription(`**${shapeLabel}**${optimal != null ? ` · Optimal: ${optimal} moves` : ''}\n\nNo one has played today yet! Be the first.`)
        .setColor(0xf59e0b)
        .setFooter({ text: 'Lights Out · Daily Puzzle' });

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const entries: LeaderboardEntry[] = participants.map(p => ({
      username: p.username,
      discordId: p.discordId,
      avatarUrl: null,
      status: p.status,
      moves: p.moves,
      ratingEmoji: p.ratingEmoji,
      ratingLabel: p.ratingLabel,
    }));

    const png = await generateLeaderboardImage(dateKey, shapeLabel, optimal, entries);
    const attachment = new AttachmentBuilder(png, { name: 'lightsout-leaderboard.png' });

    const completed = participants.filter(p => p.status === 'completed');
    const playing = participants.filter(p => p.status === 'playing');

    const lines: string[] = [];
    const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
    const sorted = completed.sort((a, b) => (a.moves ?? 999) - (b.moves ?? 999));

    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const medal = i < 3 ? medals[i] : `**#${i + 1}**`;
      lines.push(`${medal} **${p.username}** — ${p.moves} move${p.moves !== 1 ? 's' : ''}${p.ratingLabel ? ` (${p.ratingLabel})` : ''}`);
    }

    if (playing.length > 0) {
      const names = playing.map(p => p.username).join(', ');
      lines.push(`\u{1F3AE} ${names} ${playing.length === 1 ? 'is' : 'are'} playing...`);
    }

    const embed = new EmbedBuilder()
      .setTitle(`\u{1F526} Lights Out — ${dateKey}`)
      .setDescription(
        `**${shapeLabel}**${optimal != null ? ` · Optimal: ${optimal} moves` : ''}\n\n` +
        lines.join('\n')
      )
      .setImage('attachment://lightsout-leaderboard.png')
      .setColor(0xf59e0b)
      .setFooter({ text: `${participants.length} player${participants.length !== 1 ? 's' : ''} today` })
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
      files: [attachment],
    });
  } catch (err) {
    logger.error({ event: 'leaderboard_error', error: String(err) });
    await interaction.editReply({ content: 'Failed to fetch leaderboard.' });
  }
}

// ─── /lightsout streak ───────────────────────────────────────────

async function handleStreak(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const prisma = getPrismaClient();
    const targetUser = interaction.options.getUser('user') ?? interaction.user;
    const discordId = targetUser.id;

    // Fetch all participation records for this user (across all guilds, deduplicated by date)
    const allParticipation = await prisma.discordDailyParticipant.findMany({
      where: { discordId },
      orderBy: { dateKey: 'desc' },
      select: { dateKey: true, status: true, moves: true, ratingEmoji: true, ratingLabel: true },
    });

    // Deduplicate by dateKey (keep best result per day)
    const byDate = new Map<string, typeof allParticipation[0]>();
    for (const p of allParticipation) {
      const existing = byDate.get(p.dateKey);
      if (!existing || (p.status === 'completed' && existing.status !== 'completed')) {
        byDate.set(p.dateKey, p);
      } else if (existing.status === 'completed' && p.status === 'completed') {
        // Keep lower moves
        if ((p.moves ?? 999) < (existing.moves ?? 999)) {
          byDate.set(p.dateKey, p);
        }
      }
    }

    const days = Array.from(byDate.entries())
      .sort(([a], [b]) => b.localeCompare(a)); // newest first

    if (days.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`\u{1F526} ${targetUser.username} — Lights Out Stats`)
        .setDescription('No games played yet!')
        .setColor(0xf59e0b);

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Calculate streaks
    const today = formatDateKey(new Date());
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    // Sort date keys chronologically for streak calculation
    const dateKeys = days.map(([dk]) => dk).sort();

    for (let i = 0; i < dateKeys.length; i++) {
      const dk = dateKeys[i];
      const entry = byDate.get(dk)!;

      if (entry.status === 'completed') {
        tempStreak++;

        // Check if previous day was consecutive
        if (i > 0) {
          const prevDate = new Date(dateKeys[i - 1]);
          const currDate = new Date(dk);
          const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays > 1) {
            tempStreak = 1; // Reset
          }
        }

        if (tempStreak > longestStreak) longestStreak = tempStreak;
      } else {
        tempStreak = 0;
      }
    }

    // Current streak: count backwards from today
    currentStreak = 0;
    const todayDate = new Date();
    for (let d = 0; d < 365; d++) {
      const checkDate = new Date(todayDate);
      checkDate.setDate(checkDate.getDate() - d);
      const dk = formatDateKey(checkDate);
      const entry = byDate.get(dk);

      if (entry?.status === 'completed') {
        currentStreak++;
      } else if (d === 0) {
        // Today not played yet — that's fine, check yesterday
        continue;
      } else {
        break;
      }
    }

    const totalPlayed = days.length;
    const totalCompleted = days.filter(([, p]) => p.status === 'completed').length;
    const perfectCount = days.filter(([, p]) => p.ratingEmoji === '\u{1F31F}').length;

    const completedMoves = days
      .filter(([, p]) => p.status === 'completed' && p.moves != null)
      .map(([, p]) => p.moves!);
    const averageMoves = completedMoves.length > 0
      ? completedMoves.reduce((a, b) => a + b, 0) / completedMoves.length
      : null;

    const recentDays = days.slice(0, 14).map(([dk, p]) => ({
      dateKey: dk,
      status: p.status,
      ratingEmoji: p.ratingEmoji,
    }));

    const stats: StreakStats = {
      username: targetUser.username,
      currentStreak,
      longestStreak,
      totalPlayed,
      totalCompleted,
      perfectCount,
      averageMoves,
      recentDays,
    };

    const png = await generateStreakImage(stats);
    const attachment = new AttachmentBuilder(png, { name: 'lightsout-streak.png' });

    const completionRate = totalPlayed > 0
      ? Math.round((totalCompleted / totalPlayed) * 100)
      : 0;

    const embed = new EmbedBuilder()
      .setTitle(`\u{1F526} ${targetUser.username} — Lights Out Stats`)
      .setDescription(
        `\u{1F525} **Current Streak:** ${currentStreak} day${currentStreak !== 1 ? 's' : ''}\n` +
        `\u{1F3C6} **Longest Streak:** ${longestStreak} day${longestStreak !== 1 ? 's' : ''}\n` +
        `\u{1F3AE} **Played:** ${totalPlayed} · **Completed:** ${totalCompleted} (${completionRate}%)\n` +
        `\u{1F31F} **Perfects:** ${perfectCount}` +
        (averageMoves != null ? ` · **Avg Moves:** ${averageMoves.toFixed(1)}` : '')
      )
      .setImage('attachment://lightsout-streak.png')
      .setColor(0xf59e0b)
      .setFooter({ text: 'Lights Out · rmhstudios.com' })
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
      files: [attachment],
    });
  } catch (err) {
    logger.error({ event: 'streak_error', error: String(err) });
    await interaction.editReply({ content: 'Failed to fetch stats.' });
  }
}
