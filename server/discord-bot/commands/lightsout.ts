/**
 * /lightsout — Launch the Lights Out daily puzzle activity
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

import {
  getDateSeed,
  formatDateKey,
} from '../../../lib/lights-out/seed';
import { getDailyShape, getShapeLabel } from '../../../lib/lights-out/shapes';

// ─── Command definition ──────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('lightsout')
  .setDescription('Launch the Lights Out daily puzzle');

// ─── Command handler ─────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const activityClientId = process.env.DISCORD_ACTIVITY_CLIENT_ID;

  if (!activityClientId) {
    await interaction.reply({
      content: 'Activity not configured. Please set `DISCORD_ACTIVITY_CLIENT_ID`.',
    });
    return;
  }

  const today = new Date();
  const seed = getDateSeed(today);
  const shape = getDailyShape(seed);
  const shapeLabel = getShapeLabel(shape);
  const dateKey = formatDateKey(today);

  const embed = new EmbedBuilder()
    .setTitle(`\u{1F526} Lights Out \u2014 ${dateKey}`)
    .setDescription(
      `**${shapeLabel}**\n\n` +
      'Click **Play** to launch the activity!'
    )
    .setColor(0xf59e0b)
    .setFooter({ text: 'Lights Out \u00b7 Daily Puzzle' })
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
  });
}
