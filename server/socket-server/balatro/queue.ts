/**
 * Balatro multiplayer — the casual matchmaking book (PLAN §3.a hub rules,
 * MM-01/MM-06, D-33; WS12). Pure state, no sockets: the handler
 * (handlers/balatro-queue.ts) feeds it and performs what it decides.
 *
 *   - **Buckets.** A ticket waits in the bucket of its `queueMode` and
 *     `contentHash` (D-36: two builds never meet).
 *   - **Tickets.** A solo player, or a whole party (atomic: placed together or
 *     not at all). One ticket per account at a time.
 *   - **Matching.** Oldest first: the oldest ticket opens a group and the
 *     next-oldest tickets that still fit join it, up to the mode's maximum
 *     (Nemesis 2, the rest 16). A full group matches at once; otherwise a
 *     group of at least 2 players matches once its oldest ticket has waited
 *     the gather window (10 s). A group always holds at least two tickets, so
 *     a party is never matched with only itself.
 *   - **Host.** The first player of the oldest ticket (a party's host), the
 *     earliest-waiting player (§3.a).
 *
 * Also here: the per-account invite budget (`INVITES_PER_MIN`) and the
 * offline-notification de-duplication. Single process, in memory
 * (server/CLAUDE.md gotcha 1). Relative imports only (gotcha 7).
 */

import { BALATRO_LIMITS } from '../../../lib/balatro/net/limits';
import type { QueueMode } from '../../../lib/balatro/net/events';

export const QUEUE_TIMING = {
  /** A short group (≥2, below the maximum) matches after its oldest ticket waited this long. */
  GATHER_MS: 10_000,
  /** The elected host must have hosted the casual room by then, or the match falls through. */
  HOST_CLAIM_MS: 15_000,
  /** How often the handler looks for the elected host's room while a match is pending. */
  HOST_POLL_MS: 100,
  /** One offline notification per (invitee, lobby) per this window. */
  NOTIFY_DEDUPE_MS: 10 * 60_000,
} as const;

/** Players per matched lobby — the same numbers as `maxPlayersFor(mode, 'casual')`. */
export function queueModeMax(mode: QueueMode): number {
  return mode === 'pvp_nemesis' ? 2 : BALATRO_LIMITS.MAX_PLAYERS;
}

export interface QueuePlayer {
  userId: string;
  socketId: string;
}

export interface QueueTicket {
  id: number;
  queueMode: QueueMode;
  contentHash: string;
  enqueuedAt: number;
  /** Ordered: the first is the ticket's leader (a party's host). */
  players: QueuePlayer[];
  /** The party room the ticket came from, or null for a solo player. */
  partyCode: string | null;
}

export interface QueueMatch {
  queueMode: QueueMode;
  contentHash: string;
  tickets: QueueTicket[];
  host: QueuePlayer;
  /** Every matched player, the host first. */
  players: QueuePlayer[];
}

function bucketKey(mode: QueueMode, hash: string): string {
  return `${mode}\n${hash}`;
}

export class QueueBook {
  private readonly buckets = new Map<string, QueueTicket[]>();
  private readonly byUser = new Map<string, QueueTicket>();
  private nextId = 1;

  /** The ticket holding this account, or null. */
  ticketOf(userId: string): QueueTicket | null {
    return this.byUser.get(userId) ?? null;
  }

  /** Every ticket that has a player on this socket. */
  ticketsOnSocket(socketId: string): QueueTicket[] {
    const out = new Set<QueueTicket>();
    for (const t of this.byUser.values()) if (t.players.some((p) => p.socketId === socketId)) out.add(t);
    return [...out];
  }

  /**
   * Queue a ticket. Every player must be free (the caller removed older tickets first); a
   * re-queued ticket keeps its place (`enqueuedAt`) when given one.
   */
  add(t: Omit<QueueTicket, 'id' | 'enqueuedAt'> & { enqueuedAt: number }): QueueTicket {
    for (const p of t.players) if (this.byUser.has(p.userId)) throw new Error(`already queued: ${p.userId}`);
    const ticket: QueueTicket = { ...t, id: this.nextId++, players: t.players.map((p) => ({ ...p })) };
    const key = bucketKey(t.queueMode, t.contentHash);
    const list = this.buckets.get(key) ?? [];
    // Kept sorted by enqueuedAt (a re-queued ticket goes back where it was).
    let i = list.length;
    while (i > 0 && list[i - 1].enqueuedAt > ticket.enqueuedAt) i -= 1;
    list.splice(i, 0, ticket);
    this.buckets.set(key, list);
    for (const p of ticket.players) this.byUser.set(p.userId, ticket);
    return ticket;
  }

  remove(ticket: QueueTicket): boolean {
    const key = bucketKey(ticket.queueMode, ticket.contentHash);
    const list = this.buckets.get(key);
    const i = list ? list.indexOf(ticket) : -1;
    if (!list || i < 0) return false;
    list.splice(i, 1);
    if (list.length === 0) this.buckets.delete(key);
    for (const p of ticket.players) if (this.byUser.get(p.userId) === ticket) this.byUser.delete(p.userId);
    return true;
  }

  /** The tickets sharing this ticket's bucket (itself included), oldest first. */
  bucketOf(ticket: QueueTicket): readonly QueueTicket[] {
    return this.buckets.get(bucketKey(ticket.queueMode, ticket.contentHash)) ?? [];
  }

  /** Players waiting in a bucket. */
  waiting(mode: QueueMode, hash: string): number {
    let n = 0;
    for (const t of this.buckets.get(bucketKey(mode, hash)) ?? []) n += t.players.length;
    return n;
  }

  size(): number {
    return this.byUser.size;
  }

  /** The oldest-first group the bucket would match now, or null. */
  private group(list: readonly QueueTicket[], now: number): QueueTicket[] | null {
    const oldest = list[0];
    if (!oldest) return null;
    const max = queueModeMax(oldest.queueMode);
    const group: QueueTicket[] = [];
    let size = 0;
    for (const t of list) {
      if (size + t.players.length > max) continue;
      group.push(t);
      size += t.players.length;
      if (size === max) break;
    }
    if (group.length < 2 || size < 2) return null;
    if (size === max) return group;
    return now - oldest.enqueuedAt >= QUEUE_TIMING.GATHER_MS ? group : null;
  }

  /** Take every match that is due (the tickets leave the book). */
  takeMatches(now: number): QueueMatch[] {
    const out: QueueMatch[] = [];
    for (const list of [...this.buckets.values()]) {
      for (;;) {
        const group = this.group(list, now);
        if (!group) break;
        for (const t of group) this.remove(t);
        const players = group.flatMap((t) => t.players.map((p) => ({ ...p })));
        out.push({
          queueMode: group[0].queueMode,
          contentHash: group[0].contentHash,
          tickets: group,
          host: players[0],
          players,
        });
        if (!this.buckets.has(bucketKey(group[0].queueMode, group[0].contentHash))) break;
      }
    }
    return out;
  }

  /** When the next short group becomes due (its oldest ticket's window ends), or null. */
  nextWake(now: number): number | null {
    let best: number | null = null;
    for (const list of this.buckets.values()) {
      const oldest = list[0];
      if (!oldest || list.length < 2) continue;
      const at = Math.max(now, oldest.enqueuedAt + QUEUE_TIMING.GATHER_MS);
      if (best === null || at < best) best = at;
    }
    return best;
  }

  /** Every ticket (tests and shutdown). */
  all(): QueueTicket[] {
    return [...this.buckets.values()].flat();
  }

  clear(): void {
    this.buckets.clear();
    this.byUser.clear();
  }
}

/** A sliding one-minute window per account (`INVITES_PER_MIN`). */
export class InviteBudget {
  private readonly sent = new Map<string, number[]>();

  constructor(private readonly perMinute: number = BALATRO_LIMITS.INVITES_PER_MIN) {}

  take(userId: string, now: number): boolean {
    const recent = (this.sent.get(userId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= this.perMinute) {
      this.sent.set(userId, recent);
      return false;
    }
    recent.push(now);
    this.sent.set(userId, recent);
    return true;
  }

  clear(): void {
    this.sent.clear();
  }
}

/** Remembers which offline notifications went out recently, so a re-invite does not spam. */
export class NotifyDedupe {
  private readonly at = new Map<string, number>();

  /** True when a notification for (to, code) may go out now (and records it). */
  take(to: string, code: string, now: number): boolean {
    const key = `${to}\n${code}`;
    const last = this.at.get(key);
    if (last !== undefined && now - last < QUEUE_TIMING.NOTIFY_DEDUPE_MS) return false;
    this.at.set(key, now);
    if (this.at.size > 4_096) {
      for (const [k, t] of this.at) if (now - t >= QUEUE_TIMING.NOTIFY_DEDUPE_MS) this.at.delete(k);
    }
    return true;
  }

  clear(): void {
    this.at.clear();
  }
}
