import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type Attachment,
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
const EMBED_TITLE_TYPING = 'Alex Wu 💬 · typing…';
const YOU_FIELD_NAME = '💬 You';
const ALEX_FIELD_NAME = '🤙 Alex';
const CONTINUATION_FIELD_NAME = '​'; // zero-width space

// Hard cap on how long we'll wait for the model before giving up, and how often
// we push partial output to Discord while streaming (avoids hammering the API).
const CHAT_TIMEOUT_MS = 20_000;
const STREAM_EDIT_INTERVAL_MS = 2_000;

// Image attachments accepted on /chat — sent to the model and shown as the embed thumbnail.
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = (Number(process.env.RMHBOT_MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;

/** Cut `text` to at most `max` chars, appending an ellipsis when it overflows. */
function truncate(text: string, max: number): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  if (max <= 1) return text.slice(0, max);
  return text.slice(0, max - 1) + '…';
}

/**
 * Render the "You / Alex" conversation embed for `replyText`, packing the reply
 * across as many fields as fit within Discord's embed limits. Used for both the
 * throttled streaming updates and the final message.
 */
function buildChatEmbed(
  message: string,
  username: string,
  replyText: string,
  streaming: boolean,
  thumbnailUrl?: string,
): EmbedBuilder {
  const title = (streaming ? EMBED_TITLE_TYPING : EMBED_TITLE).slice(0, TITLE_MAX);
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
  let remaining = replyText || '(no response)';
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

  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);

  return embed;
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
  attachment: Attachment | null = null,
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

  await interaction.deferReply();

  // If an image is attached, send it to the model as vision input and keep its
  // URL for the embed thumbnail so others in the channel can see it too.
  let thumbnailUrl: string | undefined;
  if (attachment) {
    if (!IMAGE_TYPES.has(attachment.contentType ?? '')) {
      await interaction
        .followUp({ content: `\`${attachment.name}\` ain't an image I can read — dropping it 🙅`, flags: MessageFlags.Ephemeral })
        .catch(() => {});
    } else if (attachment.size > MAX_IMAGE_BYTES) {
      await interaction
        .followUp({ content: `\`${attachment.name}\` is too thicc (over the size limit) — dropping it 🙅`, flags: MessageFlags.Ephemeral })
        .catch(() => {});
    } else {
      const buf = await fetch(attachment.url).then(r => r.arrayBuffer()).catch(() => null);
      if (buf) {
        const base64 = Buffer.from(buf).toString('base64');
        session.history.push({
          role: 'user',
          content: [
            { type: 'text', text: message },
            { type: 'image_url', image_url: { url: `data:${attachment.contentType};base64,${base64}` } },
          ],
        });
        thumbnailUrl = attachment.url;
      }
    }
  }

  if (!thumbnailUrl) {
    session.history.push({ role: 'user', content: message });
  }

  // Abort the model call if it runs past CHAT_TIMEOUT_MS so the command can't
  // hang indefinitely waiting on the API.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

  try {
    let reply = '';
    let timedOut = false;
    let lastRenderedAt = 0;
    let pendingRender: Promise<unknown> | null = null;

    try {
      const stream = await deepseek.chat.completions.create(
        {
          model: 'deepseek-v4-flash',
          messages: session.history,
          stream: true,
        },
        { signal: controller.signal },
      );

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if (!delta) continue;
        reply += delta;

        // Throttle live updates to one in-flight edit at a time, at most every
        // STREAM_EDIT_INTERVAL_MS, so we don't spam the Discord API per token.
        const now = Date.now();
        if (!pendingRender && now - lastRenderedAt >= STREAM_EDIT_INTERVAL_MS) {
          lastRenderedAt = now;
          const embed = buildChatEmbed(message, username, reply, true, thumbnailUrl);
          pendingRender = interaction
            .editReply({ embeds: [embed], components: [] })
            .catch(() => {})
            .finally(() => {
              pendingRender = null;
            });
        }
      }
    } catch (err: any) {
      // A timeout aborts the stream; surface what we have instead of erroring out.
      if (controller.signal.aborted) {
        timedOut = true;
      } else {
        throw err;
      }
    }

    // Let any in-flight streaming edit settle so the final render lands last.
    if (pendingRender) await pendingRender;

    let finalReply = reply.trim();
    if (timedOut) {
      finalReply = finalReply
        ? finalReply + '\n\n*(Alex took too long — cutting it off here 💀)*'
        : 'bruh Alex is lagging hard rn, hit me again 💀';
    } else if (!finalReply) {
      finalReply = '(no response)';
    }

    session.history.push({ role: 'assistant', content: finalReply });

    const embed = buildChatEmbed(message, username, finalReply, false, thumbnailUrl);

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
  } finally {
    clearTimeout(timeout);
  }
}
