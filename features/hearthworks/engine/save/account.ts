import { api, apiUrl } from '@/lib/contract/client';
import { readJsonWithDeadline } from '@/lib/game-saves/cloud-save';
import { chooseSave } from '@/lib/game-saves/conflict';
import { HttpError } from '@/lib/http';
import { saveGameApi } from '@/lib/game-saves/saves.contract';
import {
  HEARTHWORKS_CLOUD_BYTES,
  compressionSupported,
  monotonicOf,
  packWorld,
  payloadBytes,
  payloadSavedAt,
  payloadTick,
  summaryOf,
  unpackWorld,
  type HearthworksPayload,
  type HearthworksSummary,
} from './cloud';
import { LOCAL_PLAYER_ID } from '../net/identity';
import type { World } from '../world';

/**
 * The sync controller that carries a Hearthworks town to the member's account.
 *
 * The local copy (IndexedDB) stays first: the game writes it, then asks this controller to follow. Nothing here ever
 * touches the local copy, and nothing is overwritten on either side without the player's choice:
 *
 * - **Open:** `resolveOnOpen` compares the two copies with `chooseSave`. One that is simply further along wins quietly;
 *   two that each did something the other did not come back as a conflict for the dialog.
 * - **While playing:** `uploadIfChanged` sends one gzipped copy at most every five minutes, only when the world moved
 *   on, with a plain `fetch` (the 64 KB cap on `keepalive` would refuse a town) carrying the `updatedAt` it last read
 *   or wrote. A 409 means another device saved in between: uploads stop for the session and the next time the menu
 *   opens it offers the choice.
 * - **Leaving:** `beaconOnHide` hands the last prepared copy to `sendBeacon` only when the body is at most
 *   {@link BEACON_MAX_BYTES}; a bigger town relies on the periodic upload and the local copy.
 *
 * A guest (no identity) gets no-ops: no request is made. An account copy that cannot be read is ignored, never loaded
 * and never written over.
 */

export const HEARTHWORKS_GAME_ID = 'hearthworks';

/** At most one upload this often while playing. */
export const UPLOAD_INTERVAL_MS = 5 * 60_000;
/** After a failed upload, the next attempt waits this long (not the whole interval). */
export const RETRY_MS = 60_000;
/** `sendBeacon` and `keepalive` cap a body at 64 KB; stay clear of it. */
export const BEACON_MAX_BYTES = 60_000;
/** The beacon's prepared copy is refreshed no more often than this. */
const PREPARE_MS = 60_000;

/** Where the town is saved, for the menu. */
export type AccountStatus =
  /** Signed out: the town stays on this device and no request is made. */
  | 'guest'
  /** Signed in; the account has not been read yet. */
  | 'checking'
  /** Signed in, local only: the menu offers "Save this town to your account". */
  | 'device'
  /** An upload is in flight. */
  | 'syncing'
  /** The account holds this town. */
  | 'account'
  | 'too-large'
  | 'unsupported'
  /** The account could not be reached, or an upload failed. */
  | 'offline'
  /** Another device saved a different copy; the choice opens with the menu. */
  | 'stale'
  /** The account holds a copy this build cannot read; it is left alone. */
  | 'unreadable';

/** What the transport hands back from a read: the stored blob and its time, or `null` when the read failed. */
export interface AccountRead {
  saveData: unknown;
  updatedAt: string | null;
}

export type AccountWrite = { ok: true; updatedAt: string } | { ok: false; stale: true };

/** The seam tests fake; `browserTransport` is the real one. */
export interface AccountTransport {
  read(): Promise<AccountRead | null>;
  /** Rejects for anything but a 409 (resolved `{ ok: false, stale: true }`). */
  write(payload: HearthworksPayload, expectedUpdatedAt: string | null): Promise<AccountWrite>;
  /** `false` when the browser would not take it. */
  beacon(body: string): boolean;
}

export function browserTransport(): AccountTransport {
  const params = { gameId: HEARTHWORKS_GAME_ID };
  const url = apiUrl(saveGameApi, { params });
  return {
    async read() {
      try {
        const json = (await readJsonWithDeadline(url)) as Partial<AccountRead> | null;
        if (!json) return null;
        return {
          saveData: json.saveData ?? null,
          updatedAt: typeof json.updatedAt === 'string' ? json.updatedAt : null,
        };
      } catch {
        return null;
      }
    },
    async write(payload, expectedUpdatedAt) {
      try {
        const res = await api(saveGameApi, {
          params,
          body: { saveData: payload as unknown as Record<string, unknown>, expectedUpdatedAt },
          timeoutMs: 60_000,
        });
        return { ok: true, updatedAt: new Date(res.updatedAt).toISOString() };
      } catch (error) {
        if (error instanceof HttpError && error.status === 409) return { ok: false, stale: true };
        throw error;
      }
    },
    beacon(body) {
      try {
        if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;
        return navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      } catch {
        return false;
      }
    },
  };
}

/** A town and what the choice dialog shows about it. */
export interface TownCopy {
  world: World;
  summary: HearthworksSummary;
}

/** The copy this device holds, with when it was written (`0` when unknown). */
export interface LocalTown {
  world: World;
  savedAt: number;
}

export type ResolveResult =
  | {
      kind: 'resolved';
      /** The town to play; `null` when neither side has one. */
      world: World | null;
    }
  | {
      kind: 'conflict';
      local: TownCopy;
      cloud: TownCopy;
    };

export type UploadResult =
  | {
      kind: 'skipped';
      reason:
        'signed-out' | 'shared' | 'disabled' | 'unknown' | 'stopped' | 'choosing' | 'throttled' | 'unchanged' | 'busy';
    }
  | { kind: 'saved'; updatedAt: string }
  | { kind: 'too-large' }
  | { kind: 'unsupported' }
  | { kind: 'stale' }
  | { kind: 'failed' };

/** A joined (shared) world is never uploaded: it carries other players. The stashed offline world is the member's. */
export interface WorldOptions {
  shared?: boolean;
}

export interface AccountSave {
  /** The signed-in member, or `null` for a guest. Resets everything learned about the account. */
  setIdentity(userId: string | null): void;
  status(): AccountStatus;
  subscribe(listener: (status: AccountStatus) => void): () => void;
  /** Whether another device saved since this one last read the account. */
  isStale(): boolean;
  resolveOnOpen(local: LocalTown | null): Promise<ResolveResult>;
  /** After a 409: read the account again and always offer the choice when it holds a town. */
  reconcileStale(local: LocalTown): Promise<ResolveResult>;
  /** Apply the player's choice from a conflict; resolves with the town to play. */
  keep(origin: 'local' | 'cloud', pair: { local: TownCopy; cloud: TownCopy }): Promise<World>;
  /** "Save this town to your account": turns syncing on and sends the town now. */
  enable(world: World, opts?: WorldOptions): Promise<UploadResult>;
  uploadIfChanged(world: World, opts?: WorldOptions): Promise<UploadResult>;
  /** Pack ahead of time, so `beaconOnHide` (which cannot wait for a stream) has a copy to send. */
  prepareBeacon(world: World, opts?: WorldOptions): Promise<void>;
  beaconOnHide(world: World, opts?: WorldOptions): boolean;
}

export interface AccountSaveOptions {
  transport?: AccountTransport;
  now?: () => number;
  /** Logged once per session when an account copy cannot be read. */
  log?: (message: string) => void;
}

export function createAccountSave(options: AccountSaveOptions = {}): AccountSave {
  const transport = options.transport ?? browserTransport();
  const now = options.now ?? (() => Date.now());
  const log = options.log ?? ((message: string) => console.warn(message));

  let identity: string | null = null;
  /** The seats this member owns: the offline player and their own account's. Everyone else is dropped before upload. */
  const ownSeats = () => (identity ? [LOCAL_PLAYER_ID, identity] : [LOCAL_PLAYER_ID]);
  let status: AccountStatus = 'guest';
  const listeners = new Set<(status: AccountStatus) => void>();

  /** Syncing is on: the account already holds a town, or the member chose to save this one. */
  let enabled = false;
  /** Whether `expected` is known: a read of the account succeeded (or a write of ours did). */
  let known = false;
  /** The account's `updatedAt` as this tab last read or wrote it (`null` = no row). */
  let expected: string | null = null;
  /** Another device saved in between (a 409): no uploads this session until the player chooses. */
  let stopped = false;
  let unreadable = false;
  /** Two towns were offered and the player has not picked: nothing is sent until they do. */
  let choosing = false;
  let loggedUnreadable = false;
  let lastUploadAt = 0;
  let lastUploadedTick = -1;
  let inFlight = false;
  let lastPrepareAt = 0;
  let prepared: { tick: number; payload: HearthworksPayload } | null = null;
  /** A beacon went out and its outcome is unknown: the account's `updatedAt` must be read again before writing. */
  let beaconed: { tick: number; before: string | null } | null = null;

  const set = (next: AccountStatus) => {
    if (status === next) return;
    status = next;
    for (const l of listeners) l(status);
  };

  const reset = () => {
    enabled = false;
    known = false;
    expected = null;
    stopped = false;
    unreadable = false;
    choosing = false;
    lastUploadAt = 0;
    lastUploadedTick = -1;
    inFlight = false;
    lastPrepareAt = 0;
    prepared = null;
    beaconed = null;
  };

  const copyOf = (world: World, savedAt: number): TownCopy => ({ world, summary: summaryOf(world, savedAt) });

  /** Read the account and make sense of it. `failed` is offline; `none` is no row (or no town in it). */
  type CloudRead =
    | { kind: 'failed' }
    | { kind: 'none'; updatedAt: string | null }
    | { kind: 'unreadable'; updatedAt: string | null }
    | { kind: 'town'; updatedAt: string | null; world: World; savedAt: number };

  const readCloud = async (): Promise<CloudRead> => {
    const res = await transport.read();
    if (!res) return { kind: 'failed' };
    if (res.saveData == null) return { kind: 'none', updatedAt: res.updatedAt };
    const world = await unpackWorld(res.saveData);
    if (!world) {
      if (!loggedUnreadable) {
        loggedUnreadable = true;
        log('[hearthworks] The copy of the town on the account could not be read; it was left alone.');
      }
      return { kind: 'unreadable', updatedAt: res.updatedAt };
    }
    const at = payloadSavedAt(res.saveData) || (res.updatedAt ? Date.parse(res.updatedAt) || 0 : 0);
    return { kind: 'town', updatedAt: res.updatedAt, world, savedAt: at };
  };

  /** Adopt a read: from here on `expected` is what the account holds. */
  const learn = (read: Exclude<CloudRead, { kind: 'failed' }>) => {
    known = true;
    expected = read.updatedAt;
  };

  const resolveWith = async (local: LocalTown | null, forceChoice: boolean): Promise<ResolveResult> => {
    if (!identity) {
      set('guest');
      return { kind: 'resolved', world: local?.world ?? null };
    }
    if (!compressionSupported()) {
      set('unsupported');
      return { kind: 'resolved', world: local?.world ?? null };
    }
    choosing = false;
    set('checking');
    const read = await readCloud();
    if (read.kind === 'failed') {
      set('offline');
      return { kind: 'resolved', world: local?.world ?? null };
    }
    learn(read);
    stopped = false;
    unreadable = read.kind === 'unreadable';
    if (read.kind === 'unreadable') {
      enabled = false;
      set('unreadable');
      return { kind: 'resolved', world: local?.world ?? null };
    }
    if (read.kind === 'none') {
      enabled = false;
      lastUploadedTick = -1;
      set('device');
      return { kind: 'resolved', world: local?.world ?? null };
    }

    enabled = true;
    const cloud = copyOf(read.world, read.savedAt);
    if (!local) {
      lastUploadedTick = read.world.tick;
      lastUploadAt = now();
      set('account');
      return { kind: 'resolved', world: read.world };
    }

    const choice = chooseSave<LocalTown>({
      local,
      cloud: { world: read.world, savedAt: read.savedAt },
      monotonic: (save) => monotonicOf(save.world),
      savedAt: (save) => save.savedAt,
    });
    const sameTown = local.world.tick === read.world.tick;
    if (choice.kind === 'conflict' || (forceChoice && !sameTown)) {
      choosing = true;
      set(forceChoice ? 'stale' : 'checking');
      return { kind: 'conflict', local: copyOf(local.world, local.savedAt), cloud };
    }

    // One side is simply further along. The account is up to date at the cloud's tick; a local copy that is ahead goes
    // up with the first change after the throttle (the open itself is not an upload).
    lastUploadedTick = read.world.tick;
    lastUploadAt = now();
    set('account');
    const origin = choice.kind === 'resolved' ? choice.origin : 'local';
    return { kind: 'resolved', world: origin === 'cloud' ? read.world : local.world };
  };

  /** After a beacon the stored `updatedAt` is unknown. Work out whether it landed, or whether someone else wrote. */
  const settleBeacon = async (): Promise<boolean> => {
    if (!beaconed) return true;
    const read = await transport.read();
    if (!read) return false;
    const sent = beaconed;
    if (read.updatedAt === sent.before) {
      // It did not land (or the account is as it was). Writing on is safe.
      beaconed = null;
      return true;
    }
    if (read.saveData != null && payloadTick(read.saveData) === sent.tick) {
      // Our own beacon landed.
      known = true;
      expected = read.updatedAt;
      lastUploadedTick = sent.tick;
      beaconed = null;
      return true;
    }
    stopped = true;
    beaconed = null;
    set('stale');
    return false;
  };

  const send = async (world: World): Promise<UploadResult> => {
    if (!compressionSupported()) {
      set('unsupported');
      return { kind: 'unsupported' };
    }
    inFlight = true;
    const wasStatus = status;
    set('syncing');
    try {
      const payload = await packWorld(world, now(), ownSeats());
      if (!payload) {
        set('unsupported');
        return { kind: 'unsupported' };
      }
      if (payloadBytes(payload) > HEARTHWORKS_CLOUD_BYTES) {
        lastUploadAt = now();
        set('too-large');
        return { kind: 'too-large' };
      }
      const res = await transport.write(payload, expected);
      if (!res.ok) {
        stopped = true;
        set('stale');
        return { kind: 'stale' };
      }
      expected = res.updatedAt;
      known = true;
      enabled = true;
      lastUploadedTick = world.tick;
      lastUploadAt = now();
      prepared = prepared && prepared.tick <= world.tick ? null : prepared;
      set('account');
      return { kind: 'saved', updatedAt: res.updatedAt };
    } catch {
      // A failed upload, a timeout or an offline page never touches the local copy; try again soon.
      lastUploadAt = now() - UPLOAD_INTERVAL_MS + RETRY_MS;
      // A first save that fails leaves the offer in place so the member can try again.
      set(wasStatus === 'device' ? 'device' : 'offline');
      return { kind: 'failed' };
    } finally {
      inFlight = false;
    }
  };

  const guard = (opts?: WorldOptions): Extract<UploadResult, { kind: 'skipped' }> | null => {
    if (!identity) return { kind: 'skipped', reason: 'signed-out' };
    if (opts?.shared) return { kind: 'skipped', reason: 'shared' };
    if (choosing) return { kind: 'skipped', reason: 'choosing' };
    if (unreadable || stopped) return { kind: 'skipped', reason: 'stopped' };
    if (!known) return { kind: 'skipped', reason: 'unknown' };
    return null;
  };

  return {
    setIdentity(userId) {
      if (userId === identity) return;
      identity = userId;
      reset();
      set(userId ? 'checking' : 'guest');
    },

    status: () => status,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    isStale: () => stopped && identity !== null,

    resolveOnOpen: (local) => resolveWith(local, false),

    reconcileStale: (local) => resolveWith(local, true),

    async keep(origin, pair) {
      choosing = false;
      stopped = false;
      enabled = true;
      beaconed = null;
      if (origin === 'cloud') {
        lastUploadedTick = pair.cloud.world.tick;
        lastUploadAt = now();
        set('account');
        return pair.cloud.world;
      }
      // Keep this device's town: the account's copy is replaced, by an upload that still carries the `updatedAt` it
      // was shown, so a third device cannot be overwritten either.
      lastUploadedTick = -1;
      const result = await send(pair.local.world);
      if (result.kind !== 'saved') lastUploadAt = 0;
      return pair.local.world;
    },

    async enable(world, opts) {
      const skip = guard(opts);
      if (skip) return skip;
      if (inFlight) return { kind: 'skipped', reason: 'busy' };
      enabled = true;
      return send(world);
    },

    async uploadIfChanged(world, opts) {
      const skip = guard(opts);
      if (skip) return skip;
      if (!enabled) return { kind: 'skipped', reason: 'disabled' };
      if (inFlight) return { kind: 'skipped', reason: 'busy' };
      if (world.tick === lastUploadedTick && !beaconed) return { kind: 'skipped', reason: 'unchanged' };
      if (now() - lastUploadAt < UPLOAD_INTERVAL_MS) return { kind: 'skipped', reason: 'throttled' };
      if (beaconed) {
        inFlight = true;
        const settled = await settleBeacon().finally(() => {
          inFlight = false;
        });
        if (!settled) return stopped ? { kind: 'stale' } : { kind: 'failed' };
        if (world.tick === lastUploadedTick) return { kind: 'skipped', reason: 'unchanged' };
      }
      return send(world);
    },

    async prepareBeacon(world, opts) {
      if (guard(opts) || !enabled || !compressionSupported()) return;
      if (world.tick === lastUploadedTick) return;
      if (prepared?.tick === world.tick) return;
      if (now() - lastPrepareAt < PREPARE_MS) return;
      lastPrepareAt = now();
      try {
        const payload = await packWorld(world, now(), ownSeats());
        if (payload) prepared = { tick: world.tick, payload };
      } catch {
        // Nothing to send on hide; the periodic upload and the local copy are unaffected.
      }
    },

    beaconOnHide(world, opts) {
      if (guard(opts) || !enabled || inFlight) return false;
      if (!prepared || prepared.tick === lastUploadedTick || world.tick === lastUploadedTick) return false;
      const body = JSON.stringify({ saveData: prepared.payload, expectedUpdatedAt: expected });
      if (body.length > BEACON_MAX_BYTES) return false;
      const sent = transport.beacon(body);
      if (sent) beaconed = { tick: prepared.tick, before: expected };
      return sent;
    },
  };
}
