/**
 * Watch rooms — pure helpers shared by the server and the UI. Client-safe.
 *
 * Three kinds of room, one `RoomConfig` (room-config.ts):
 *  - solo:    browser-only; never touches the server.
 *  - private: stored, unlisted; the 8-character code is the capability.
 *  - public:  stored and listed for its election day.
 */

import { etDayStart } from './calendar';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from './room-config';

export type RoomKind =
  | 'solo'
  | 'private'
  | 'public';

/** Rooms are swept this long after their election day starts (counting runs for days; chat for a bit after). */
export const ROOM_LIFETIME_DAYS = 4;
/** Active rooms one account may own at a time. */
export const MAX_ROOMS_PER_USER = 10;

export function roomExpiry(
  electionDate: string,
): Date {
  return new Date(
    etDayStart(
      electionDate,
    ).getTime() +
      ROOM_LIFETIME_DAYS *
        86_400_000,
  );
}

/** 8 unambiguous characters from a uniform integer source (injected so tests are deterministic). */
export function generateRoomCode(
  randomInt: (
    max: number,
  ) => number,
): string {
  let out =
    '';
  for (
    let i = 0;
    i <
    ROOM_CODE_LENGTH;
    i++
  )
    out +=
      ROOM_CODE_ALPHABET[
        randomInt(
          ROOM_CODE_ALPHABET.length,
        )
      ];
  return out;
}

/** The chat/reaction/config channel for a room (or for the election day's main room when `room` is null). */
export const roomChannel =
  (
    room:
      | string
      | null,
    date: string,
  ) =>
    room
      ? `room:${room}`
      : date;

/** What people can say with one tap. Anything else is rejected — reactions are a closed vocabulary. */
export const REACTIONS =
  [
    '🔥',
    '😮',
    '😂',
    '😡',
    '👏',
    '🗳️',
    '💙',
    '❤️',
  ] as const;
export type Reaction =
  (typeof REACTIONS)[number];
export const isReaction =
  (
    s: unknown,
  ): s is Reaction =>
    typeof s ===
      'string' &&
    (
      REACTIONS as readonly string[]
    ).includes(
      s,
    );

/** A join link for a room. */
export const roomPath =
  (
    code: string,
  ) =>
    `/elections?room=${code}`;

/** Aggregate recent reactions into counts, newest window only. */
export function tallyReactions(
  items: {
    emoji: string;
    at: number;
  }[],
  now: number,
  windowMs = 10_000,
): Record<
  string,
  number
> {
  const out: Record<
    string,
    number
  > =
    {};
  for (const r of items)
    if (
      now -
        r.at <=
      windowMs
    )
      out[
        r.emoji
      ] =
        (out[
          r
            .emoji
        ] ??
          0) +
        1;
  return out;
}

export interface RoomView {
  code: string;
  name: string;
  visibility:
    | 'PUBLIC'
    | 'PRIVATE';
  electionDate: string;
  config: unknown;
  owner: {
    id: string;
    name:
      | string
      | null;
    handle:
      | string
      | null;
    image:
      | string
      | null;
  } | null;
  /** True when the requesting viewer owns it (may edit). */
  mine: boolean;
  expiresAt: string;
}

export interface RoomListItem {
  code: string;
  name: string;
  electionDate: string;
  owner: RoomView['owner'];
  /** How many panes of each kind, for a one-line description ("2 streams · chat · race"). */
  summary: string;
}

/** "2 streams · race · chat" from a stored config. Defensive: unknown shapes give an empty string. */
export function describeConfig(
  config: unknown,
): string {
  const panes =
    (
      config as {
        panes?: unknown;
      } | null
    )
      ?.panes;
  if (
    !Array.isArray(
      panes,
    )
  )
    return '';
  const counts =
    new Map<
      string,
      number
    >();
  for (const p of panes.slice(
    0,
    4,
  )) {
    const k =
      (
        p as {
          kind?: unknown;
        } | null
      )
        ?.kind;
    if (
      typeof k ===
      'string'
    )
      counts.set(
        k,
        (counts.get(
          k,
        ) ??
          0) +
          1,
      );
  }
  return [
    ...counts,
  ]
    .map(
      ([
        k,
        n,
      ]) =>
        n >
        1
          ? `${n} ${k}s`
          : k,
    )
    .join(
      ' · ',
    );
}
