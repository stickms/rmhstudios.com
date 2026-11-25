import { describe, expect, it, vi, type Mock } from 'vitest';
import { buildFirstTown, ticks, townWorld } from '../../world/__tests__/town';
import type { World } from '../../world';
import {
  BEACON_MAX_BYTES,
  RETRY_MS,
  UPLOAD_INTERVAL_MS,
  createAccountSave,
  type AccountRead,
  type AccountTransport,
  type AccountWrite,
} from '../account';
import { HEARTHWORKS_CLOUD_BYTES, packWorld, payloadBytes, payloadTick, type HearthworksPayload } from '../cloud';

const USER = 'user-1';
const T0 = Date.parse('2026-12-01T10:00:00.000Z');

/** A town that has grown, then `extra` more ticks of play. */
function town(extra = 0): World {
  const w = townWorld();
  buildFirstTown(w);
  ticks(w, 1500 + extra);
  return w;
}

/** This device built something the account copy has not seen. */
function withBuilding(world: World): World {
  world.buildings.push({
    id: world.nextId++,
    kind: 'cottage',
    x: 0,
    z: 0,
    rot: 0,
  } as unknown as World['buildings'][number]);
  return world;
}

/** The account copy's history: played on, but without that building. Neither copy contains the other. */
function diverged(base: World): World {
  const w = JSON.parse(JSON.stringify(base)) as World;
  ticks(w, 400);
  return w;
}

async function stored(world: World, updatedAt: string, savedAt = T0 - 1000): Promise<AccountRead> {
  return { saveData: await packWorld(world, savedAt), updatedAt };
}

interface Fake {
  transport: AccountTransport;
  reads: Mock<() => void>;
  writes: Array<{ payload: HearthworksPayload; expected: string | null }>;
  beacons: string[];
  /** What the account holds now. */
  account: { read: AccountRead | null };
  /** Make the next write do something other than succeed. */
  next: { write?: AccountWrite | 'throw' };
}

function fake(initial: AccountRead | null): Fake {
  const f: Fake = {
    reads: vi.fn<() => void>(),
    writes: [],
    beacons: [],
    account: { read: initial },
    next: {},
    transport: undefined as unknown as AccountTransport,
  };
  let clock = 0;
  f.transport = {
    async read() {
      f.reads();
      return f.account.read;
    },
    async write(payload, expected) {
      const mode = f.next.write;
      f.next.write = undefined;
      if (mode === 'throw') throw new Error('offline');
      if (mode && !mode.ok) return mode;
      f.writes.push({ payload, expected });
      const updatedAt = new Date(T0 + 10_000 + ++clock * 1000).toISOString();
      f.account.read = { saveData: payload, updatedAt };
      return { ok: true, updatedAt };
    },
    beacon(body) {
      f.beacons.push(body);
      return true;
    },
  };
  return f;
}

const NONE: AccountRead = { saveData: null, updatedAt: null };

function controller(f: Fake, clock: { t: number }) {
  const log = vi.fn();
  const account = createAccountSave({ transport: f.transport, now: () => clock.t, log });
  account.setIdentity(USER);
  return { account, log };
}

describe('Hearthworks account saves: opening', () => {
  it('a guest makes no request at all and keeps the local town', async () => {
    const f = fake(NONE);
    const clock = { t: T0 };
    const account = createAccountSave({ transport: f.transport, now: () => clock.t });
    const local = town();
    expect(account.status()).toBe('guest');
    expect(await account.resolveOnOpen({ world: local, savedAt: 5 })).toEqual({ kind: 'resolved', world: local });
    expect(await account.uploadIfChanged(local)).toEqual({ kind: 'skipped', reason: 'signed-out' });
    expect(await account.enable(local)).toEqual({ kind: 'skipped', reason: 'signed-out' });
    await account.prepareBeacon(local);
    expect(account.beaconOnHide(local)).toBe(false);
    expect(f.reads).not.toHaveBeenCalled();
    expect(f.writes).toHaveLength(0);
    expect(f.beacons).toHaveLength(0);
    expect(account.status()).toBe('guest');
  });

  it('signing out wipes what was learned about the account', async () => {
    const f = fake(await stored(town(), '2026-12-01T09:00:00.000Z'));
    const { account } = controller(f, { t: T0 });
    await account.resolveOnOpen(null);
    expect(account.status()).toBe('account');
    account.setIdentity(null);
    expect(account.status()).toBe('guest');
    expect(await account.uploadIfChanged(town(10))).toEqual({ kind: 'skipped', reason: 'signed-out' });
  });

  it('an account with no town leaves the local one alone and offers to save it', async () => {
    const f = fake(NONE);
    const { account } = controller(f, { t: T0 });
    const local = town();
    expect(await account.resolveOnOpen({ world: local, savedAt: 1 })).toEqual({ kind: 'resolved', world: local });
    expect(account.status()).toBe('device');
    // Not saved until the member asks: nothing is sent behind their back.
    expect(await account.uploadIfChanged(town(50))).toEqual({ kind: 'skipped', reason: 'disabled' });
    expect(f.writes).toHaveLength(0);
  });

  it('"Save this town to your account" sends it now, as the first row (expected null)', async () => {
    const f = fake(NONE);
    const { account } = controller(f, { t: T0 });
    const local = town();
    await account.resolveOnOpen({ world: local, savedAt: 1 });
    const result = await account.enable(local);
    expect(result.kind).toBe('saved');
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]?.expected).toBeNull();
    expect(payloadTick(f.writes[0]?.payload)).toBe(local.tick);
    expect(account.status()).toBe('account');
  });

  it('a failed first save leaves the offer in place', async () => {
    const f = fake(NONE);
    const { account } = controller(f, { t: T0 });
    const local = town();
    await account.resolveOnOpen({ world: local, savedAt: 1 });
    f.next.write = 'throw';
    expect((await account.enable(local)).kind).toBe('failed');
    expect(account.status()).toBe('device');
  });

  it('with only an account copy, plays it', async () => {
    const remote = town();
    const f = fake(await stored(remote, '2026-12-01T09:00:00.000Z'));
    const { account } = controller(f, { t: T0 });
    const result = await account.resolveOnOpen(null);
    expect(result).toEqual({ kind: 'resolved', world: remote });
    expect(account.status()).toBe('account');
  });

  it('plays the local town quietly when it is a continuation of the account copy', async () => {
    const remote = town();
    const f = fake(await stored(remote, '2026-12-01T09:00:00.000Z'));
    const { account } = controller(f, { t: T0 });
    const local = town(600);
    const result = await account.resolveOnOpen({ world: local, savedAt: T0 });
    expect(result).toEqual({ kind: 'resolved', world: local });
    expect(f.writes).toHaveLength(0);
  });

  it('plays the account copy quietly when it is further along than this device', async () => {
    const local = town();
    const remote = town(600);
    const f = fake(await stored(remote, '2026-12-01T09:00:00.000Z'));
    const { account } = controller(f, { t: T0 });
    const result = await account.resolveOnOpen({ world: local, savedAt: T0 });
    expect(result.kind).toBe('resolved');
    expect(result.kind === 'resolved' && result.world).toEqual(remote);
    expect(f.writes).toHaveLength(0);
  });

  it('two towns that each moved on are a conflict, and nothing is written or replaced', async () => {
    const base = town();
    const remote = diverged(base);
    const local = withBuilding(base);
    const f = fake(await stored(remote, '2026-12-01T09:00:00.000Z', T0 - 5000));
    const { account } = controller(f, { t: T0 });
    const result = await account.resolveOnOpen({ world: local, savedAt: T0 - 9000 });
    expect(result.kind).toBe('conflict');
    if (result.kind !== 'conflict') return;
    expect(result.local.world).toEqual(local);
    expect(result.cloud.world).toEqual(remote);
    expect(result.local.summary).toMatchObject({
      tick: local.tick,
      buildings: local.buildings.length,
      savedAt: T0 - 9000,
    });
    expect(result.cloud.summary).toMatchObject({
      tick: remote.tick,
      buildings: remote.buildings.length,
      savedAt: T0 - 5000,
    });
    expect(f.writes).toHaveLength(0);
    // Until the player picks, autosave has nothing to send.
    expect(await account.uploadIfChanged(local)).toEqual({ kind: 'skipped', reason: 'choosing' });
    expect(await account.enable(local)).toEqual({ kind: 'skipped', reason: 'choosing' });
    await account.prepareBeacon(local);
    expect(account.beaconOnHide(local)).toBe(false);
    expect(f.beacons).toHaveLength(0);
    expect(f.writes).toHaveLength(0);
  });

  it('keeping the account copy replaces nothing on the account', async () => {
    const base = town();
    const remote = diverged(base);
    const local = withBuilding(base);
    const f = fake(await stored(remote, '2026-12-01T09:00:00.000Z'));
    const { account } = controller(f, { t: T0 });
    const result = await account.resolveOnOpen({ world: local, savedAt: T0 });
    if (result.kind !== 'conflict') throw new Error('expected a conflict');
    expect(await account.keep('cloud', result)).toEqual(remote);
    expect(f.writes).toHaveLength(0);
    expect(account.status()).toBe('account');
  });

  it('keeping this device sends it carrying the updatedAt the player was shown', async () => {
    const base = town();
    const remote = diverged(base);
    const local = withBuilding(base);
    const f = fake(await stored(remote, '2026-12-01T09:00:00.000Z'));
    const { account } = controller(f, { t: T0 });
    const result = await account.resolveOnOpen({ world: local, savedAt: T0 });
    if (result.kind !== 'conflict') throw new Error('expected a conflict');
    expect(await account.keep('local', result)).toEqual(local);
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]?.expected).toBe('2026-12-01T09:00:00.000Z');
    expect(payloadTick(f.writes[0]?.payload)).toBe(local.tick);
  });

  it('an unreadable account copy is ignored: logged once, never loaded, never written over', async () => {
    const local = town();
    const f = fake({
      saveData: { v: 1, enc: 'gzip-b64', data: 'bm90IGd6aXA=' },
      updatedAt: '2026-12-01T09:00:00.000Z',
    });
    const { account, log } = controller(f, { t: T0 });
    expect(await account.resolveOnOpen({ world: local, savedAt: 1 })).toEqual({ kind: 'resolved', world: local });
    expect(await account.resolveOnOpen({ world: local, savedAt: 1 })).toEqual({ kind: 'resolved', world: local });
    expect(account.status()).toBe('unreadable');
    expect(log).toHaveBeenCalledTimes(1);
    expect(await account.enable(local)).toEqual({ kind: 'skipped', reason: 'stopped' });
    expect(await account.uploadIfChanged(town(900))).toEqual({ kind: 'skipped', reason: 'stopped' });
    expect(f.writes).toHaveLength(0);
  });

  it('an account that cannot be reached leaves the local town and sends nothing', async () => {
    const f = fake(null);
    const { account } = controller(f, { t: T0 });
    const local = town();
    expect(await account.resolveOnOpen({ world: local, savedAt: 1 })).toEqual({ kind: 'resolved', world: local });
    expect(account.status()).toBe('offline');
    // The account's updatedAt is not known, so a write could not carry the right one.
    expect(await account.uploadIfChanged(town(900))).toEqual({ kind: 'skipped', reason: 'unknown' });
    expect(f.writes).toHaveLength(0);
  });

  it('skips the account copy where the browser cannot gzip, and says so', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    try {
      const f = fake(NONE);
      const { account } = controller(f, { t: T0 });
      const local = town();
      expect(await account.resolveOnOpen({ world: local, savedAt: 1 })).toEqual({ kind: 'resolved', world: local });
      expect(account.status()).toBe('unsupported');
      expect(f.reads).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Hearthworks account saves: while playing', () => {
  async function synced() {
    const base = town();
    const f = fake(await stored(base, '2026-12-01T09:00:00.000Z'));
    const clock = { t: T0 };
    const { account } = controller(f, clock);
    await account.resolveOnOpen({ world: base, savedAt: T0 });
    return { f, clock, account, base };
  }

  it('uploads at most every five minutes, only when the town changed', async () => {
    const { f, clock, account, base } = await synced();
    // Opening counts as the last sync: nothing goes up inside the first five minutes.
    expect(await account.uploadIfChanged(town(100))).toEqual({ kind: 'skipped', reason: 'throttled' });
    clock.t += UPLOAD_INTERVAL_MS - 1;
    expect(await account.uploadIfChanged(town(100))).toEqual({ kind: 'skipped', reason: 'throttled' });
    // The tick has not moved since the account copy: nothing to send however long it has been.
    clock.t += 10 * UPLOAD_INTERVAL_MS;
    expect(await account.uploadIfChanged(base)).toEqual({ kind: 'skipped', reason: 'unchanged' });

    const moved = town(100);
    const result = await account.uploadIfChanged(moved);
    expect(result.kind).toBe('saved');
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]?.expected).toBe('2026-12-01T09:00:00.000Z');

    // Throttled again, and the next write carries the updatedAt the last one returned.
    expect(await account.uploadIfChanged(town(200))).toEqual({ kind: 'skipped', reason: 'throttled' });
    clock.t += UPLOAD_INTERVAL_MS;
    expect((await account.uploadIfChanged(town(200))).kind).toBe('saved');
    expect(f.writes).toHaveLength(2);
    expect(f.writes[1]?.expected).toBe(result.kind === 'saved' ? result.updatedAt : 'missing');
  });

  it('never uploads a shared world', async () => {
    const { f, clock, account } = await synced();
    clock.t += 2 * UPLOAD_INTERVAL_MS;
    expect(await account.uploadIfChanged(town(300), { shared: true })).toEqual({ kind: 'skipped', reason: 'shared' });
    expect(await account.enable(town(300), { shared: true })).toEqual({ kind: 'skipped', reason: 'shared' });
    await account.prepareBeacon(town(300), { shared: true });
    expect(account.beaconOnHide(town(300), { shared: true })).toBe(false);
    expect(f.writes).toHaveLength(0);
    expect(f.beacons).toHaveLength(0);
  });

  it('a failed upload leaves everything as it was and tries again sooner than five minutes', async () => {
    const { f, clock, account } = await synced();
    clock.t += UPLOAD_INTERVAL_MS;
    f.next.write = 'throw';
    expect(await account.uploadIfChanged(town(100))).toEqual({ kind: 'failed' });
    expect(account.status()).toBe('offline');
    clock.t += RETRY_MS - 1;
    expect(await account.uploadIfChanged(town(100))).toEqual({ kind: 'skipped', reason: 'throttled' });
    clock.t += 1;
    expect((await account.uploadIfChanged(town(100))).kind).toBe('saved');
    expect(account.status()).toBe('account');
  });

  it('a 409 stops uploads for the session and offers the choice instead of overwriting', async () => {
    const { f, clock, account, base } = await synced();
    clock.t += UPLOAD_INTERVAL_MS;
    f.next.write = { ok: false, stale: true };
    expect(await account.uploadIfChanged(town(100))).toEqual({ kind: 'stale' });
    expect(account.status()).toBe('stale');
    expect(account.isStale()).toBe(true);

    clock.t += 10 * UPLOAD_INTERVAL_MS;
    expect(await account.uploadIfChanged(town(900))).toEqual({ kind: 'skipped', reason: 'stopped' });
    expect(f.writes).toHaveLength(0);

    // Opening the menu again: the other device's copy is read and shown, even when it is further along, because
    // this tab played too and neither copy is replaced without the player's choice.
    const other = town(2000);
    f.account.read = await stored(other, '2026-12-01T09:30:00.000Z');
    const here = town(100);
    const result = await account.reconcileStale({ world: here, savedAt: clock.t });
    expect(result.kind).toBe('conflict');
    if (result.kind !== 'conflict') return;
    expect(result.cloud.world).toEqual(other);
    expect(f.writes).toHaveLength(0);
    expect(base).toBeDefined();

    // Keeping this tab's town sends it against the updatedAt that was shown.
    await account.keep('local', result);
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]?.expected).toBe('2026-12-01T09:30:00.000Z');
    expect(account.isStale()).toBe(false);
  });

  it('a second 409 while keeping this device stops again instead of looping', async () => {
    const { f, clock, account } = await synced();
    clock.t += UPLOAD_INTERVAL_MS;
    f.next.write = { ok: false, stale: true };
    await account.uploadIfChanged(town(100));
    f.account.read = await stored(town(2000), '2026-12-01T09:30:00.000Z');
    const result = await account.reconcileStale({ world: town(100), savedAt: clock.t });
    if (result.kind !== 'conflict') throw new Error('expected a conflict');
    f.next.write = { ok: false, stale: true };
    await account.keep('local', result);
    expect(account.isStale()).toBe(true);
    expect(f.writes).toHaveLength(0);
  });

  it('refuses a town too large for the shared table, without sending it', async () => {
    const { f, clock, account } = await synced();
    clock.t += UPLOAD_INTERVAL_MS;
    const big = town(100);
    // Incompressible entries: a gzipped, base64 town past the shared save cap.
    let seed = 7;
    const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0);
    for (let i = 0; i < 120_000; i++) big.foraged[`t${next().toString(36)}`] = next();
    const payload = await packWorld(big);
    expect(payloadBytes(payload!)).toBeGreaterThan(HEARTHWORKS_CLOUD_BYTES);
    expect(await account.uploadIfChanged(big)).toEqual({ kind: 'too-large' });
    expect(account.status()).toBe('too-large');
    expect(f.writes).toHaveLength(0);
  });
});

describe('Hearthworks account saves: leaving the page', () => {
  async function synced() {
    const base = town();
    const f = fake(await stored(base, '2026-12-01T09:00:00.000Z'));
    const clock = { t: T0 };
    const { account } = controller(f, clock);
    await account.resolveOnOpen({ world: base, savedAt: T0 });
    return { f, clock, account, base };
  }

  it('beacons a prepared copy, carrying expectedUpdatedAt, when it fits', async () => {
    const { f, account } = await synced();
    const moved = town(100);
    expect(account.beaconOnHide(moved)).toBe(false); // nothing prepared yet
    await account.prepareBeacon(moved);
    expect(account.beaconOnHide(moved)).toBe(true);
    expect(f.beacons).toHaveLength(1);
    const body = JSON.parse(f.beacons[0]!) as { saveData: HearthworksPayload; expectedUpdatedAt: string | null };
    expect(body.expectedUpdatedAt).toBe('2026-12-01T09:00:00.000Z');
    expect(payloadTick(body.saveData)).toBe(moved.tick);
    expect(f.beacons[0]!.length).toBeLessThanOrEqual(BEACON_MAX_BYTES);
  });

  it('sends nothing on hide when the town has not changed since the account copy', async () => {
    const { f, account, base } = await synced();
    await account.prepareBeacon(base);
    expect(account.beaconOnHide(base)).toBe(false);
    expect(f.beacons).toHaveLength(0);
  });

  it('sends no beacon above 60,000 bytes: the periodic upload and the local copy carry it', async () => {
    const { f, account } = await synced();
    const big = town(100);
    let seed = 11;
    const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0);
    for (let i = 0; i < 9_000; i++) big.foraged[`t${next().toString(36)}`] = next();
    const payload = await packWorld(big);
    expect(payloadBytes(payload!)).toBeGreaterThan(BEACON_MAX_BYTES);
    expect(payloadBytes(payload!)).toBeLessThan(HEARTHWORKS_CLOUD_BYTES);
    await account.prepareBeacon(big);
    expect(account.beaconOnHide(big)).toBe(false);
    expect(f.beacons).toHaveLength(0);
  });

  it('after a beacon, the next write first checks whether it landed, so it is not refused by its own beacon', async () => {
    const { f, clock, account } = await synced();
    const moved = town(100);
    await account.prepareBeacon(moved);
    expect(account.beaconOnHide(moved)).toBe(true);
    // The beacon landed: the server's row now holds that tick under a new updatedAt.
    f.account.read = { saveData: await packWorld(moved), updatedAt: '2026-12-01T10:01:00.000Z' };
    clock.t += UPLOAD_INTERVAL_MS;
    const later = town(300);
    expect((await account.uploadIfChanged(later)).kind).toBe('saved');
    expect(f.writes[0]?.expected).toBe('2026-12-01T10:01:00.000Z');
  });

  it('after a beacon, a copy another device wrote in the meantime stops the writes', async () => {
    const { f, clock, account } = await synced();
    const moved = town(100);
    await account.prepareBeacon(moved);
    account.beaconOnHide(moved);
    // The account changed, but not to what this tab sent.
    f.account.read = await stored(town(5000), '2026-12-01T10:01:00.000Z');
    clock.t += UPLOAD_INTERVAL_MS;
    expect((await account.uploadIfChanged(town(300))).kind).toBe('stale');
    expect(account.isStale()).toBe(true);
    expect(f.writes).toHaveLength(0);
  });
});
