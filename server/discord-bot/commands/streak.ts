/**
 * /streak [game] [user] — Show personal streak & stats
 *
 * The `game` option defaults to "lightsout" (the only activity for now).
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  AttachmentBuilder,
} from 'discord.js';

import { getPrismaClient } from '../prisma-client';
import { logger } from '../logger';
import { formatDateKey } from '../../../lib/lights-out/seed';
import {
  generateStreakImage,
  type StreakStats,
} from '../images';

// ─── Command definition ──────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('streak')
  .setDescription('Show your personal streak & stats')
  .addStringOption(opt =>
    opt
      .setName('game')
      .setDescription('Which game (default: lightsout)')
      .setRequired(false)
  )
  .addUserOption(opt =>
    opt
      .setName('user')
      .setDescription('User to view stats for (defaults to you)')
      .setRequired(false)
  );

// ─── Command handler ─────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const game = interaction.options.getString('game') ?? 'lightsout';

  if (game !== 'lightsout') {
    await interaction.reply({ content: `Unknown game: \`${game}\`. Available: \`lightsout\``, ephemeral: false });
    return;
  }

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
        if ((p.moves ?? 999) < (existing.moves ?? 999)) {
          byDate.set(p.dateKey, p);
        }
      }
    }

    const days = Array.from(byDate.entries())
      .sort(([a], [b]) => b.localeCompare(a)); // newest first

    if (days.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`\u{1F526} ${targetUser.username} \u2014 Lights Out Stats`)
        .setDescription('No games played yet!')
        .setColor(0xf59e0b);

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Calculate streaks
    let longestStreak = 0;
    let tempStreak = 0;

    const dateKeys = days.map(([dk]) => dk).sort();

    for (let i = 0; i < dateKeys.length; i++) {
      const dk = dateKeys[i];
      const entry = byDate.get(dk)!;

      if (entry.status === 'completed') {
        tempStreak++;

        if (i > 0) {
          const prevDate = new Date(dateKeys[i - 1]);
          const currDate = new Date(dk);
          const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays > 1) {
            tempStreak = 1;
          }
        }

        if (tempStreak > longestStreak) longestStreak = tempStreak;
      } else {
        tempStreak = 0;
      }
    }

    // Current streak: count backwards from today
    let currentStreak = 0;
    const todayDate = new Date();
    for (let d = 0; d < 365; d++) {
      const checkDate = new Date(todayDate);
      checkDate.setDate(checkDate.getDate() - d);
      const dk = formatDateKey(checkDate);
      const entry = byDate.get(dk);

      if (entry?.status === 'completed') {
        currentStreak++;
      } else if (d === 0) {
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
      .setTitle(`\u{1F526} ${targetUser.username} \u2014 Lights Out Stats`)
      .setDescription(
        `\u{1F525} **Current Streak:** ${currentStreak} day${currentStreak !== 1 ? 's' : ''}\n` +
        `\u{1F3C6} **Longest Streak:** ${longestStreak} day${longestStreak !== 1 ? 's' : ''}\n` +
        `\u{1F3AE} **Played:** ${totalPlayed} \u00b7 **Completed:** ${totalCompleted} (${completionRate}%)\n` +
        `\u{1F31F} **Perfects:** ${perfectCount}` +
        (averageMoves != null ? ` \u00b7 **Avg Moves:** ${averageMoves.toFixed(1)}` : '')
      )
      .setImage('attachment://lightsout-streak.png')
      .setColor(0xf59e0b)
      .setFooter({ text: 'Lights Out \u00b7 rmhstudios.com' })
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
