import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';

export type ReplierInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | ModalSubmitInteraction;

export interface ActionEntry {
  tool: string;
  arg: string;
  status: 'pending' | 'done' | 'error';
}

const FIELD_MAX = 1024;
// Minimum seconds between thought-only updates (action changes bypass this)
const THOUGHT_FLUSH_MS = 10_000;

export class ProgressReporter {
  private readonly interaction: ReplierInteraction;
  private readonly branchName: string;
  private readonly discordUserId: string;
  private readonly request: string;

  private thoughts = '';
  private actions: ActionEntry[] = [];

  // Separate timers: thoughts flush periodically, actions flush quickly
  private thoughtTimer: ReturnType<typeof setTimeout> | null = null;
  private actionTimer: ReturnType<typeof setTimeout> | null = null;

  private lastEditAt = 0;
  // Track what was last sent so we can detect real changes
  private lastSentActionStatuses: string[] = [];

  constructor(
    interaction: ReplierInteraction,
    branchName: string,
    discordUserId: string,
    request: string,
  ) {
    this.interaction = interaction;
    this.branchName = branchName;
    this.discordUserId = discordUserId;
    this.request = request;
  }

  update(thoughts: string, actions: ActionEntry[]): void {
    this.thoughts = thoughts;
    this.actions = [...actions];

    const newStatuses = actions.map(a => `${a.tool}:${a.status}`).join(',');
    const actionChanged = newStatuses !== this.lastSentActionStatuses.join(',');

    if (actionChanged) {
      this.lastSentActionStatuses = newStatuses.split(',');
      // Flush actions quickly — but collapse rapid multi-completions into one edit
      if (!this.actionTimer) {
        this.actionTimer = setTimeout(() => {
          this.actionTimer = null;
          void this.flush();
        }, 1_500);
      }
    } else if (!this.thoughtTimer) {
      // Schedule a periodic thought flush only if one isn't already waiting
      const elapsed = Date.now() - this.lastEditAt;
      const delay = Math.max(0, THOUGHT_FLUSH_MS - elapsed);
      this.thoughtTimer = setTimeout(() => {
        this.thoughtTimer = null;
        void this.flush();
      }, delay);
    }
    // If a timer already exists, do nothing — it'll fire with the latest content
  }

  private async flush(): Promise<void> {
    // Rate-limit: don't PATCH more than once per 3s regardless of trigger
    const elapsed = Date.now() - this.lastEditAt;
    if (elapsed < 3_000) {
      const wait = 3_000 - elapsed;
      await new Promise(r => setTimeout(r, wait));
    }
    await this.doEdit(this.buildWorkingPayload());
  }

  // ─── Embed builders ───────────────────────────────────────────

  private requestValue(): string {
    return this.request.length > FIELD_MAX ? this.request.slice(0, FIELD_MAX - 3) + '...' : this.request;
  }

  private thoughtFields(): Array<{ name: string; value: string; inline: boolean }> {
    if (!this.thoughts.trim()) {
      return [{ name: '💭 Thinking', value: '*Reasoning...*', inline: false }];
    }
    // Show the most recent ~3000 chars of reasoning
    const recent = this.thoughts.length > 3000 ? this.thoughts.slice(-3000) : this.thoughts;
    // Split into FIELD_MAX chunks
    const chunks: string[] = [];
    for (let i = 0; i < recent.length; i += FIELD_MAX) {
      chunks.push(recent.slice(i, i + FIELD_MAX));
    }
    return chunks.map((chunk, i) => ({
      name: chunks.length === 1 ? '💭 Thinking' : `💭 Thinking (${i + 1}/${chunks.length})`,
      value: chunk,
      inline: false,
    }));
  }

  private actionsValue(): string {
    if (this.actions.length === 0) return '*No actions yet*';
    const lines = this.actions.map(a => {
      const icon = a.status === 'done' ? '✅' : a.status === 'error' ? '❌' : '⏳';
      const arg = a.arg ? ` \`${a.arg.slice(0, 50)}\`` : '';
      return `• ${a.tool}${arg} ${icon}`;
    });
    const value = lines.join('\n');
    return value.length > FIELD_MAX ? value.slice(0, FIELD_MAX) : value;
  }

  private buildWorkingPayload() {
    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle('⚙️ Working...')
      .setDescription(`Branch: \`${this.branchName}\``)
      .addFields(
        { name: '📝 Request', value: this.requestValue(), inline: false },
        ...this.thoughtFields(),
        { name: '⚡ Actions', value: this.actionsValue(), inline: false },
      )
      .setFooter({ text: this.interaction.user.username });
    return { embeds: [embed], components: [] };
  }

  private async doEdit(payload: object): Promise<void> {
    try {
      await this.interaction.editReply(payload);
      this.lastEditAt = Date.now();
    } catch (err: any) {
      if (err?.status === 429) {
        const retryAfter = ((err?.rawError?.retry_after as number | undefined) ?? 5) * 1000;
        setTimeout(() => void this.doEdit(payload), retryAfter);
      }
    }
  }

  async flushPending(): Promise<void> {
    if (this.thoughtTimer) { clearTimeout(this.thoughtTimer); this.thoughtTimer = null; }
    if (this.actionTimer) { clearTimeout(this.actionTimer); this.actionTimer = null; }
    await this.doEdit(this.buildWorkingPayload());
  }

  private buildButtons() {
    const continueBtn = new ButtonBuilder()
      .setCustomId(`rmhbot_continue:${this.discordUserId}`)
      .setLabel('Continue editing')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔄');
    const pushBtn = new ButtonBuilder()
      .setCustomId(`rmhbot_push:${this.discordUserId}`)
      .setLabel('Push PR')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📤');
    return new ActionRowBuilder<ButtonBuilder>().addComponents(continueBtn, pushBtn);
  }

  async finalize(sha: string, changedFiles: string[], summary: string): Promise<void> {
    if (this.thoughtTimer) { clearTimeout(this.thoughtTimer); this.thoughtTimer = null; }
    if (this.actionTimer) { clearTimeout(this.actionTimer); this.actionTimer = null; }

    const fileList =
      changedFiles.length > 0
        ? changedFiles.map(f => `• \`${f}\``).join('\n').slice(0, FIELD_MAX)
        : '• No files changed';

    const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle(`✅ Done | Commit \`${sha}\``)
      .setDescription(`Branch: \`${this.branchName}\``)
      .addFields(
        { name: '📝 Request', value: this.requestValue(), inline: false },
        { name: '📝 Changes', value: fileList, inline: false },
        { name: '📋 Summary', value: summary.slice(0, FIELD_MAX) || 'Changes applied.', inline: false },
      )
      .setFooter({ text: this.interaction.user.username });

    await this.interaction
      .editReply({ embeds: [embed], components: [this.buildButtons()] })
      .catch(() => {});
  }

  async finalizeNoChanges(summary: string): Promise<void> {
    if (this.thoughtTimer) { clearTimeout(this.thoughtTimer); this.thoughtTimer = null; }
    if (this.actionTimer) { clearTimeout(this.actionTimer); this.actionTimer = null; }

    const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle('✅ Done')
      .setDescription(`Branch: \`${this.branchName}\``)
      .addFields(
        { name: '📝 Request', value: this.requestValue(), inline: false },
        { name: '📋 Summary', value: (summary || 'No file changes were made.').slice(0, FIELD_MAX), inline: false },
      )
      .setFooter({ text: this.interaction.user.username });

    const continueBtn = new ButtonBuilder()
      .setCustomId(`rmhbot_continue:${this.discordUserId}`)
      .setLabel('Continue editing')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔄');

    await this.interaction
      .editReply({ embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(continueBtn)] })
      .catch(() => {});
  }

  async error(message: string): Promise<void> {
    if (this.thoughtTimer) { clearTimeout(this.thoughtTimer); this.thoughtTimer = null; }
    if (this.actionTimer) { clearTimeout(this.actionTimer); this.actionTimer = null; }

    const embed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle('❌ Error')
      .setDescription(`Branch: \`${this.branchName}\`\n\n${message.slice(0, 3900)}`)
      .setFooter({ text: this.interaction.user.username });

    await this.interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
  }
}
