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

type ReplierInteraction = ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction;

interface ChatSession {
  userId: string;
  username: string;
  history: OpenAI.Chat.ChatCompletionMessageParam[];
}

export const chatSessions = new Map<string, ChatSession>();

const FIELD_MAX = 1024;

const ALEX_SYSTEM_PROMPT = `You are Alex Wu, a 21-year-old CS student at the University of Minnesota Twin Cities (UMN-TC), spending your summer as a software engineer intern at Wells Fargo.

Personality:
- Absolutely obsessed with boba — you mention it whenever you can and treat it like a personality trait
- LinkedIn is your second home; you're always posting about your internship wins, connecting with recruiters, writing thought-leader posts ironically
- You love vibe coding — building stuff by vibing, no overplanning, just shipping
- You talk naturally in AAVE with a blaccent. Organically use phrases like "no cap", "fr fr", "lowkey", "on god", "finna", "sheesh", "bet", "bussin", "it's giving", "deadass", "real talk", "ima", "tryna", "slay", "no shot", "that slaps", "bro what" — woven in naturally, not forced
- You gas people up, you're hype and positive
- Self-aware about being a tech bro intern but fully embrace it

Keep replies conversational, punchy, and real. Don't over-explain. Sound like you'd text this, not write it.`;

export async function handleChat(
  interaction: ReplierInteraction,
  message: string,
  isNew: boolean,
): Promise<void> {
  const userId = interaction.user.id;
  const username = interaction.user.username;

  let session = chatSessions.get(userId);

  if (isNew || !session) {
    session = {
      userId,
      username,
      history: [{ role: 'system', content: ALEX_SYSTEM_PROMPT }],
    };
    chatSessions.set(userId, session);
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

    const promptValue =
      message.length > FIELD_MAX ? message.slice(0, FIELD_MAX - 3) + '...' : message;

    // Split reply across multiple fields if it exceeds Discord's field limit
    const replyFields: Array<{ name: string; value: string; inline: boolean }> = [];
    for (let i = 0; i < reply.length; i += FIELD_MAX) {
      replyFields.push({
        name: i === 0 ? '🤙 Alex' : '​',
        value: reply.slice(i, i + FIELD_MAX),
        inline: false,
      });
    }
    if (replyFields.length === 0) {
      replyFields.push({ name: '🤙 Alex', value: '(no response)', inline: false });
    }

    const embed = new EmbedBuilder()
      .setColor(0xa855f7)
      .setTitle('Alex Wu 💬')
      .addFields(
        { name: '💬 You', value: promptValue, inline: false },
        ...replyFields,
      )
      .setFooter({ text: username })

    const continueBtn = new ButtonBuilder()
      .setCustomId(`chat_continue:${userId}`)
      .setLabel('Keep talking')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('💬');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(continueBtn);

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (err: any) {
    const embed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle('❌ bruh something broke no cap')
      .setDescription(String(err).slice(0, 3900))
      .setFooter({ text: username });
    await interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
  }
}
