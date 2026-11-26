/**
 * The compare-and-set transport for the shared save route.
 *
 * The kit's `jsonTransport` is last-writer-wins: it never sends `expectedUpdatedAt` and treats a `409` as a plain
 * failure, so a stale tab or a second device could write over a newer account copy. This transport is the one a game
 * passes to `createCloudSave` (or composes into its own `CloudSave`) when that must not happen. It is the same idea
 * as Hearthworks' (`features/hearthworks/engine/save/account.ts`), reduced to what a small save needs:
 *
 * - **It remembers the row's `updatedAt`.** The GET gives it (`null` when the account has no row); every accepted write
 *   gives the next one back. The next write sends it as `expectedUpdatedAt`, so the server applies it only if the row is
 *   still the one this device last saw.
 * - **A 409 stops uploads for the session.** The row moved on another device. Nothing was written; the transport
 *   marks itself {@link CasTransport.stale} and refuses further writes until the next `read()` (the game's next
 *   `resolve`) learns the row as it is now and the player is asked, if a choice is needed.
 * - **It never guesses.** Before any read it does not know what to expect, so it refuses to write rather than send
 *   a value that could overwrite a copy it has not seen.
 * - **The beacon carries the same `expectedUpdatedAt`**, so a stale tab's last write on `pagehide` is refused by the
 *   server, never applied. A beacon's answer is invisible to the page, so afterwards the transport no longer knows the
 *   row's time: it marks itself {@link CasTransport.stale} like after a 409, so a page that comes back from the
 *   back-forward cache is told to read again (the game's next `resolve`) instead of refusing every write until a
 *   reload.
 * - **Writes go one at a time.** A second write waits for the first, so it carries the `updatedAt` the first returned
 *   instead of the same expectation (which the server would refuse as stale).
 *
 * The local copy is always written first and is not this module's business.
 *
 * No React Query, no router, no zod: an island (Nightrail) may import this.
 */
import { apiUrl } from '@/lib/contract/client';
import { readJsonWithDeadline, type CloudTransport } from '@/lib/game-saves/cloud-save';
import { saveGameApi } from '@/lib/game-saves/saves.contract';

/** `sendBeacon` and `keepalive` cap a body at 64 KB; stay clear of it. */
export const BEACON_MAX_BYTES = 60_000;

/** Why a write was not sent or not accepted. */
export type CasRefusal = 'stale' | 'unknown';

/** Thrown by {@link CasTransport.write} when nothing was written because the account copy moved or is unknown. */
export class SaveNotWrittenError extends Error {
  readonly reason: CasRefusal;
  constructor(reason: CasRefusal) {
    super(reason === 'stale' ? 'The account copy changed elsewhere' : 'The account copy has not been read');
    this.name = 'SaveNotWrittenError';
    this.reason = reason;
  }
}

export interface CasTransport extends CloudTransport {
  /**
   * Another device saved since this one last read the account (a 409), or a beacon went out whose answer this page
   * cannot see. Writes are refused until the next `read()`.
   */
  readonly stale: boolean;
  /**
   * The row's `updatedAt` as last read or written: an ISO time, `null` for "the account had no row", or `undefined`
   * when it is not known (never read, a read failed, or a beacon went out).
   */
  readonly updatedAt: string | null | undefined;
  /** Forget everything learned about the account (a new identity). */
  reset(): void;
}

function readUpdatedAt(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? null : time.toISOString();
}

export function casJsonTransport(gameId: string): CasTransport {
  const url = apiUrl(saveGameApi, { params: { gameId } });
  let updatedAt: string | null | undefined;
  let stale = false;
  /** The write in flight, if any: the next one starts after it settles. */
  let queue: Promise<unknown> = Promise.resolve();
  /** Bumped by `reset()`: an answer that arrives for the previous identity teaches this one nothing. */
  let generation = 0;

  /** Larger than the keepalive cap: a plain request, which a page that stays open can still finish. */
  const keepalive = (body: string) => body.length <= BEACON_MAX_BYTES;

  /** One write, checked against what is known when it actually starts. */
  const send = async (payload: unknown): Promise<void> => {
    if (stale) throw new SaveNotWrittenError('stale');
    if (updatedAt === undefined) throw new SaveNotWrittenError('unknown');
    const body = JSON.stringify({ saveData: payload, expectedUpdatedAt: updatedAt });
    const started = generation;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: keepalive(body),
      body,
    });
    if (started !== generation) throw new SaveNotWrittenError('unknown');
    if (res.status === 409) {
      stale = true;
      throw new SaveNotWrittenError('stale');
    }
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
    const next = readUpdatedAt(((await res.json().catch(() => null)) as { updatedAt?: unknown } | null)?.updatedAt);
    if (started !== generation) return;
    // An accepted write whose answer cannot be read leaves the next expectation unknown, never a stale one.
    updatedAt = next ?? undefined;
  };

  return {
    get stale() {
      return stale;
    },
    get updatedAt() {
      return updatedAt;
    },

    reset() {
      generation++;
      updatedAt = undefined;
      stale = false;
    },

    async read() {
      const json = (await readJsonWithDeadline(url)) as { saveData?: unknown; updatedAt?: unknown } | null;
      // A non-2xx answer is `null`: the row's state is not known, so nothing may be written over it.
      if (!json) {
        updatedAt = undefined;
        return null;
      }
      updatedAt = json.saveData == null ? null : readUpdatedAt(json.updatedAt);
      // A row whose time cannot be read is as good as unknown.
      if (json.saveData != null && updatedAt === null) updatedAt = undefined;
      stale = false;
      return json.saveData ?? null;
    },

    write(payload) {
      const run = queue.then(() => send(payload));
      queue = run.catch(() => undefined);
      return run;
    },

    beacon(payload) {
      if (stale || updatedAt === undefined) return false;
      const body = JSON.stringify({ saveData: payload, expectedUpdatedAt: updatedAt });
      let sent = false;
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' && keepalive(body)) {
          sent = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        }
      } catch {
        // A body the browser considers too large.
      }
      if (!sent) {
        // Both are capped at 64 KB; a plain keepalive-less request is the last thing worth trying. The local copy has
        // already been written either way.
        try {
          void fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: keepalive(body),
            body,
          }).catch(() => {});
          sent = true;
        } catch {
          return false;
        }
      }
      // Whatever the server answers, this page cannot see it: read again before the next write.
      updatedAt = undefined;
      if (sent) stale = true;
      return sent;
    },

    async remove() {
      const res = await fetch(url, { method: 'DELETE', keepalive: true });
      if (res.ok) {
        updatedAt = null;
        stale = false;
      }
    },
  };
}
