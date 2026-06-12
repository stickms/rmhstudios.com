import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, ButtonInteraction } from 'discord.js';
import { sessions, isSessionLocked } from '../conversation';
import { runTypecheck, createPullRequest, getLastCommitMessage, removeWorktree } from '../git-ops';

export const data = new SlashCommandBuilder()
  .setName('rmhbot-push')
  .setDescription('Open a GitHub PR from your active RMHBot branch')
  .addStringOption(option =>
    option
      .setName('title')
      .setDescription('PR title (defaults to last commit message)')
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await handlePush(interaction, interaction.user.id, interaction.options.getString('title'));
}

export async function handlePush(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  userId: string,
  customTitle?: string | null,
): Promise<void> {
  const state = sessions.get(userId);

  if (!state) {
    await interaction.reply({ content: 'No active session — use `/rmhbot` to start one.' });
    return;
  }

  if (isSessionLocked(state)) {
    await interaction.reply({ content: 'Still working on your last request — please wait.' });
    return;
  }

  await interaction.deferReply();

  const checkingEmbed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle('🔍 Checking...')
    .setDescription(`Running typecheck on \`${state.branchName}\`...`);
  await interaction.editReply({ embeds: [checkingEmbed], components: [] });

  const tc = await runTypecheck(state.worktreePath);
  if (!tc.success) {
    const errors = tc.output.slice(0, 3800);
    const embed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle('❌ Typecheck Failed')
      .setDescription(`Fix these errors before opening a PR.\n\`\`\`\n${errors}\n\`\`\``);
    await interaction.editReply({ embeds: [embed], components: [] });
    return;
  }

  let title = customTitle;
  if (!title) {
    title = await getLastCommitMessage(state.worktreePath).catch(
      () => `RMHBot changes on ${state.branchName}`,
    );
  }

  try {
    const body = [
      `## RMHBot Changes`,
      ``,
      `Branch: \`${state.branchName}\``,
      `Requested by: **${state.discordUsername}** (Discord ID \`${state.discordUserId}\`)`,
      ``,
      `---`,
      `*Opened via RMHBot \`/rmhbot-push\`*`,
    ].join('\n');

    const prUrl = await createPullRequest(state.branchName, title, body);

    // Clean up the worktree now that work is done
    await removeWorktree(state.worktreePath).catch(() => {});
    sessions.delete(userId);

    const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle('✅ PR Opened!')
      .setDescription(`${prUrl}\n\nOnce merged, the site will redeploy automatically.`);
    await interaction.editReply({ embeds: [embed], components: [] });
  } catch (err) {
    const embed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle('❌ PR Creation Failed')
      .setDescription(String(err).slice(0, 3900));
    await interaction.editReply({ embeds: [embed], components: [] });
  }
}
