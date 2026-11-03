/**
 * Watch rooms — the shared screen. Pure and client-safe.
 *
 * A room is a layout (how many panes, arranged how) and up to four panes, each
 * showing one thing: a live stream, a race with its numbers, a graph of vote
 * share over time, the state map, the news wire, the room chat or the event
 * feed. The same `RoomConfig` drives all three kinds of room:
 *
 *  - SOLO: the config lives in the visitor's browser (localStorage). No server.
 *  - PRIVATE / PUBLIC: the config is stored on the room (the host edits it,
 *    everyone's screen follows) — private rooms are reachable only by their code.
 *
 * Everything that crosses a trust boundary (an API body, a localStorage blob)
 * goes through `sanitizeRoomConfig`, which never throws: it keeps what is valid,
 * drops what is not, and fills defaults — so a stale or hand-edited config can
 * degrade a pane to "empty", never break the room.
 */

import { z } from 'zod';
import type { FollowMode } from './events';
import { parseEmbed } from './streams';
import { STATE_NAMES } from './states';
import { OFFICES } from './types';

export const LAYOUTS = ['1', '2h', '2v', '3l', '4'] as const;
export type Layout = (typeof LAYOUTS)[number];

/** How many panes a layout shows. */
export const LAYOUT_PANES: Record<Layout, number> = { '1': 1, '2h': 2, '2v': 2, '3l': 3, '4': 4 };

export const PANE_KINDS = ['stream', 'race', 'graph', 'map', 'wire', 'chat', 'events'] as const;
export type PaneKind = (typeof PANE_KINDS)[number];

export const FOLLOW_MODES = ['off', 'major', 'calls', 'closings', 'all'] as const satisfies readonly FollowMode[];

const stateCode = z.string().length(2).refine((s) => s in STATE_NAMES, 'unknown state');
const office = z.enum(OFFICES);
const followMode = z.enum(FOLLOW_MODES);

/** A pane that points at a race: pinned to a state + office, or following the action. */
const target = {
  follow: followMode.default('off'),
  state: stateCode.nullable().default(null),
  office: office.default('senate'),
};

const paneSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string().min(1).max(24), kind: z.literal('stream'), url: z.string().max(300).default('') }),
  z.object({ id: z.string().min(1).max(24), kind: z.literal('race'), ...target }),
  z.object({ id: z.string().min(1).max(24), kind: z.literal('graph'), ...target }),
  z.object({ id: z.string().min(1).max(24), kind: z.literal('map'), office: office.default('senate') }),
  z.object({ id: z.string().min(1).max(24), kind: z.literal('wire'), state: stateCode.nullable().default(null) }),
  z.object({ id: z.string().min(1).max(24), kind: z.literal('chat') }),
  z.object({ id: z.string().min(1).max(24), kind: z.literal('events') }),
]);

export type Pane = z.infer<typeof paneSchema>;
export type StreamPane = Extract<Pane, { kind: 'stream' }>;
export type RacePane = Extract<Pane, { kind: 'race' | 'graph' }>;

export interface RoomConfig {
  layout: Layout;
  /** Exactly `LAYOUT_PANES[layout]` panes (extras are hidden, not deleted, when the layout shrinks). */
  panes: Pane[];
}

/** A sensible first screen: one stream, the action, and the room chat. */
export function defaultRoomConfig(): RoomConfig {
  return {
    layout: '3l',
    panes: [
      { id: 'p1', kind: 'stream', url: '' },
      { id: 'p2', kind: 'race', follow: 'major', state: null, office: 'senate' },
      { id: 'p3', kind: 'chat' },
    ],
  };
}

const MAX_PANES = 4;
const MAX_STREAMS = 4;

/**
 * Make any input into a valid config. A pane that fails validation becomes its default for that
 * slot; a stream pane whose URL is not an embeddable link keeps the pane but loses the URL.
 */
export function sanitizeRoomConfig(raw: unknown): RoomConfig {
  const base = defaultRoomConfig();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as { layout?: unknown; panes?: unknown };
  const layout = (LAYOUTS as readonly string[]).includes(r.layout as string) ? (r.layout as Layout) : base.layout;

  const panes: Pane[] = [];
  const seen = new Set<string>();
  let streams = 0;
  if (Array.isArray(r.panes)) {
    for (const p of r.panes.slice(0, MAX_PANES)) {
      const parsed = paneSchema.safeParse(p);
      if (!parsed.success) continue;
      let pane = parsed.data;
      if (seen.has(pane.id)) pane = { ...pane, id: `${pane.id}-${panes.length}` };
      if (pane.kind === 'stream') {
        if (++streams > MAX_STREAMS) continue;
        // Keep only a URL we can build a safe embed from.
        pane = { ...pane, url: pane.url && parseEmbed(pane.url) ? pane.url : '' };
      }
      seen.add(pane.id);
      panes.push(pane);
    }
  }

  // Fill to the layout's size from the defaults, then a plain "events" feed, so a room is never blank.
  const need = LAYOUT_PANES[layout];
  const fallbacks: Pane[] = [...base.panes, { id: 'p4', kind: 'events' }];
  for (const f of fallbacks) {
    if (panes.length >= need) break;
    if (!seen.has(f.id)) {
      seen.add(f.id);
      panes.push(f);
    }
  }
  while (panes.length < need) panes.push({ id: `x${panes.length}`, kind: 'events' });
  return { layout, panes: panes.slice(0, MAX_PANES) };
}

/** Strictly validate (for an API body): the same rules, but reports instead of repairing. */
export function validateRoomConfig(raw: unknown): { ok: true; config: RoomConfig } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'config must be an object' };
  const r = raw as { layout?: unknown; panes?: unknown };
  if (!(LAYOUTS as readonly string[]).includes(r.layout as string)) return { ok: false, error: 'unknown layout' };
  if (!Array.isArray(r.panes) || r.panes.length < 1 || r.panes.length > MAX_PANES) return { ok: false, error: `1–${MAX_PANES} panes` };
  let streams = 0;
  for (const p of r.panes) {
    const parsed = paneSchema.safeParse(p);
    if (!parsed.success) return { ok: false, error: 'invalid pane' };
    if (parsed.data.kind === 'stream') {
      streams++;
      if (parsed.data.url && !parseEmbed(parsed.data.url)) return { ok: false, error: 'stream link is not an embeddable YouTube or Twitch link' };
    }
  }
  if (streams > MAX_STREAMS) return { ok: false, error: 'too many streams' };
  return { ok: true, config: sanitizeRoomConfig(raw) };
}

/** The panes a layout actually shows. */
export const visiblePanes = (c: RoomConfig): Pane[] => c.panes.slice(0, LAYOUT_PANES[c.layout]);

/** Replace one pane (by id) — used by the pane picker. */
export function withPane(c: RoomConfig, id: string, next: Pane): RoomConfig {
  return { ...c, panes: c.panes.map((p) => (p.id === id ? { ...next, id } : p)) };
}

/** Change layout; panes beyond the new size are kept (hidden) so switching back restores them. */
export function withLayout(c: RoomConfig, layout: Layout): RoomConfig {
  return sanitizeRoomConfig({ ...c, layout });
}

/** A fresh pane of a kind, with defaults. */
export function newPane(kind: PaneKind, id: string): Pane {
  switch (kind) {
    case 'stream':
      return { id, kind, url: '' };
    case 'race':
    case 'graph':
      return { id, kind, follow: 'off', state: null, office: 'senate' };
    case 'map':
      return { id, kind, office: 'senate' };
    case 'wire':
      return { id, kind, state: null };
    case 'chat':
    case 'events':
      return { id, kind };
  }
}

export const ROOM_NAME_MAX = 60;
export const roomNameSchema = z.string().trim().min(2).max(ROOM_NAME_MAX);
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
export const ROOM_CODE_LENGTH = 8;
export const isRoomCode = (s: unknown): s is string => typeof s === 'string' && new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`).test(s);
