import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { handleChat } from '../chat-handler';

export const data = new SlashCommandBuilder()
  .setName('chat')
  .setDescription('Chat with Alex Wu 💬')
  .addStringOption(option =>
    option
      .setName('message')
      .setDescription('What do you wanna say?')
      .setRequired(true),
  )
  .addAttachmentOption(option =>
    option
      .setName('image')
      .setDescription('Optional image to show Alex')
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await handleChat(
    interaction,
    interaction.options.getString('message', true),
    true,
    interaction.options.getAttachment('image'),
  );
}
