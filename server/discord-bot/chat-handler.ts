import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type OpenAI from 'openai';
import { deepseek } from './deepseek';
import { getPrismaClient } from './prisma-client';

type ReplierInteraction = ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction;

interface ChatSession {
  userId: string;
  username: string;
  history: OpenAI.Chat.ChatCompletionMessageParam[];
  lastMessageId: string | undefined;
}

// In-memory cache — DB is the source of truth across restarts
export const chatSessions = new Map<string, ChatSession>();

// Discord embed limits (https://discord.com/developers/docs/resources/message#embed-object-embed-limits)
const FIELD_VALUE_MAX = 1024;
const TITLE_MAX = 256;
const FOOTER_MAX = 2048;
const MAX_FIELDS = 25;
const EMBED_TOTAL_MAX = 6000;

const EMBED_TITLE = 'Alex Wu 💬';
const YOU_FIELD_NAME = '💬 You';
const ALEX_FIELD_NAME = '🤙 Alex';
const CONTINUATION_FIELD_NAME = '​'; // zero-width space

/** Cut `text` to at most `max` chars, appending an ellipsis when it overflows. */
function truncate(text: string, max: number): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  if (max <= 1) return text.slice(0, max);
  return text.slice(0, max - 1) + '…';
}

const ALEX_SYSTEM_PROMPT = `You are Alex Wu, a 21-year-old CS student at the University of Minnesota Twin Cities (UMN-TC), spending your summer as a software engineer intern at Wells Fargo.

Personality:
- Absolutely obsessed with boba — you mention it whenever you can and treat it like a personality trait
- LinkedIn is your second home; you're always posting about your internship wins, connecting with recruiters, writing thought-leader posts ironically
- You love vibe coding — building stuff by vibing, no overplanning, just shipping
- You talk naturally in AAVE with a blaccent. Organically use phrases like "no cap", "fr fr", "lowkey", "on god", "finna", "sheesh", "bet", "bussin", "it's giving", "deadass", "real talk", "ima", "tryna", "slay", "no shot", "that slaps", "bro what" — woven in naturally, not forced
- You gas people up, you're hype and positive
- Self-aware about being a tech bro intern but fully embrace it

Keep replies conversational, punchy, and real. Don't over-explain. Sound like you'd text this, not write it.`;

async function loadSession(userId: string, username: string): Promise<ChatSession> {
  const cached = chatSessions.get(userId);
  if (cached) return cached;

  const db = getPrismaClient();
  const row = await db.discordChatSession.findUnique({ where: { discordUserId: userId } }).catch(() => null);

  const session: ChatSession = row
    ? {
        userId,
        username,
        history: row.history as unknown as OpenAI.Chat.ChatCompletionMessageParam[],
        lastMessageId: row.lastMessageId ?? undefined,
      }
    : {
        userId,
        username,
        history: [{ role: 'system', content: ALEX_SYSTEM_PROMPT }],
        lastMessageId: undefined,
      };

  chatSessions.set(userId, session);
  return session;
}

async function saveSession(session: ChatSession): Promise<void> {
  const db = getPrismaClient();
  await db.discordChatSession.upsert({
    where: { discordUserId: session.userId },
    create: {
      discordUserId: session.userId,
      username: session.username,
      history: session.history as object[],
      lastMessageId: session.lastMessageId ?? null,
    },
    update: {
      username: session.username,
      history: session.history as object[],
      lastMessageId: session.lastMessageId ?? null,
    },
  }).catch(() => {});
}

export async function handleChat(
  interaction: ReplierInteraction,
  message: string,
  isNew: boolean,
): Promise<void> {
  const userId = interaction.user.id;
  const username = interaction.user.username;

  let session: ChatSession;
  if (isNew) {
    session = {
      userId,
      username,
      history: [{ role: 'system', content: ALEX_SYSTEM_PROMPT }],
      lastMessageId: undefined,
    };
    chatSessions.set(userId, session);
  } else {
    session = await loadSession(userId, username);
  }

  session.history.push({ role: 'user', content: message });

  await interaction.deferReply();

  try {
    const response = await deepseek.chat.completions.create({
      model: 'deepseek-v4-flash',
      messages: session.history,
      stream: false,
    });

    const reply = response.choices[0]?.message?.content ?? '(no response)';
    session.history.push({ role: 'assistant', content: reply });

    const title = EMBED_TITLE.slice(0, TITLE_MAX);
    const footer = username.slice(0, FOOTER_MAX);

    // Running budget against Discord's 6000-char total across the whole embed.
    let budget = EMBED_TOTAL_MAX - title.length - footer.length;

    const fields: Array<{ name: string; value: string; inline: boolean }> = [];

    // The user's prompt, echoed back, gets first claim on the budget.
    const youValue = truncate(message, Math.min(FIELD_VALUE_MAX, budget - YOU_FIELD_NAME.length));
    if (youValue.length > 0) {
      fields.push({ name: YOU_FIELD_NAME, value: youValue, inline: false });
      budget -= YOU_FIELD_NAME.length + youValue.length;
    }

    // Split the reply across as many fields as fit within the field count and
    // total-character caps; cut it off (with an ellipsis) when we run out.
    let remaining = reply || '(no response)';
    let replyFieldCount = 0;
    let truncated = false;
    while (remaining.length > 0) {
      if (fields.length >= MAX_FIELDS) {
        truncated = true;
        break;
      }
      const name = replyFieldCount === 0 ? ALEX_FIELD_NAME : CONTINUATION_FIELD_NAME;
      const valueBudget = Math.min(FIELD_VALUE_MAX, budget - name.length);
      if (valueBudget <= 0) {
        truncated = true;
        break;
      }
      const value = remaining.slice(0, valueBudget);
      fields.push({ name, value, inline: false });
      budget -= name.length + value.length;
      remaining = remaining.slice(value.length);
      replyFieldCount++;
    }

    // If we couldn't fit everything, mark the last field so it's obvious.
    // Replace the tail rather than append so the field can't grow past its budget.
    if (truncated && fields.length > 0) {
      const last = fields[fields.length - 1];
      last.value = last.value.slice(0, Math.max(0, last.value.length - 1)) + '…';
    }

    const embed = new EmbedBuilder()
      .setColor(0xa855f7)
      .setTitle(title)
      .addFields(fields)
      .setFooter({ text: footer });

    const continueBtn = new ButtonBuilder()
      .setCustomId(`chat_continue:${userId}`)
      .setLabel('Keep talking')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('💬');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(continueBtn);

    await interaction.editReply({ embeds: [embed], components: [row] });
    const sent = await interaction.fetchReply();
    session.lastMessageId = sent.id;
    await saveSession(session);
  } catch (err: any) {
    const embed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle('❌ bruh something broke no cap')
      .setDescription(String(err).slice(0, 3900))
      .setFooter({ text: username });
    await interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
  }
}
