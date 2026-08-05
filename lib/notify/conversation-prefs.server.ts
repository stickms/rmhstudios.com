/**
 * Per-conversation notification control (B14).
 *
 * The global category matrix (`lib/notify/categories.ts`) answers "do I want
 * replies at all"; it cannot answer "I want replies, just not from *this*
 * 40-person group chat at 2am". That gap is why people mute notifications
 * globally and then miss the one message that mattered — the only control they
 * were offered was the wrong size.
 *
 * The control here is deliberately **three-way**, not a mute toggle:
 *
 *   All      — deliver everything (the default; no row exists)
 *   Mentions — deliver only when the user was actually addressed
 *   None     — deliver nothing until `muteUntil`
 *
 * "Mentions only" is the setting people actually want out of a busy thread and
 * that almost nothing ships, because it is the one that needs the delivery path
 * to know whether a message named you. It is the middle option rather than
 * something buried under a submenu for exactly that reason.
 *
 * A scope key is `dm:<id>` | `group:<id>` | `space:<id>` — one namespace for all
 * three conversation kinds, so the preference table does not grow a column every
 * time a new surface gains a thread.
 */

import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';

/* -------------------------------------------------------------------------- */
/* Scope keys                                                                  */
/* -------------------------------------------------------------------------- */

export const CONVERSATION_SCOPES = ['dm', 'group', 'space'] as const;
export type ConversationScope = (typeof CONVERSATION_SCOPES)[number];

/**
 * `<scope>:<id>`, where the id is a cuid-ish token. Validated rather than
 * accepted verbatim because the key is user-supplied on the preferences route
 * and lands in a `@db.VarChar(80)` primary key — an unbounded string would
 * either error at the database or let one user mint unbounded rows.
 */
export const CONVERSATION_SCOPE_KEY = /^(?:dm|group|space):[A-Za-z0-9_-]{1,60}$/;

export function isConversationScopeKey(value: string): boolean {
  return CONVERSATION_SCOPE_KEY.test(value);
}

/** Build a scope key from its parts, so no call site hand-concatenates one. */
export function scopeKeyFor(scope: ConversationScope, id: string): string {
  return `${scope}:${id}`;
}

/* -------------------------------------------------------------------------- */
/* Shape                                                                       */
/* -------------------------------------------------------------------------- */

/** The stored preference, as the delivery path reads it. */
export interface ConversationPrefState {
  /** Null = not muted. A far-future date = muted indefinitely. */
  muteUntil: Date | null;
  mentionsOnly: boolean;
  pinned: boolean;
}

/** JSON-serialized shape returned by the API route. */
export interface ConversationPrefView {
  scopeKey: string;
  muteUntil: string | null;
  mentionsOnly: boolean;
  pinned: boolean;
  /** Convenience for the UI's three-way radio — derived, never stored. */
  mode: ConversationMode;
}

export type ConversationMode = 'all' | 'mentions' | 'none';

/** No row = the default: everything delivers, nothing pinned. */
export const DEFAULT_CONVERSATION_PREF: ConversationPrefState = {
  muteUntil: null,
  mentionsOnly: false,
  pinned: false,
};

export const conversationPrefSchema = z.object({
  scopeKey: z.string().max(80).regex(CONVERSATION_SCOPE_KEY),
  /**
   * ISO timestamp, or null to unmute. Absent means "leave as-is" — the route is
   * a partial update so the pin toggle does not silently unmute a thread.
   */
  muteUntil: z.string().datetime().nullable().optional(),
  mentionsOnly: z.boolean().optional(),
  pinned: z.boolean().optional(),
});

export type ConversationPrefInput = z.infer<typeof conversationPrefSchema>;

export const conversationPrefQuerySchema = z.object({
  scopeKey: z.string().max(80).regex(CONVERSATION_SCOPE_KEY),
});

/* -------------------------------------------------------------------------- */
/* The predicate                                                               */
/* -------------------------------------------------------------------------- */

/** Which of the three the stored state represents. Pure. */
export function modeOf(
  pref: ConversationPrefState | null | undefined,
  now: Date = new Date(),
): ConversationMode {
  if (!pref) return 'all';
  if (pref.muteUntil && pref.muteUntil.getTime() > now.getTime()) return 'none';
  return pref.mentionsOnly ? 'mentions' : 'all';
}

/**
 * Whether a message in this conversation should produce a notification.
 *
 * PURE, and the single place the three-way is decided — the ordering matters and
 * is easy to get subtly wrong:
 *
 *  - **Mute outranks mentions.** A muted thread stays silent even for a mention.
 *    The inverse ("mentions always get through") is a defensible product, but it
 *    is not what "None" means, and a mute that leaks is worse than no mute — the
 *    user muted a thread precisely because someone kept @-ing them.
 *  - **An expired mute is not a mute.** `muteUntil` in the past falls through to
 *    the `mentionsOnly` check rather than being treated as "still muted", so
 *    "mute for 8 hours" un-mutes itself with no sweep job.
 *  - **No row means deliver.** Absence is the default, so a conversation nobody
 *    has configured behaves exactly as it did before this feature existed.
 */
export function shouldDeliver(
  pref: ConversationPrefState | null | undefined,
  isMention: boolean,
  now: Date = new Date(),
): boolean {
  const mode = modeOf(pref, now);
  if (mode === 'none') return false;
  if (mode === 'mentions') return isMention;
  return true;
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Read one conversation's preference. Returns `null` when unset — the caller
 * passes that straight to {@link shouldDeliver}, which treats it as "All", so
 * there is no reason to materialize a default row on read.
 */
export async function getConversationPref(
  userId: string,
  scopeKey: string,
): Promise<ConversationPrefState | null> {
  if (!isConversationScopeKey(scopeKey)) return null;
  const row = await prisma.conversationPref.findUnique({
    where: { userId_scopeKey: { userId, scopeKey } },
    select: { muteUntil: true, mentionsOnly: true, pinned: true },
  });
  return row ?? null;
}

/** Read several at once — the conversation list needs pins + mutes per row and
 *  must not issue one query per thread. */
export async function listConversationPrefs(
  userId: string,
  scopeKeys: readonly string[],
): Promise<Map<string, ConversationPrefState>> {
  const keys = scopeKeys.filter(isConversationScopeKey);
  if (keys.length === 0) return new Map();
  const rows = await prisma.conversationPref.findMany({
    where: { userId, scopeKey: { in: keys } },
    select: { scopeKey: true, muteUntil: true, mentionsOnly: true, pinned: true },
  });
  return new Map(
    rows.map((r) => [
      r.scopeKey,
      { muteUntil: r.muteUntil, mentionsOnly: r.mentionsOnly, pinned: r.pinned },
    ]),
  );
}

/**
 * Upsert one conversation's preference. Partial: only the fields present in
 * `patch` are written, so toggling the pin cannot clear a mute set on another
 * device a second earlier.
 */
export async function setConversationPref(
  userId: string,
  input: ConversationPrefInput,
): Promise<ConversationPrefView> {
  const { scopeKey } = input;
  const data = {
    ...(input.muteUntil !== undefined
      ? { muteUntil: input.muteUntil ? new Date(input.muteUntil) : null }
      : {}),
    ...(input.mentionsOnly !== undefined ? { mentionsOnly: input.mentionsOnly } : {}),
    ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
  };

  const row = await prisma.conversationPref.upsert({
    where: { userId_scopeKey: { userId, scopeKey } },
    create: { userId, scopeKey, ...data },
    update: data,
    select: { muteUntil: true, mentionsOnly: true, pinned: true },
  });

  return toView(scopeKey, row);
}

/** Serialize a preference for the wire, defaults included. */
export function toView(
  scopeKey: string,
  pref: ConversationPrefState | null,
  now: Date = new Date(),
): ConversationPrefView {
  const state = pref ?? DEFAULT_CONVERSATION_PREF;
  return {
    scopeKey,
    muteUntil: state.muteUntil ? state.muteUntil.toISOString() : null,
    mentionsOnly: state.mentionsOnly,
    pinned: state.pinned,
    mode: modeOf(pref, now),
  };
}
