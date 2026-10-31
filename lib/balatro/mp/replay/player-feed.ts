/**
 * Feeding a log to the Lua playback driver (WS13, REP-03/04): `replay_view`
 * opens a playback (`playing {id, pov, pos, len}`) and `replay_feed {pov,
 * events}` carries the POV's events in chunks that respect the mailbox
 * limits (≤ 1024 events per message, one NDJSON line ≤ 64 KB — chunks stay
 * under 48 KB of events to leave room for the envelope).
 *
 * Only the POV's own log is fed: the recorder logged the network inputs that
 * player received (`net_in`), so the opponents' display is re-projected from
 * the same log. A POV switch re-opens the playback with another player's log.
 */

import type { J2LData } from '../bridge-protocol';
import type { BridgeLike } from '../transport/types';
import type { ReplayEvent } from '../types';
import { chunkEvents } from './log';
import type { ReplayListEntry } from './store';

export const FEED_LIMITS = {
  /** bridge-protocol `replay_feed.events` max. */
  EVENTS: 1024,
  /** Event bytes per message (the line limit is 64 KB). */
  BYTES: 48 * 1024,
} as const;

/** Prefix of a playback id that is a live (spectated) match. */
export const LIVE_PREFIX = 'live:';

export function feedChunks(events: readonly ReplayEvent[]): ReplayEvent[][] {
  return chunkEvents(events, FEED_LIMITS.EVENTS, FEED_LIMITS.BYTES);
}

/** Send `events` of `pov` to Lua. Returns the number of messages. */
export function sendFeed(bridge: BridgeLike, pov: string, events: readonly ReplayEvent[]): number {
  let n = 0;
  for (const chunk of feedChunks(events)) {
    bridge.send('replay_feed', { pov, events: chunk });
    n += 1;
  }
  return n;
}

/** Open a playback in Lua (`replay_view.playing`). */
export function sendOpen(bridge: BridgeLike, id: string, pov: string, len: number, speed?: number): void {
  const d: J2LData<'replay_view'> = { playing: { id: id.slice(0, 64), pov, pos: 0, len } };
  if (speed !== undefined) d.speed = speed;
  bridge.send('replay_view', d);
}

/** The My Replays list for Lua (newest first, ≤ 30). */
export function sendList(bridge: BridgeLike, list: readonly ReplayListEntry[]): void {
  bridge.send('replay_view', {
    list: list.slice(0, 30).map((e) => ({
      id: e.id.slice(0, 64),
      at: e.at,
      queueMode: e.queueMode,
      ruleset: e.ruleset,
      players: e.players.map((p) => p.slice(0, 64)).slice(0, 16),
      result: e.result,
    })),
  });
}
