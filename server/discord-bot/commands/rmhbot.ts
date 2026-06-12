import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { handleCommand } from '../command-handler';

export const data = new SlashCommandBuilder()
  .setName('rmhbot')
  .setDescription('Request a website change via AI')
  .addStringOption(option =>
    option
      .setName('request')
      .setDescription('What to change on the website')
      .setRequired(true),
  )
  .addAttachmentOption(option =>
    option
      .setName('attachment')
      .setDescription('Optional file or image to include')
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await handleCommand(interaction, {
    isNew: true,
    request: interaction.options.getString('request', true),
    attachment: interaction.options.getAttachment('attachment'),
  });
}
