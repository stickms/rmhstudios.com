/**
 * Alex's @mention memory (port of discordbot/chat_memory.go): a rolling per-channel transcript in
 * discord_alex_channel_memory, so he remembers a conversation after it scrolls out of the live
 * window or the bot restarts. Pure helpers here; the load/save live on ChatService.
 */
import { getDuration } from './config';
import {
  ROLE_ASSISTANT,
  ROLE_USER,
  type ChatMessage,
} from './deepseek';
import type { Message } from './discord';

/** Turns stored per channel. */
export const CHANNEL_MEMORY_MAX_TURNS = 80;
/** Remembered turns (beyond the live window) fed into one reply. */
export const CHANNEL_MEMORY_INJECT_MAX = 40;

export const channelMemoryTtl =
  (): number =>
    getDuration(
      'ALEX_MEMORY_TTL',
      72 *
        3_600_000,
    );

/** One persisted message. The id is the dedup key and, as a snowflake, the age. */
export interface StoredTurn {
  id: string;
  name?: string;
  content: string;
  alex?: boolean;
}

/** Discord epoch (2015-01-01T00:00:00Z) in ms. */
export const DISCORD_EPOCH_MS = 1_420_070_400_000;

/** A snowflake's creation time (ms); 0 for a non-numeric id (sorts and prunes as very old). */
export function snowflakeTime(
  id: string,
): number {
  if (
    !/^\d+$/.test(
      id,
    )
  )
    return 0;
  try {
    return (
      Number(
        BigInt(
          id,
        ) >>
          22n,
      ) +
      DISCORD_EPOCH_MS
    );
  } catch {
    return 0;
  }
}

/** Chronological order of two snowflakes; length-then-lexical for non-numeric ids. */
export function snowflakeLess(
  a: string,
  b: string,
): boolean {
  const an =
    /^\d+$/.test(
      a,
    );
  const bn =
    /^\d+$/.test(
      b,
    );
  if (
    an &&
    bn
  ) {
    const ai =
      BigInt(
        a,
      );
    const bi =
      BigInt(
        b,
      );
    if (
      ai <
        1n <<
          64n &&
      bi <
        1n <<
          64n
    )
      return (
        ai <
        bi
      );
  }
  if (
    a.length !==
    b.length
  )
    return (
      a.length <
      b.length
    );
  return (
    a <
    b
  );
}

export const snowflakeCompare =
  (
    a: string,
    b: string,
  ): number =>
    snowflakeLess(
      a,
      b,
    )
      ? -1
      : snowflakeLess(
            b,
            a,
          )
        ? 1
        : 0;

/** The bot's mention token → "Alex", trimmed. */
export function cleanDiscordContent(
  content: string,
  botId: string,
): string {
  return content
    .split(
      `<@${botId}>`,
    )
    .join(
      'Alex',
    )
    .split(
      `<@!${botId}>`,
    )
    .join(
      'Alex',
    )
    .trim();
}

export function turnToChat(
  t: StoredTurn,
): ChatMessage {
  if (
    t.alex
  )
    return {
      role: ROLE_ASSISTANT,
      content:
        t.content,
    };
  return {
    role: ROLE_USER,
    content:
      (t.name ||
        'someone') +
      ': ' +
      t.content,
  };
}

/** A message as a stored turn, or null when it has no readable content. */
export function messageToTurn(
  msg:
    | Message
    | null
    | undefined,
  botId: string,
): StoredTurn | null {
  if (
    !msg
  )
    return null;
  const content =
    cleanDiscordContent(
      msg.content ??
        '',
      botId,
    );
  if (
    !content
  )
    return null;
  const t: StoredTurn =
    {
      id: msg.id,
      content,
    };
  if (
    msg.author &&
    msg
      .author
      .id ===
      botId
  )
    t.alex = true;
  else if (
    msg.author &&
    msg
      .author
      .username
  )
    t.name =
      msg.author.username;
  else
    t.name =
      'someone';
  return t;
}

/** Chronological messages → turns, plus the set of ids they cover. */
export function turnsFromMessages(
  msgs: Message[],
  botId: string,
): [
  StoredTurn[],
  Set<string>,
] {
  const turns: StoredTurn[] =
    [];
  const ids =
    new Set<string>();
  for (const m of msgs) {
    const t =
      messageToTurn(
        m,
        botId,
      );
    if (
      t
    ) {
      turns.push(
        t,
      );
      ids.add(
        t.id,
      );
    }
  }
  return [
    turns,
    ids,
  ];
}

/** Remembered turns NOT in the live window, keeping the newest `max` (order preserved). */
export function rememberedBeyond(
  remembered: StoredTurn[],
  liveIds: Set<string>,
  max: number,
): StoredTurn[] {
  const older =
    remembered.filter(
      (
        t,
      ) =>
        !liveIds.has(
          t.id,
        ),
    );
  return max >=
    0 &&
    older.length >
      max
    ? older.slice(
        older.length -
          max,
      )
    : older;
}

/** Dedup by id, drop past the TTL, order oldest → newest, cap to the newest MAX_TURNS. */
export function mergeTurns(
  existing: StoredTurn[],
  incoming: StoredTurn[],
  now: number = Date.now(),
): StoredTurn[] {
  const byId =
    new Map<
      string,
      StoredTurn
    >();
  for (const t of [
    ...existing,
    ...incoming,
  ]) {
    if (
      !t.id ||
      t.content.trim() ===
        ''
    )
      continue;
    byId.set(
      t.id,
      t,
    );
  }
  const cutoff =
    now -
    channelMemoryTtl();
  let ids =
    [
      ...byId.keys(),
    ]
      .filter(
        (
          id,
        ) =>
          snowflakeTime(
            id,
          ) >
          cutoff,
      )
      .sort(
        snowflakeCompare,
      );
  if (
    ids.length >
    CHANNEL_MEMORY_MAX_TURNS
  )
    ids =
      ids.slice(
        ids.length -
          CHANNEL_MEMORY_MAX_TURNS,
      );
  return ids.map(
    (
      id,
    ) =>
      byId.get(
        id,
      )!,
  );
}

/** Stored turns as the Go JSON (omitempty: name and alex only when set). */
export function serializeTurns(
  turns: StoredTurn[],
): string {
  return JSON.stringify(
    turns.map(
      (
        t,
      ) => {
        const o: Record<
          string,
          unknown
        > =
          {
            id: t.id,
          };
        if (
          t.name
        )
          o.name =
            t.name;
        o.content =
          t.content;
        if (
          t.alex
        )
          o.alex = true;
        return o;
      },
    ),
  );
}
