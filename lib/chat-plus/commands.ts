/**
 * M4 — the slash-command registry.
 *
 * Client-safe on purpose: the composer reads it for the autocomplete popover and
 * the server reads the SAME parsers to validate what it is sent, so the two can
 * never disagree about what `/roll 2d6` means. It follows the declaration-registry
 * shape of `lib/shortcuts/registry.ts` — entries are data (`labelKey` + English
 * `label`, resolved with `t()` at the call site) and the registry holds no
 * handlers.
 *
 * Where a command runs decides how far it can be trusted:
 *  - `server` commands produce a message other people rely on (dice, a coin
 *    flip, a tip, a poll, a checklist). The client only sends the text; the
 *    server parses it, rolls the dice itself and writes the message.
 *  - `client` commands do nothing others must trust (`/remind` sets a private
 *    reminder, `/gif` opens the GIF picker) and never create a chat message.
 */

import { MAX_REMINDER_AHEAD_MS, resolvePreset } from '@/lib/reminders/schema';
import {
  CHECKLIST_ITEM_MAX,
  CHECKLIST_MAX_ITEMS,
  CHECKLIST_TITLE_MAX,
  type ChatKind,
} from '@/lib/chat-plus/types';
import { TIP_MAX, TIP_MIN } from '@/lib/economy/tip-schema';

export type CommandName = 'roll' | 'flip' | 'poll' | 'remind' | 'tip' | 'gif' | 'checklist';

export interface ChatCommand {
  name: CommandName;
  /** What the author types after the name, e.g. `NdM`. English, shown verbatim. */
  usage: string;
  labelKey: string;
  /** English description for `t(labelKey, { defaultValue: label })`. */
  label: string;
  where: 'server' | 'client';
  /** Which chats offer it. */
  kinds: readonly ChatKind[];
}

export const CHAT_COMMANDS: readonly ChatCommand[] = [
  {
    name: 'roll',
    usage: '[N]d<M>',
    labelKey: 'cmd-roll',
    label: 'Roll dice for everyone, e.g. /roll 2d6',
    where: 'server',
    kinds: ['dm', 'group'],
  },
  {
    name: 'flip',
    usage: '',
    labelKey: 'cmd-flip',
    label: 'Flip a coin',
    where: 'server',
    kinds: ['dm', 'group'],
  },
  {
    name: 'poll',
    usage: 'question | option | option',
    labelKey: 'cmd-poll',
    label: 'Start a poll (2 to 6 options)',
    where: 'server',
    kinds: ['dm', 'group'],
  },
  {
    name: 'checklist',
    usage: 'title | item | item',
    labelKey: 'cmd-checklist',
    label: 'Post a checklist anyone can tick',
    where: 'server',
    kinds: ['dm', 'group'],
  },
  {
    name: 'remind',
    usage: '<time> <text>',
    labelKey: 'cmd-remind',
    label: 'Remind yourself later, e.g. /remind 2h call back',
    where: 'client',
    kinds: ['dm', 'group'],
  },
  {
    name: 'tip',
    usage: '<amount> [@name]',
    labelKey: 'cmd-tip',
    label: 'Tip coins from your balance',
    where: 'server',
    kinds: ['dm', 'group'],
  },
  {
    name: 'gif',
    usage: '[search]',
    labelKey: 'cmd-gif',
    label: 'Search for a GIF',
    where: 'client',
    kinds: ['dm', 'group'],
  },
] as const;

const BY_NAME = new Map<string, ChatCommand>(CHAT_COMMANDS.map((c) => [c.name, c]));

export function getCommand(name: string): ChatCommand | undefined {
  return BY_NAME.get(name.toLowerCase());
}

export interface ParsedSlash {
  name: string;
  args: string;
}

/** `/name rest of the line` → `{ name, args }`. Null when it is not a slash line. */
export function parseSlash(text: string): ParsedSlash | null {
  const m = /^\/([a-z]{2,12})(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!m) return null;
  return { name: m[1].toLowerCase(), args: (m[2] ?? '').trim() };
}

/** Commands whose name starts with what is typed so far (`/ro` → roll). */
export function suggestCommands(draft: string, kind: ChatKind): ChatCommand[] {
  const m = /^\/([a-z]*)$/i.exec(draft);
  if (!m) return [];
  const prefix = m[1].toLowerCase();
  return CHAT_COMMANDS.filter((c) => c.kinds.includes(kind) && c.name.startsWith(prefix));
}

/** Is this draft a complete, registered command (so Enter runs it, not sends it)? */
export function resolveCommand(
  draft: string,
  kind: ChatKind,
): (ParsedSlash & { command: ChatCommand }) | null {
  const parsed = parseSlash(draft);
  if (!parsed) return null;
  const command = getCommand(parsed.name);
  if (!command || !command.kinds.includes(kind)) return null;
  return { ...parsed, command };
}

/* -------------------------------------------------------------------------- */
/* Argument parsers — used by the client for early feedback and by the server  */
/* as the only source of truth.                                               */
/* -------------------------------------------------------------------------- */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export const DICE_MAX_COUNT = 20;
export const DICE_MAX_SIDES = 1000;

/** `2d6`, `d20`, `20` (= d20), empty (= d6). */
export function parseDice(args: string): Parsed<{ count: number; sides: number }> {
  const s = args.trim().toLowerCase();
  if (!s) return { ok: true, value: { count: 1, sides: 6 } };
  const m = /^(\d{1,2})?d(\d{1,4})$/.exec(s) ?? /^()(\d{1,4})$/.exec(s);
  if (!m) return { ok: false, error: 'Use /roll 2d6, /roll d20 or just /roll' };
  const count = m[1] ? Number(m[1]) : 1;
  const sides = Number(m[2]);
  if (count < 1 || count > DICE_MAX_COUNT) {
    return { ok: false, error: `Roll between 1 and ${DICE_MAX_COUNT} dice` };
  }
  if (sides < 2 || sides > DICE_MAX_SIDES) {
    return { ok: false, error: `Dice have between 2 and ${DICE_MAX_SIDES} sides` };
  }
  return { ok: true, value: { count, sides } };
}

/** `question | a | b | c` — 2 to 6 options. */
export function parsePoll(args: string): Parsed<{ question: string; options: string[] }> {
  const parts = args
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3) return { ok: false, error: 'Use /poll question | option | option' };
  const [question, ...options] = parts;
  if (options.length > 6) return { ok: false, error: 'A poll has at most 6 options' };
  if (question.length > 300 || options.some((o) => o.length > 100)) {
    return { ok: false, error: 'That poll is too long' };
  }
  return { ok: true, value: { question, options } };
}

/** `title | item | item` — the first part is the title. */
export function parseChecklist(args: string): Parsed<{ title: string; items: string[] }> {
  const parts = args
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return { ok: false, error: 'Use /checklist title | item | item' };
  const [title, ...items] = parts;
  if (items.length > CHECKLIST_MAX_ITEMS) {
    return { ok: false, error: `A checklist has at most ${CHECKLIST_MAX_ITEMS} items` };
  }
  if (title.length > CHECKLIST_TITLE_MAX || items.some((i) => i.length > CHECKLIST_ITEM_MAX)) {
    return { ok: false, error: 'That checklist is too long' };
  }
  return { ok: true, value: { title, items } };
}

/** `50` or `50 @name` (the handle is only needed in group chats). */
export function parseTip(args: string): Parsed<{ amount: number; handle: string | null }> {
  const m = /^(\d{1,6})(?:\s+@?([A-Za-z0-9_.-]{1,40}))?$/.exec(args.trim());
  if (!m) return { ok: false, error: 'Use /tip 50 (or /tip 50 @name in a group)' };
  const amount = Number(m[1]);
  if (amount < TIP_MIN || amount > TIP_MAX) {
    return { ok: false, error: `Tips are between ${TIP_MIN} and ${TIP_MAX} coins` };
  }
  return { ok: true, value: { amount, handle: m[2] ?? null } };
}

const UNIT_MS: Record<string, number> = {
  w: 7 * 86_400_000,
  d: 86_400_000,
  h: 3_600_000,
  m: 60_000,
};

/**
 * `/remind <time> <text>` where time is a compound duration (`10m`, `2h`,
 * `1d`, `1h30m`) or `tonight` / `tomorrow` / `week`, resolved on the caller's
 * clock — which is why this runs on the client.
 */
export function parseRemind(
  args: string,
  now: Date = new Date(),
): Parsed<{ remindAt: Date; text: string }> {
  const m = /^(\S+)\s+([\s\S]+)$/.exec(args.trim());
  const usage = 'Use /remind 2h call back (or tonight, tomorrow, 1d, 1h30m)';
  if (!m) return { ok: false, error: usage };
  const when = m[1].toLowerCase();
  const text = m[2].trim().slice(0, 140);
  if (!text) return { ok: false, error: usage };

  let remindAt: Date | null = null;
  if (when === 'tonight' || when === 'tomorrow') remindAt = resolvePreset(when, now);
  else if (when === 'week') remindAt = resolvePreset('week', now);
  else if (/^(?:\d+[wdhm])+$/.test(when)) {
    let ms = 0;
    for (const part of when.matchAll(/(\d+)([wdhm])/g)) ms += Number(part[1]) * UNIT_MS[part[2]];
    remindAt = new Date(now.getTime() + ms);
  }
  if (!remindAt) return { ok: false, error: usage };
  if (remindAt.getTime() < now.getTime() + 60_000) {
    return { ok: false, error: 'Pick a time at least a minute away' };
  }
  if (remindAt.getTime() > now.getTime() + MAX_REMINDER_AHEAD_MS) {
    return { ok: false, error: 'Pick a time within a year' };
  }
  return { ok: true, value: { remindAt, text } };
}

/** English fallback text for a dice roll, stored in `content`. */
export function diceText(count: number, sides: number, rolls: number[], total: number): string {
  const label = `${count}d${sides}`;
  return count === 1
    ? `Rolled ${label}: ${total}`
    : `Rolled ${label}: ${rolls.join(' + ')} = ${total}`;
}
