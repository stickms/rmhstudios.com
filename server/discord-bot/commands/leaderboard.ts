/**
 * /leaderboard [game] — Show today's guild leaderboard
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
import {
  getDateSeed,
  formatDateKey,
} from '../../../lib/lights-out/seed';
import { getDailyShape, getShapeLabel } from '../../../lib/lights-out/shapes';
import {
  generateLeaderboardImage,
  type LeaderboardEntry,
} from '../images';

// ─── Command definition ──────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription("Show today's guild leaderboard")
  .addStringOption(opt =>
    opt
      .setName('game')
      .setDescription('Which game (default: lightsout)')
      .setRequired(false)
  );

// ─── Command handler ─────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const game = interaction.options.getString('game') ?? 'lightsout';

  if (game !== 'lightsout') {
    await interaction.reply({ content: `Unknown game: \`${game}\`. Available: \`lightsout\``, ephemeral: true });
    return;
  }

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

    const participants = await prisma.discordDailyParticipant.findMany({
      where: { guildId: interaction.guildId, dateKey },
      orderBy: [{ status: 'asc' }, { moves: 'asc' }],
    });

    if (participants.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`\u{1F526} Lights Out \u2014 ${dateKey}`)
        .setDescription(`**${shapeLabel}**\n\nNo one has played today yet! Be the first.`)
        .setColor(0xf59e0b)
        .setFooter({ text: 'Lights Out \u00b7 Daily Puzzle' });

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

    const png = await generateLeaderboardImage(dateKey, shapeLabel, entries);
    const attachment = new AttachmentBuilder(png, { name: 'lightsout-leaderboard.png' });

    const completed = participants.filter(p => p.status === 'completed');
    const playing = participants.filter(p => p.status === 'playing');

    const lines: string[] = [];
    const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
    const sorted = completed.sort((a, b) => (a.moves ?? 999) - (b.moves ?? 999));

    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const medal = i < 3 ? medals[i] : `**#${i + 1}**`;
      lines.push(`${medal} **${p.username}** \u2014 ${p.moves} move${p.moves !== 1 ? 's' : ''}${p.ratingLabel ? ` (${p.ratingLabel})` : ''}`);
    }

    if (playing.length > 0) {
      const names = playing.map(p => p.username).join(', ');
      lines.push(`\u{1F3AE} ${names} ${playing.length === 1 ? 'is' : 'are'} playing...`);
    }

    const embed = new EmbedBuilder()
      .setTitle(`\u{1F526} Lights Out \u2014 ${dateKey}`)
      .setDescription(
        `**${shapeLabel}**\n\n` +
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
