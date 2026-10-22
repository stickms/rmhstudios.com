/**
 * Messaging extras (P04) — the client-safe vocabulary shared by the API routes,
 * the realtime events and the UI. No Prisma, no `.server` imports.
 *
 * A "chat" is either a one-to-one DM conversation (`dm`) or a group chat
 * (`group`). They are separate models, so everything here is keyed by
 * `(kind, id)` and the server adapters in `access.server.ts` hide the difference.
 *
 * zod-free — the conversation view imports this. The chat-reference schemas
 * are in `./types-schema`.
 */

export type { ChatRef } from './types-schema';

export const CHAT_KINDS = ['dm', 'group'] as const;
export type ChatKind = (typeof CHAT_KINDS)[number];

/** `dm:<id>` | `group:<id>` — the same namespace `ConversationPref` uses. */
export function scopeKeyOf(kind: ChatKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseScopeKey(key: string): { kind: ChatKind; id: string } | null {
  const m = /^(dm|group):([A-Za-z0-9_-]{1,60})$/.exec(key);
  return m ? { kind: m[1] as ChatKind, id: m[2] } : null;
}

/**
 * Message kinds. `text` is every message that existed before this feature;
 * everything else carries a readable fallback in `content` (so previews, search
 * and notifications never see an empty string) plus its structured `meta`.
 */
export const MESSAGE_KINDS = [
  'text',
  'system',
  'tip',
  'dice',
  'coin',
  'checklist',
  'poll',
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

/** Kinds that render as a centred line rather than a bubble. */
export function isLineKind(kind: string | null | undefined): boolean {
  return kind === 'system' || kind === 'tip';
}

/** Kinds that render as a card (not a coloured bubble). */
export function isCardKind(kind: string | null | undefined): boolean {
  return kind === 'dice' || kind === 'coin' || kind === 'checklist' || kind === 'poll';
}

/** Kinds that can be edited, forwarded and quoted like ordinary text. */
export function isPlainKind(kind: string | null | undefined): boolean {
  return !kind || kind === 'text';
}

/* -------------------------------------------------------------------------- */
/* Structured payloads (`meta`)                                               */
/* -------------------------------------------------------------------------- */

export interface ChecklistItem {
  text: string;
  /** User who ticked it, or null. */
  doneBy: string | null;
  doneAt: string | null;
}
export interface ChecklistMeta {
  title: string;
  items: ChecklistItem[];
}
export interface DiceMeta {
  count: number;
  sides: number;
  rolls: number[];
  total: number;
}
export interface CoinMeta {
  result: 'heads' | 'tails';
}
export interface PollMeta {
  question: string;
  options: string[];
}
export interface PollView {
  question: string;
  options: { text: string; votes: number }[];
  totalVotes: number;
  myVote: number | null;
}
export type SystemAction =
  | { action: 'timer'; seconds: number | null; actorId: string }
  | { action: 'theme'; themeKey: string | null; actorId: string }
  | { action: 'pin'; pinned: boolean; actorId: string }
  | { action: 'tip'; amount: number; fromId: string; toId: string };

/* -------------------------------------------------------------------------- */
/* Limits                                                                     */
/* -------------------------------------------------------------------------- */

export const CHECKLIST_MIN_ITEMS = 1;
export const CHECKLIST_MAX_ITEMS = 20;
export const CHECKLIST_ITEM_MAX = 100;
export const CHECKLIST_TITLE_MAX = 80;
export const MAX_PINS_PER_CHAT = 10;
export const MAX_FOLDERS = 10;
export const MAX_FOLDER_CHATS = 200;
export const FOLDER_NAME_MAX = 40;

/* -------------------------------------------------------------------------- */
/* Realtime                                                                   */
/* -------------------------------------------------------------------------- */

/** A reply posted in a group-chat side thread (M7). */
export interface ThreadReply {
  id: string;
  content: string;
  createdAt: string;
  sender: { id: string; name: string | null; handle: string | null; image: string | null };
}

/**
 * One event type for every non-message change, carried on the *existing*
 * channels (the per-user DM bus and the per-group bus) — no new connection.
 * Clients patch what they hold; anything they cannot patch they refetch.
 */
export type ChatUpdate = { kind: ChatKind; chatId: string } & (
  | { op: 'settings'; disappearAfterSec: number | null; themeKey: string | null }
  | { op: 'pins' }
  | { op: 'checklist'; messageId: string; items: ChecklistItem[] }
  | {
      op: 'poll';
      messageId: string;
      options: { text: string; votes: number }[];
      totalVotes: number;
    }
  | { op: 'thread'; parentId: string; replyCount: number; reply?: ThreadReply }
  | { op: 'read' }
);
