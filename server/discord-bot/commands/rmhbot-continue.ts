import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { handleCommand } from '../command-handler';

export const data = new SlashCommandBuilder()
  .setName('rmhbot-continue')
  .setDescription('Continue editing on your active RMHBot branch')
  .addStringOption(option =>
    option
      .setName('request')
      .setDescription('Follow-up change or refinement')
      .setRequired(true),
  )
  .addAttachmentOption(option =>
    option
      .setName('attachment')
      .setDescription('Additional file or image')
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await handleCommand(interaction, {
    isNew: false,
    request: interaction.options.getString('request', true),
    attachment: interaction.options.getAttachment('attachment'),
  });
}
