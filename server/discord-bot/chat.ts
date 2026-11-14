/**
 * The /chat persona and @mention replies (port of discordbot/chat.go).
 *
 *   - Alex's persona (or the server's /prompt override), with his live tamagotchi state injected
 *     ephemerally into the system prompt — never persisted into history.
 *   - buildChatEmbed packs the reply across embed fields inside Discord's 6000-char budget.
 *   - /chat sessions persist in discord_chat_session (upsert by discordUserId) behind an
 *     in-memory cache; mention replies fold in the channel memory (chat-memory.ts).
 *
 * Prompt-injection posture (kept from Go): channel messages enter the model only as
 * name-prefixed user turns under Alex's system prompt, the reply is bounded before it is posted,
 * and a custom /prompt is capped at 2000 characters.
 */
import {
  getDuration,
  getInt,
} from './config';
import {
  CHANNEL_MEMORY_INJECT_MAX,
  channelMemoryTtl,
  cleanDiscordContent,
  mergeTurns,
  messageToTurn,
  rememberedBeyond,
  serializeTurns,
  snowflakeCompare,
  snowflakeTime,
  turnToChat,
  turnsFromMessages,
  type StoredTurn,
} from './chat-memory';
import { type Sql } from './db';
import {
  ROLE_ASSISTANT,
  ROLE_SYSTEM,
  ROLE_USER,
  type ChatMessage,
  type DeepSeekClient,
} from './deepseek';
import type {
  DiscordPort,
  Embed,
  Message,
} from './discord';
import {
  PROMPT_MAX_LEN,
  deferReply,
  interactionAvatar,
  interactionUser,
  respondEphemeralEmbed,
  type Interaction,
} from './interactions';
import {
  boundMessage,
  promptAckLine,
} from './pet-ai';
import { ALEX_SYSTEM_PROMPT } from './persona';
import {
  pick,
  type PetState,
} from './pet';
import {
  attributeFooter,
  errEmbed,
  type BotLogger,
  type PetService,
} from './pet-service';

const FIELD_VALUE_MAX = 1024;
const TITLE_MAX = 256;
const FOOTER_MAX = 2048;
const MAX_FIELDS = 25;
const EMBED_TOTAL_MAX = 6000;
const EMBED_DESC_MAX = 4096;

const EMBED_TITLE =
  'Alex Wu 💬';
const YOU_FIELD_NAME =
  '💬 You';
const ALEX_FIELD_NAME =
  '🤙 Alex';
const CONTINUATION_FIELD_NAME =
  '​'; // zero-width space
export const CHAT_EMBED_COLOR = 0xa855f7;
export const CHAT_ERR_EMBED_COLOR = 0xef4444;

const runes =
  (
    s: string,
  ): string[] => [
    ...s,
  ];
const runeLen =
  (
    s: string,
  ): number =>
    runes(
      s,
    )
      .length;

/** Cut to `max` runes with an ellipsis on overflow. */
export function truncate(
  text: string,
  max: number,
): string {
  if (
    max <=
    0
  )
    return '';
  const r =
    runes(
      text,
    );
  if (
    r.length <=
    max
  )
    return text;
  if (
    max <=
    1
  )
    return r
      .slice(
        0,
        max,
      )
      .join(
        '',
      );
  return (
    r
      .slice(
        0,
        max -
          1,
      )
      .join(
        '',
      ) +
    '…'
  );
}

/** A hard cut to `max` runes, no ellipsis. */
export function truncateHard(
  s: string,
  max: number,
): string {
  const r =
    runes(
      s,
    );
  return r.length <=
    max
    ? s
    : r
        .slice(
          0,
          max,
        )
        .join(
          '',
        );
}

/** The "You / Alex" embed, the reply split across as many fields as the limits allow. */
export function buildChatEmbed(
  message: string,
  username: string,
  replyText: string,
): Embed {
  const title =
    truncateHard(
      EMBED_TITLE,
      TITLE_MAX,
    );
  const footer =
    truncateHard(
      username,
      FOOTER_MAX,
    );
  let budget =
    EMBED_TOTAL_MAX -
    runeLen(
      title,
    ) -
    runeLen(
      footer,
    );
  const fields: Array<{
    name: string;
    value: string;
  }> =
    [];

  const youValue =
    truncate(
      message,
      Math.min(
        FIELD_VALUE_MAX,
        budget -
          runeLen(
            YOU_FIELD_NAME,
          ),
      ),
    );
  if (
    runeLen(
      youValue,
    ) >
    0
  ) {
    fields.push(
      {
        name: YOU_FIELD_NAME,
        value:
          youValue,
      },
    );
    budget -=
      runeLen(
        YOU_FIELD_NAME,
      ) +
      runeLen(
        youValue,
      );
  }

  let remaining =
    runes(
      replyText,
    );
  if (
    remaining.length ===
    0
  )
    remaining =
      runes(
        '(no response)',
      );
  let replyFieldCount = 0;
  let truncated = false;
  while (
    remaining.length >
    0
  ) {
    if (
      fields.length >=
      MAX_FIELDS
    ) {
      truncated = true;
      break;
    }
    const name =
      replyFieldCount >
      0
        ? CONTINUATION_FIELD_NAME
        : ALEX_FIELD_NAME;
    const valueBudget =
      Math.min(
        FIELD_VALUE_MAX,
        budget -
          runeLen(
            name,
          ),
      );
    if (
      valueBudget <=
      0
    ) {
      truncated = true;
      break;
    }
    const take =
      Math.min(
        valueBudget,
        remaining.length,
      );
    const value =
      remaining
        .slice(
          0,
          take,
        )
        .join(
          '',
        );
    fields.push(
      {
        name,
        value,
      },
    );
    budget -=
      runeLen(
        name,
      ) +
      runeLen(
        value,
      );
    remaining =
      remaining.slice(
        take,
      );
    replyFieldCount++;
  }
  if (
    truncated &&
    fields.length >
      0
  ) {
    const last =
      fields[
        fields.length -
          1
      ]!;
    const lr =
      runes(
        last.value,
      );
    last.value =
      lr
        .slice(
          0,
          Math.max(
            0,
            lr.length -
              1,
          ),
        )
        .join(
          '',
        ) +
      '…';
  }
  return {
    color:
      CHAT_EMBED_COLOR,
    title,
    fields:
      fields.map(
        (
          f,
        ) => ({
          name: f.name,
          value:
            f.value,
          inline: false,
        }),
      ),
    footer:
      {
        text: footer,
      },
  };
}

/** History with its leading system message replaced by `persona` (or prepended). Copies. */
export function withPersona(
  history: ChatMessage[],
  persona: string,
): ChatMessage[] {
  const out =
    history.map(
      (
        m,
      ) => ({
        ...m,
      }),
    );
  if (
    out.length >
      0 &&
    out[0]!
      .role ===
      ROLE_SYSTEM
  ) {
    out[0]!.content =
      persona;
    return out;
  }
  return [
    {
      role: ROLE_SYSTEM,
      content:
        persona,
    },
    ...out,
  ];
}

/** History with a live-state system message right after the persona. Copies. */
export function injectStatus(
  history: ChatMessage[],
  statusLine: string,
): ChatMessage[] {
  if (
    history.length ===
    0
  )
    return history;
  return [
    history[0]!,
    {
      role: ROLE_SYSTEM,
      content:
        statusLine,
    },
    ...history.slice(
      1,
    ),
  ];
}

export const MENTION_CONTEXT_DEFAULT = 50;
export const MENTION_CONTEXT_MAX = 100;
export const MENTION_REPLY_DEPTH_DEFAULT = 12;
export const MENTION_REPLY_DEPTH_MAX = 30;

export function mentionContextSize(
  env: Record<
    string,
    | string
    | undefined
  > = process.env,
): number {
  return Math.min(
    MENTION_CONTEXT_MAX,
    Math.max(
      1,
      getInt(
        'ALEX_MENTION_CONTEXT',
        MENTION_CONTEXT_DEFAULT,
        env,
      ),
    ),
  );
}

export function mentionReplyChainDepth(
  env: Record<
    string,
    | string
    | undefined
  > = process.env,
): number {
  return Math.min(
    MENTION_REPLY_DEPTH_MAX,
    Math.max(
      0,
      getInt(
        'ALEX_MENTION_REPLY_DEPTH',
        MENTION_REPLY_DEPTH_DEFAULT,
        env,
      ),
    ),
  );
}

export const mentionUserCooldown =
  (): number =>
    getDuration(
      'ALEX_MENTION_COOLDOWN',
      3_000,
    );

const MENTION_FALLBACK_LINES =
  [
    "yooo what's good 🧋",
    'sup! lowkey caught me mid-boba run fr',
    "heyy I'm here, what's up 👀",
    "bro what's poppin 😤",
    'ayo you rang? 🤙',
  ];

const MENTION_PASSED_OUT_LINES =
  [
    "*faintly* ...I can't... I passed out fr 💀 someone `/revive` me pls",
    'barely... hangin on rn 🥀 need a `/revive` before I can talk fr',
    "ngl I'm knocked out cold 😵 hit `/revive` and I'll be back",
    "*weakly* I hear you... but I'm down bad 💀 `/revive` me pls",
  ];

/** The in-character line used when AI is unavailable, weak when he's passed out. */
export function mentionFallbackLine(
  passedOut: boolean,
): string {
  return pick(
    passedOut
      ? MENTION_PASSED_OUT_LINES
      : MENTION_FALLBACK_LINES,
  );
}

/** A message → a transcript chat turn, or [] when it has no readable content. */
export function transcriptTurn(
  msg:
    | Message
    | null
    | undefined,
  botId: string,
): ChatMessage[] {
  if (
    !msg
  )
    return [];
  const content =
    cleanDiscordContent(
      msg.content ??
        '',
      botId,
    );
  if (
    !content
  )
    return [];
  if (
    msg.author &&
    msg
      .author
      .id ===
      botId
  )
    return [
      {
        role: ROLE_ASSISTANT,
        content,
      },
    ];
  return [
    {
      role: ROLE_USER,
      content:
        (msg
          .author
          ?.username ||
          'someone') +
        ': ' +
        content,
    },
  ];
}

/** Keep the "typing…" indicator alive (~8s) until stopped; Discord's lasts ~10s. */
export function keepTyping(
  port: DiscordPort,
  channelId: string,
): () => void {
  void port
    .typing(
      channelId,
    )
    .catch(
      () =>
        undefined,
    );
  // Bound to ONE in-flight reply and cleared when it is sent (scheduler-ratchet allowlist row).
  const timer =
    setInterval(
      () =>
        void port
          .typing(
            channelId,
          )
          .catch(
            () =>
              undefined,
          ),
      8_000,
    );
  timer.unref();
  let stopped = false;
  return () => {
    if (
      !stopped
    ) {
      stopped = true;
      clearInterval(
        timer,
      );
    }
  };
}

interface ChatSession {
  userId: string;
  username: string;
  history: ChatMessage[];
  lastMessageId: string;
}

export interface ChatServiceDeps {
  deepseek: DeepSeekClient;
  sql: Sql;
  port: DiscordPort;
  logger: BotLogger;
  pet: PetService | null;
}

export class ChatService {
  private readonly cache =
    new Map<
      string,
      ChatSession
    >();
  private readonly deepseek: DeepSeekClient;
  private readonly sql: Sql;
  private readonly port: DiscordPort;
  private readonly logger: BotLogger;
  readonly pet: PetService | null;

  constructor(
    deps: ChatServiceDeps,
  ) {
    this.deepseek =
      deps.deepseek;
    this.sql =
      deps.sql;
    this.port =
      deps.port;
    this.logger =
      deps.logger;
    this.pet =
      deps.pet;
  }

  /** The guild's /prompt persona when set, else Alex's default (DMs: always the default). */
  async effectivePrompt(
    guildId: string,
  ): Promise<string> {
    if (
      guildId &&
      this
        .pet
    ) {
      const custom =
        (
          await this.pet.customPrompt(
            guildId,
          )
        ).trim();
      if (
        custom
      )
        return custom;
    }
    return ALEX_SYSTEM_PROMPT;
  }

  /** /chat (isNew) or the keep-talking modal (continues the session). */
  async handleChat(
    i: Interaction,
    message: string,
    isNew: boolean,
    signal?: AbortSignal,
  ): Promise<void> {
    const {
      id: userId,
      username,
    } =
      interactionUser(
        i,
      );
    const guildId =
      i.guild_id ??
      '';
    const persona =
      await this.effectivePrompt(
        guildId,
      );
    let session: ChatSession;
    if (
      isNew
    ) {
      session =
        {
          userId,
          username,
          history:
            [
              {
                role: ROLE_SYSTEM,
                content:
                  persona,
              },
            ],
          lastMessageId:
            '',
        };
      this.cache.set(
        userId,
        session,
      );
    } else {
      session =
        await this.loadSession(
          userId,
          username,
        );
    }
    session.history.push(
      {
        role: ROLE_USER,
        content:
          message,
      },
    );

    try {
      await deferReply(
        this
          .port,
        i,
      );
    } catch (err) {
      throw new Error(
        `defer reply: ${(err as Error).message}`,
        {
          cause:
            err,
        },
      );
    }

    let sendMessages =
      withPersona(
        session.history,
        persona,
      );
    if (
      this
        .pet &&
      guildId
    ) {
      const line =
        await this.pet.statusLineForChat(
          guildId,
        );
      if (
        line
      )
        sendMessages =
          injectStatus(
            sendMessages,
            line,
          );
    }

    let reply: string;
    try {
      reply =
        await this.deepseek.chat(
          sendMessages,
          {
            signal,
          },
        );
    } catch (err) {
      this.logger.error(
        {
          event:
            'discord_bot.chat_deepseek_failed',
          userId,
          err: (
            err as Error
          )
            .message,
        },
      );
      await this.port.editOriginal(
        i.token,
        {
          embeds:
            [
              {
                color:
                  CHAT_ERR_EMBED_COLOR,
                title:
                  '❌ bruh something broke no cap',
                description:
                  truncateHard(
                    (
                      err as Error
                    )
                      .message,
                    3900,
                  ),
                footer:
                  {
                    text: username,
                  },
              },
            ],
        },
      );
      return;
    }

    const finalReply =
      reply.trim() ||
      '(no response)';
    session.history.push(
      {
        role: ROLE_ASSISTANT,
        content:
          finalReply,
      },
    );
    const edited =
      await this.port.editOriginal(
        i.token,
        {
          embeds:
            [
              buildChatEmbed(
                message,
                username,
                finalReply,
              ),
            ],
          components:
            [
              {
                type: 1,
                components:
                  [
                    {
                      type: 2,
                      custom_id:
                        'chat_continue:' +
                        userId,
                      label:
                        'Keep talking',
                      style: 2,
                      emoji:
                        {
                          name: '💬',
                        },
                    },
                  ],
              },
            ],
        },
      );
    if (
      edited
    )
      session.lastMessageId =
        edited.id;

    await this.saveSession(
      session,
    ).catch(
      (
        e: Error,
      ) =>
        this.logger.warn(
          {
            event:
              'discord_bot.chat_save_session_failed',
            userId,
            err: e.message,
          },
        ),
    );
    if (
      this
        .pet
    )
      await this.pet.recordChat(
        guildId,
        i.channel_id ??
          '',
        userId,
        username,
        interactionAvatar(
          i,
        ),
      );
  }

  /** /prompt — view, set or reset the server's persona (ephemeral). Permission checked by the caller. */
  async handlePrompt(
    i: Interaction,
    rawText: string,
    reset: boolean,
  ): Promise<void> {
    if (
      !i.guild_id
    ) {
      return respondEphemeralEmbed(
        this
          .port,
        i,
        {
          color:
            CHAT_ERR_EMBED_COLOR,
          title:
            '🔒 Servers only',
          description:
            "`/prompt` sets Alex's personality for a **server** — run it in a server channel, not a DM.",
        },
      );
    }
    const guildId =
      i.guild_id;
    let text =
      rawText.trim();
    if (
      runeLen(
        text,
      ) >
      PROMPT_MAX_LEN
    )
      text =
        runes(
          text,
        )
          .slice(
            0,
            PROMPT_MAX_LEN,
          )
          .join(
            '',
          );
    const {
      username,
    } =
      interactionUser(
        i,
      );
    const pet =
      this
        .pet;

    if (
      reset
    ) {
      try {
        await pet?.setCustomPrompt(
          guildId,
          '',
        );
      } catch (err) {
        this.logger.warn(
          {
            event:
              'discord_bot.prompt_reset_failed',
            guildId,
            err: (
              err as Error
            )
              .message,
          },
        );
        return respondEphemeralEmbed(
          this
            .port,
          i,
          errEmbed(
            "couldn't reset Alex's prompt rn, try again",
          ),
        );
      }
      return respondEphemeralEmbed(
        this
          .port,
        i,
        {
          color:
            CHAT_EMBED_COLOR,
          title:
            '🔄 Alex reset to his default personality',
          description:
            'New `/chat` sessions and @mentions here use his built-in persona again.',
          footer:
            attributeFooter(
              username,
              '🔄',
              "reset Alex's personality",
            ),
        },
      );
    }
    if (
      text ===
      ''
    ) {
      const current =
        await this.effectivePrompt(
          guildId,
        );
      const label =
        pet &&
        (
          await pet.customPrompt(
            guildId,
          )
        ).trim() !==
          ''
          ? 'custom'
          : 'default';
      return respondEphemeralEmbed(
        this
          .port,
        i,
        {
          color:
            CHAT_EMBED_COLOR,
          title:
            "🧠 Alex's personality here — " +
            label,
          description:
            truncateHard(
              current,
              EMBED_DESC_MAX,
            ),
          footer:
            {
              text: 'Change: /prompt text:… · Reset: /prompt reset:true',
            },
        },
      );
    }
    try {
      await pet?.setCustomPrompt(
        guildId,
        text,
      );
    } catch (err) {
      this.logger.warn(
        {
          event:
            'discord_bot.prompt_set_failed',
          guildId,
          err: (
            err as Error
          )
            .message,
        },
      );
      return respondEphemeralEmbed(
        this
          .port,
        i,
        errEmbed(
          "couldn't save that prompt rn, try again",
        ),
      );
    }
    return respondEphemeralEmbed(
      this
        .port,
      i,
      {
        color:
          CHAT_EMBED_COLOR,
        title:
          "✅ Alex's personality updated for this server",
        description:
          truncateHard(
            text,
            EMBED_DESC_MAX,
          ),
        footer:
          attributeFooter(
            username,
            '🧠',
            "set Alex's personality · revert with /prompt reset:true",
          ),
      },
    );
  }

  /** Reply when Alex is @mentioned or replied to, with channel context and memory. */
  async handleMention(
    m: Message,
    botId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const now =
      Date.now();
    const authorId =
      m
        .author
        ?.id ??
      '';
    if (
      this
        .pet &&
      m.author &&
      this.pet.claimPrompt(
        m.channel_id,
        authorId,
        now,
      )
    ) {
      return this.handlePromptClaim(
        m,
        botId,
      );
    }
    if (
      !this.deepseek.configured()
    )
      return;
    if (
      this
        .pet &&
      m.author &&
      this.pet.onCooldown(
        authorId,
        'mention',
        mentionUserCooldown(),
        now,
      )
    )
      return;

    const stopTyping =
      keepTyping(
        this
          .port,
        m.channel_id,
      );
    try {
      let system =
        await this.effectivePrompt(
          m.guild_id ??
            '',
        );
      if (
        this
          .pet
      )
        system +=
          await this.pet.statusLineForChat(
            m.guild_id ??
              '',
          );
      system +=
        "\n\nYou're in a Discord channel and someone just mentioned or replied to you. " +
        'The conversation above is the recent channel history plus the reply chain leading up to the message ' +
        "that pinged you — use it so your reply fits what's actually being discussed. " +
        'Reply naturally and briefly (usually 1–2 sentences) to the most recent message. ' +
        "Don't prefix your reply with your name and don't use markdown headers.";

      const gathered =
        await this.gatherMentionMessages(
          m,
        );
      const [
        liveTurns,
        liveIds,
      ] =
        turnsFromMessages(
          gathered,
          botId,
        );
      const remembered =
        await this.loadChannelMemory(
          m.channel_id,
        );

      const msgs: ChatMessage[] =
        [
          {
            role: ROLE_SYSTEM,
            content:
              system,
          },
        ];
      for (const t of rememberedBeyond(
        remembered,
        liveIds,
        CHANNEL_MEMORY_INJECT_MAX,
      ))
        msgs.push(
          turnToChat(
            t,
          ),
        );
      for (const t of liveTurns)
        msgs.push(
          turnToChat(
            t,
          ),
        );
      if (
        msgs.length ===
        1
      )
        msgs.push(
          {
            role: ROLE_USER,
            content:
              '(someone pinged you) say hi!',
          },
        );

      let reply =
        '';
      try {
        const signals =
          [
            AbortSignal.timeout(
              40_000,
            ),
          ];
        if (
          signal
        )
          signals.push(
            signal,
          );
        reply =
          boundMessage(
            await this.deepseek.chat(
              msgs,
              {
                signal:
                  AbortSignal.any(
                    signals,
                  ),
              },
            ),
          );
      } catch (err) {
        this.logger.warn(
          {
            event:
              'discord_bot.mention_deepseek_failed_using_fallback',
            channelId:
              m.channel_id,
            err: (
              err as Error
            )
              .message,
          },
        );
      }
      if (
        !reply
      )
        reply =
          mentionFallbackLine(
            this
              .pet !==
              null &&
              (await this.pet.isPassedOut()),
          );

      let sent: Message;
      try {
        sent =
          await this.port.send(
            m.channel_id,
            {
              content:
                reply,
              message_reference:
                {
                  message_id:
                    m.id,
                  channel_id:
                    m.channel_id,
                  guild_id:
                    m.guild_id,
                },
            },
          );
      } catch (err) {
        this.logger.warn(
          {
            event:
              'discord_bot.mention_reply_failed_retrying_plain',
            channelId:
              m.channel_id,
            err: (
              err as Error
            )
              .message,
          },
        );
        try {
          sent =
            await this.port.send(
              m.channel_id,
              {
                content:
                  reply,
              },
            );
        } catch (err2) {
          throw new Error(
            `send mention reply: ${(err2 as Error).message}`,
            {
              cause:
                err2,
            },
          );
        }
      }

      const newTurns =
        [
          ...liveTurns,
        ];
      const own =
        messageToTurn(
          sent,
          botId,
        );
      if (
        own
      )
        newTurns.push(
          own,
        );
      await this.saveChannelMemory(
        m.channel_id,
        m.guild_id ??
          '',
        mergeTurns(
          remembered,
          newTurns,
        ),
      ).catch(
        (
          e: Error,
        ) =>
          this.logger.warn(
            {
              event:
                'discord_bot.mention_memory_save_failed',
              channelId:
                m.channel_id,
              err: e.message,
            },
          ),
      );
      if (
        this
          .pet
      )
        await this.pet.noteMentioned(
          m.guild_id ??
            '',
          m.channel_id,
        );
    } finally {
      stopTyping();
    }
  }

  /** Someone answered a live community prompt: react, credit an "interaction" (never mention points). */
  private async handlePromptClaim(
    m: Message,
    botId: string,
  ): Promise<void> {
    const stopTyping =
      keepTyping(
        this
          .port,
        m.channel_id,
      );
    try {
      const username =
        m
          .author
          ?.username ||
        'someone';
      const avatar =
        m
          .author
          ?.avatar ??
        '';
      const answer =
        cleanDiscordContent(
          m.content ??
            '',
          botId,
        );
      const pet: PetState | null =
        this
          .pet
          ? await this.pet.snapshot()
          : null;
      let reply =
        this
          .pet
          ? await this.pet.ai.promptAckContent(
              pet,
              username,
              answer,
            )
          : '';
      if (
        !reply
      )
        reply =
          promptAckLine(
            pet !==
              null &&
              !pet.alive,
          );
      try {
        await this.port.send(
          m.channel_id,
          {
            content:
              reply,
            message_reference:
              {
                message_id:
                  m.id,
                channel_id:
                  m.channel_id,
                guild_id:
                  m.guild_id,
              },
          },
        );
      } catch (err) {
        this.logger.warn(
          {
            event:
              'discord_bot.prompt_ack_failed_retrying_plain',
            channelId:
              m.channel_id,
            err: (
              err as Error
            )
              .message,
          },
        );
        await this.port
          .send(
            m.channel_id,
            {
              content:
                reply,
            },
          )
          .catch(
            (
              e: Error,
            ) =>
              this.logger.warn(
                {
                  event:
                    'discord_bot.prompt_ack_send_failed',
                  channelId:
                    m.channel_id,
                  err: e.message,
                },
              ),
          );
      }
      if (
        this
          .pet &&
        m.author
      ) {
        await this.pet.creditInteraction(
          m
            .author
            .id,
          username,
          avatar,
        );
        await this.pet.noteMentioned(
          m.guild_id ??
            '',
          m.channel_id,
        );
      }
    } finally {
      stopTyping();
    }
  }

  /** The recent window + the reply-chain ancestry + the trigger, deduped, oldest → newest. */
  async gatherMentionMessages(
    m: Message,
  ): Promise<
    Message[]
  > {
    const byId =
      new Map<
        string,
        Message
      >();
    try {
      for (const h of await this.port.getMessages(
        m.channel_id,
        {
          limit:
            mentionContextSize(),
          before:
            m.id,
        },
      )) {
        if (
          h
        )
          byId.set(
            h.id,
            h,
          );
      }
    } catch {
      /* best-effort */
    }
    for (const anc of await this.replyChainMessages(
      m,
      mentionReplyChainDepth(),
    ))
      byId.set(
        anc.id,
        anc,
      );
    byId.set(
      m.id,
      m,
    );
    return [
      ...byId.keys(),
    ]
      .sort(
        snowflakeCompare,
      )
      .map(
        (
          id,
        ) =>
          byId.get(
            id,
          )!,
      );
  }

  /** Walk up the same-channel reply chain (nearest parent first), stopping at the first unreadable one. */
  async replyChainMessages(
    trigger: Message,
    maxDepth: number,
  ): Promise<
    Message[]
  > {
    if (
      maxDepth <=
      0
    )
      return [];
    const channelId =
      trigger.channel_id;
    let parentId =
      trigger
        .message_reference
        ?.message_id ??
      '';
    let hydrated =
      trigger.referenced_message ??
      null;
    const out: Message[] =
      [];
    for (
      let depth = 0;
      depth <
        maxDepth &&
      parentId;
      depth++
    ) {
      let parent: Message;
      if (
        hydrated &&
        hydrated.id ===
          parentId
      )
        parent =
          hydrated;
      else {
        try {
          parent =
            await this.port.getMessage(
              channelId,
              parentId,
            );
        } catch {
          return out;
        }
      }
      if (
        !parent
      )
        break;
      out.push(
        parent,
      );
      hydrated =
        parent.referenced_message ??
        null;
      parentId =
        '';
      const ref =
        parent.message_reference;
      if (
        ref?.message_id &&
        (!ref.channel_id ||
          ref.channel_id ===
            channelId)
      )
        parentId =
          ref.message_id;
    }
    return out;
  }

  // ─── Session store ──────────────────────────────────────────────────────

  private async loadSession(
    userId: string,
    username: string,
  ): Promise<ChatSession> {
    const cached =
      this.cache.get(
        userId,
      );
    if (
      cached
    )
      return cached;
    const session: ChatSession =
      {
        userId,
        username,
        history:
          [
            {
              role: ROLE_SYSTEM,
              content:
                ALEX_SYSTEM_PROMPT,
            },
          ],
        lastMessageId:
          '',
      };
    if (
      this
        .sql
        .enabled
    ) {
      try {
        const row =
          await this.sql.one<{
            history: unknown;
            lastMessageId:
              | string
              | null;
          }>(
            `SELECT "history", "lastMessageId" FROM "discord_chat_session" WHERE "discordUserId"=$1`,
            userId,
          );
        if (
          row
        ) {
          const hist =
            Array.isArray(
              row.history,
            )
              ? (row.history as ChatMessage[])
              : [];
          if (
            hist.length >
            0
          ) {
            session.history =
              hist.map(
                (
                  h,
                ) => ({
                  role: String(
                    h.role ??
                      '',
                  ),
                  content:
                    String(
                      h.content ??
                        '',
                    ),
                }),
              );
          }
          if (
            row.lastMessageId
          )
            session.lastMessageId =
              row.lastMessageId;
        }
      } catch {
        /* keep the fresh persona-seeded session */
      }
    }
    this.cache.set(
      userId,
      session,
    );
    return session;
  }

  private async saveSession(
    s: ChatSession,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    await this.sql.exec(
      `INSERT INTO "discord_chat_session" ("discordUserId", "username", "history", "lastMessageId", "updatedAt")
       VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT ("discordUserId") DO UPDATE SET
         "username" = EXCLUDED."username",
         "history" = EXCLUDED."history",
         "lastMessageId" = EXCLUDED."lastMessageId",
         "updatedAt" = EXCLUDED."updatedAt"`,
      s.userId,
      s.username,
      JSON.stringify(
        s.history.map(
          (
            h,
          ) => ({
            role: h.role,
            content:
              h.content,
          }),
        ),
      ),
      s.lastMessageId ||
        null,
      new Date(),
    );
  }

  /** A channel's remembered turns within the TTL; [] on no DB, no row or any error. */
  async loadChannelMemory(
    channelId: string,
  ): Promise<
    StoredTurn[]
  > {
    if (
      !this
        .sql
        .enabled ||
      !channelId
    )
      return [];
    try {
      const row =
        await this.sql.one<{
          messages: unknown;
        }>(
          `SELECT "messages" FROM "discord_alex_channel_memory" WHERE "channelId"=$1`,
          channelId,
        );
      if (
        !row ||
        !Array.isArray(
          row.messages,
        )
      )
        return [];
      const cutoff =
        Date.now() -
        channelMemoryTtl();
      return (
        row.messages as StoredTurn[]
      )
        .filter(
          (
            t,
          ) =>
            t &&
            typeof t.id ===
              'string' &&
            t.id !==
              '' &&
            snowflakeTime(
              t.id,
            ) >
              cutoff,
        )
        .map(
          (
            t,
          ) => ({
            id: t.id,
            name: t.name,
            content:
              String(
                t.content ??
                  '',
              ),
            alex: t.alex,
          }),
        );
    } catch {
      return [];
    }
  }

  async saveChannelMemory(
    channelId: string,
    guildId: string,
    turns: StoredTurn[],
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled ||
      !channelId ||
      turns.length ===
        0
    )
      return;
    await this.sql.exec(
      `INSERT INTO "discord_alex_channel_memory" ("channelId","guildId","messages","updatedAt")
       VALUES ($1,$2,$3::jsonb,$4)
       ON CONFLICT ("channelId") DO UPDATE SET
         "guildId"=EXCLUDED."guildId",
         "messages"=EXCLUDED."messages",
         "updatedAt"=EXCLUDED."updatedAt"`,
      channelId,
      guildId,
      serializeTurns(
        turns,
      ),
      new Date(),
    );
  }
}
