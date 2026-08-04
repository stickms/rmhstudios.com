/**
 * One save, in up to two places.
 *
 * Every game that keeps progress now goes through this. It owns three things a
 * game should not have to re-solve, and which several of them had each solved
 * slightly differently and slightly wrong:
 *
 * 1. **The local copy is always written, synchronously, first.** It is the only
 *    write that cannot be cancelled by the page disappearing. The account copy
 *    is how a save reaches another device; the local one is how it survives
 *    closing the laptop.
 * 2. **The local copy is stamped with whose it is.** Two people sharing a
 *    browser used to share a save key, so signing in as somebody else offered
 *    you their run — and, if you kept playing, wrote it to your account. A save
 *    written while signed OUT stays claimable, because "I played as a guest and
 *    then made an account" is the whole point of guest play; a save written by a
 *    *different* signed-in account is invisible.
 * 3. **Nothing is overwritten without a decision.** {@link CloudSave.resolve}
 *    returns a conflict rather than picking, and only a player's answer to that
 *    conflict destroys anything. See `conflict.ts` for why "newest wins" is not
 *    good enough.
 *
 * Signed out, every cloud call is a no-op — not a request that 401s. A guest
 * playing offline should generate no network traffic at all, and a 401 in the
 * console on every autosave is how you teach people to ignore their console.
 */
import {
  chooseSave,
  type MonotonicCounters,
  type SaveChoice,
  type SaveSummary,
} from './conflict';

/* ══════════════════════════════════════════════════════════════════════════
   Transport
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * How a save reaches the account.
 *
 * Pluggable because four games predate the shared endpoint and answer on their
 * own routes with their own envelopes. New games get {@link jsonTransport} and
 * the shared `/api/game-saves/:gameId` route; the older ones pass an adapter and
 * keep their table.
 */
export interface CloudTransport {
  /** The stored payload, or `null` for "no save on the account". */
  read(): Promise<unknown>;
  write(payload: unknown): Promise<void>;
  /** The teardown write. `false` means it could not be handed off. */
  beacon(payload: unknown): boolean;
  remove(): Promise<void>;
}

/**
 * The standard envelope: `{ saveData }` in both directions.
 *
 * `keepalive` on the ordinary write too, so a save already in flight when the
 * player navigates away still lands.
 */
export function jsonTransport(endpoint: string): CloudTransport {
  return {
    async read() {
      const res = await fetch(endpoint);
      if (!res.ok) return null;
      const json = (await res.json()) as { saveData?: unknown } | null;
      return json?.saveData ?? null;
    },

    async write(payload) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({ saveData: payload }),
      });
      // Surfaced so the caller can rewind its throttle and retry promptly
      // rather than treating a 429 as a successful save.
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
    },

    beacon(payload) {
      const body = JSON.stringify({ saveData: payload });

      try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          // The Blob's type becomes the Content-Type; without it the route sees
          // `text/plain` and some stacks refuse to parse the body.
          if (navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }))) {
            return true;
          }
        }
      } catch {
        // Beacon throws on a body the browser considers too large.
      }

      // Both `sendBeacon` and `keepalive` cap the body at 64 KB, and a late-game
      // save can approach that. Falling through to a plain keepalive fetch is
      // worth a try; failing that, the local write has already landed.
      try {
        void fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body,
        }).catch(() => {});
        return true;
      } catch {
        return false;
      }
    },

    async remove() {
      await fetch(endpoint, { method: 'DELETE', keepalive: true });
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Configuration
   ══════════════════════════════════════════════════════════════════════════ */

export interface CloudSaveConfig<T> {
  /** Catalog id — `temple-of-joy`, `cookgame`. Names the shared endpoint. */
  gameId: string;
  /** The `localStorage` key this game already uses. Never change it lightly. */
  localKey: string;
  /** Defaults to the shared route for `gameId`. */
  transport?: CloudTransport;
  /**
   * Read a stored payload back into a save, or reject it.
   *
   * This is the game's version check and its corruption guard. Anything that
   * returns `null` here is treated as "no save", which is the safe reading: a
   * save nobody can parse is not a save somebody can lose.
   */
  parse: (raw: unknown) => T | null;
  /** Counters that only ever go up. See `conflict.ts`. */
  monotonic: (save: T) => MonotonicCounters;
  /**
   * When the save was written. Optional: games whose format has no timestamp
   * fall back to the one this module stamps beside the save.
   */
  savedAt?: (save: T) => number;
  /** The two or three figures a player picks between. */
  summarize: (save: T) => SaveSummary;
}

/** What is written next to a save, about the save. */
interface SaveMeta {
  /** The account that wrote it, or `null` for a guest. */
  owner: string | null;
  /** When, ms since epoch. */
  at: number;
}

export interface CloudSave<T> {
  readonly gameId: string;
  /** `null` while signed out. Cloud calls are no-ops until this is set. */
  setIdentity(userId: string | null): void;
  getIdentity(): string | null;

  readLocal(): T | null;
  writeLocal(save: T, at?: number): void;
  clearLocal(): void;

  readCloud(): Promise<T | null>;
  writeCloud(save: T, at?: number): Promise<void>;
  /** The last-chance write, from `pagehide`/`visibilitychange`. */
  writeBeacon(save: T, at?: number): boolean;

  /** Read both sides and decide, or report that a person has to. */
  resolve(): Promise<SaveChoice<T>>;
  /** Make this save the truth in both places. Used to answer a conflict. */
  commit(save: T, at?: number): Promise<void>;
  /** Erase it everywhere. */
  clear(): Promise<void>;

  summarize(save: T): SaveSummary;
}

/* ══════════════════════════════════════════════════════════════════════════
   The thing itself
   ══════════════════════════════════════════════════════════════════════════ */

export function createCloudSave<T>(config: CloudSaveConfig<T>): CloudSave<T> {
  const transport = config.transport ?? jsonTransport(`/api/game-saves/${config.gameId}`);
  const metaKey = `${config.localKey}::meta`;
  let identity: string | null = null;

  const readMeta = (): SaveMeta | null => {
    try {
      const raw = localStorage.getItem(metaKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<SaveMeta>;
      return {
        owner: typeof parsed.owner === 'string' ? parsed.owner : null,
        at: typeof parsed.at === 'number' && Number.isFinite(parsed.at) ? parsed.at : 0,
      };
    } catch {
      return null;
    }
  };

  const savedAt = (save: T): number => {
    const own = config.savedAt?.(save);
    if (typeof own === 'number' && Number.isFinite(own) && own > 0) return own;
    return readMeta()?.at ?? 0;
  };

  return {
    gameId: config.gameId,

    setIdentity(userId) {
      identity = userId;
    },

    getIdentity() {
      return identity;
    },

    /**
     * The local copy — if it is ours.
     *
     * A save with no meta at all was written by a build that predates this
     * module, and is treated as unowned rather than discarded: orphaning every
     * existing save to gain a stricter rule would be the bug, not the fix.
     */
    readLocal() {
      try {
        const meta = readMeta();
        if (meta?.owner && identity && meta.owner !== identity) return null;

        const raw = localStorage.getItem(config.localKey);
        if (!raw) return null;
        return config.parse(JSON.parse(raw));
      } catch {
        // Private browsing, quota, a disabled storage API, unparseable JSON.
        return null;
      }
    },

    writeLocal(save, at = Date.now()) {
      try {
        localStorage.setItem(config.localKey, JSON.stringify(save));
        localStorage.setItem(metaKey, JSON.stringify({ owner: identity, at } satisfies SaveMeta));
      } catch {
        // Nothing here should interrupt a game that also saves to the server.
      }
    },

    clearLocal() {
      try {
        localStorage.removeItem(config.localKey);
        localStorage.removeItem(metaKey);
      } catch {
        // As above.
      }
    },

    async readCloud() {
      if (!identity) return null;
      try {
        const raw = await transport.read();
        return raw == null ? null : config.parse(raw);
      } catch {
        // Offline, or the account has no row. Either way this device is the
        // freshest copy for now, which the caller handles as "local only".
        return null;
      }
    },

    async writeCloud(save) {
      if (!identity) return;
      await transport.write(save);
    },

    writeBeacon(save) {
      if (!identity) return false;
      return transport.beacon(save);
    },

    async resolve() {
      const local = this.readLocal();
      const cloud = await this.readCloud();
      return chooseSave({ local, cloud, monotonic: config.monotonic, savedAt });
    },

    async commit(save, at = Date.now()) {
      this.writeLocal(save, at);
      await this.writeCloud(save, at);
    },

    /**
     * Local first and unconditionally: a wipe that cleared only the account
     * would be undone by the next autosave the moment the page reloaded.
     */
    async clear() {
      this.clearLocal();
      if (!identity) return;
      try {
        await transport.remove();
      } catch {
        // Offline, or nothing to delete. The local copy is already gone, which
        // is what was asked for.
      }
    },

    summarize: config.summarize,
  };
}
