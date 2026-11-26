/**
 * The House Always Wins run on the shared save table. Every case here is a way a member loses a run: a corrupt key
 * that gets uploaded (or written over), a first sign-in that does not upload what the device already holds, a stale
 * tab that overwrites a newer account copy, a guest run that is offered to the wrong account, or a payload the route
 * would refuse being sent anyway.
 *
 * The server side is a small fake of the route's compare-and-set (`game-saves.$gameId.server.ts`), behind a stubbed
 * `fetch`, so the real transport runs.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const storage = new Map<string, string>();
  const fake = {
    getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null),
    setItem: (k: string, v: string) => void storage.set(k, String(v)),
    removeItem: (k: string) => void storage.delete(k),
    clear: () => storage.clear(),
  };
  (globalThis as unknown as { localStorage: typeof fake }).localStorage = fake;
  // zustand's persist reads `window.localStorage`; this stands in for the browser.
  (globalThis as unknown as { window: unknown }).window = globalThis;
  return { storage };
});

import { MAX_SAVE_BYTES } from '@/lib/game-saves/registry';
import { casJsonTransport } from '@/lib/game-saves/cas-transport';
import { readMeta, slotStorageName } from '../ngplus';
import {
  reresolveHawIfStale,
  subscribeHawReresolve,
  HAW_MAIN_KEY,
  HAW_META_KEY,
  HAW_NGPLUS_KEY,
  HAW_STAMP_KEY,
  createHouseAlwaysWinsSave,
  getHawSyncStatus,
  hawFigures,
  hawMonotonic,
  parseEnvelope,
  parseHawSave,
  startHawSync,
  type HawEnvelope,
  type HawSave,
} from '../cloud';
import { useHouseAlwaysWinsStore } from '@/lib/store/houseAlwaysWinsStore';

/* ── Fixtures ── */

function envelope(over: Partial<HawEnvelope['state']> = {}): HawEnvelope {
  return {
    version: 2,
    state: {
      debt: 0,
      chips: 0,
      keys: 0,
      abilities: { doubleJump: false, dash: false, wallGrip: false },
      flags: {},
      introSeen: true,
      checkpointRoom: 'lobby',
      checkpointId: 'spawn',
      deaths: 0,
      visitedRooms: { lobby: true },
      ...over,
    },
  };
}

const run = (over: Partial<HawSave> = {}): HawSave => ({
  main: envelope(),
  ngplus: null,
  meta: null,
  savedAt: 0,
  resets: 0,
  ...over,
});

const further = (): HawSave =>
  run({
    main: envelope({
      keys: 1,
      chips: 40,
      abilities: { doubleJump: true, dash: false, wallGrip: false },
      visitedRooms: { lobby: true, pokerHall: true },
      checkpointRoom: 'pokerHall',
    }),
  });

const putLocal = (save: HawSave, stamp?: { owner: string | null; at: number }) => {
  if (save.main) h.storage.set(HAW_MAIN_KEY, JSON.stringify(save.main));
  if (save.ngplus) h.storage.set(HAW_NGPLUS_KEY, JSON.stringify(save.ngplus));
  if (save.meta) h.storage.set(HAW_META_KEY, JSON.stringify(save.meta));
  if (stamp) h.storage.set(HAW_STAMP_KEY, JSON.stringify(stamp));
};

/* ── The route, as far as a save is concerned ── */

interface Row {
  saveData: unknown;
  updatedAt: string;
}
const server = {
  row: null as Row | null,
  clock: 0,
  posts: [] as Array<{ saveData: unknown; expectedUpdatedAt: unknown }>,
  gets: 0,
  stamp() {
    this.clock += 60_000;
    return new Date(Date.UTC(2027, 0, 5, 10, 0, 0) + this.clock).toISOString();
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeFetch(_url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? 'GET';
  if (method === 'GET') {
    server.gets++;
    return Promise.resolve(json({ saveData: server.row?.saveData ?? null, updatedAt: server.row?.updatedAt ?? null }));
  }
  if (method === 'DELETE') {
    server.row = null;
    return Promise.resolve(json({ success: true }));
  }
  const body = JSON.parse(init!.body as string) as { saveData: unknown; expectedUpdatedAt?: string | null };
  server.posts.push({ saveData: body.saveData, expectedUpdatedAt: body.expectedUpdatedAt });
  const expected = body.expectedUpdatedAt;
  const current = server.row?.updatedAt ?? null;
  if (expected !== undefined && expected !== current) {
    return Promise.resolve(json({ error: 'Save changed elsewhere', updatedAt: current }, 409));
  }
  server.row = { saveData: body.saveData, updatedAt: server.stamp() };
  return Promise.resolve(json({ success: true, updatedAt: server.row.updatedAt }));
}

function makeSave(userId: string | null = 'me') {
  const reload = vi.fn();
  const log = vi.fn();
  const save = createHouseAlwaysWinsSave({
    transport: casJsonTransport('house-always-wins'),
    reload,
    log,
    now: () => 1_800_000_000_000,
  });
  save.setIdentity(userId);
  return { save, reload, log };
}

beforeEach(() => {
  h.storage.clear();
  server.row = null;
  server.clock = 0;
  server.posts = [];
  server.gets = 0;
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/* ── Parsing ── */

describe('parse', () => {
  it('accepts both slots and the New Game+ record', () => {
    const meta = { cleared: true, slot: 'ngplus', seed: 7, rule: 'highStakes', cycles: 2 };
    const parsed = parseHawSave({ main: envelope(), ngplus: envelope({ keys: 2 }), meta, savedAt: 5 });
    expect(parsed?.main?.state.introSeen).toBe(true);
    expect(parsed?.ngplus?.state.keys).toBe(2);
    expect(parsed?.meta).toEqual(meta);
    expect(parsed?.savedAt).toBe(5);
    // The classic slot alone is a whole run.
    expect(parseHawSave({ main: envelope() })).toMatchObject({ ngplus: null, meta: null });
  });

  it('rejects a corrupt envelope in either slot, and a save with no run in it', () => {
    expect(parseEnvelope({ state: { debt: 'lots' }, version: 2 })).toBeNull();
    expect(parseEnvelope({ ...envelope(), version: 1 })).toBeNull();
    expect(parseEnvelope({ state: null, version: 2 })).toBeNull();
    expect(parseHawSave({ main: { nonsense: true } })).toBeNull();
    expect(parseHawSave({ main: envelope(), ngplus: { state: {}, version: 2 } })).toBeNull();
    expect(parseHawSave({ main: envelope(), meta: { slot: 'sideways' } })).toBeNull();
    expect(parseHawSave({ main: null, ngplus: null })).toBeNull();
    expect(parseHawSave('x')).toBeNull();
    expect(parseHawSave([])).toBeNull();
  });
});

describe('monotonic counters', () => {
  it('count rooms, keys, abilities, New Game+ cycles and resets over both slots', () => {
    const save = run({
      main: further().main,
      ngplus: envelope({ keys: 3, visitedRooms: { lobby: true, vault: true, slotVault: false } }),
      meta: { cleared: true, slot: 'ngplus', seed: 1, rule: 'fastLasers', cycles: 2 },
    });
    expect(hawMonotonic(save)).toEqual({ rooms: 4, keys: 4, abilities: 1, cycles: 2, resets: 0 });
  });

  it('a run with more of everything dominates, one with more of one thing each does not', () => {
    expect(hawMonotonic(further()).keys).toBeGreaterThan(hawMonotonic(run()).keys);
    const roomsOnly = run({ main: envelope({ visitedRooms: { lobby: true, vault: true, slotVault: true } }) });
    const keysOnly = run({ main: envelope({ keys: 2 }) });
    expect(hawMonotonic(roomsOnly).rooms).toBeGreaterThan(hawMonotonic(keysOnly).rooms);
    expect(hawMonotonic(keysOnly).keys).toBeGreaterThan(hawMonotonic(roomsOnly).keys);
  });

  it('figures describe the slot being played', () => {
    const save = run({
      ngplus: envelope({ chips: 9, visitedRooms: { lobby: true, vault: true } }),
      meta: { cleared: true, slot: 'ngplus', seed: 1, rule: 'fastLasers', cycles: 1 },
    });
    expect(hawFigures(save)).toMatchObject({ slot: 'ngplus', chips: 9, rooms: 2, cycles: 1 });
    expect(hawFigures(run())).toMatchObject({ slot: 'main', rooms: 1 });
  });
});

/* ── The local copy ── */

describe('the local copy', () => {
  it('is composed from the three keys', () => {
    const meta = { cleared: true, slot: 'ngplus' as const, seed: 3, rule: 'highStakes' as const, cycles: 1 };
    putLocal(run({ ngplus: envelope({ keys: 1 }), meta }));
    const { save } = makeSave();
    const local = save.readLocal();
    expect(local?.main?.state.introSeen).toBe(true);
    expect(local?.ngplus?.state.keys).toBe(1);
    expect(local?.meta).toEqual(meta);
    // The key the composer reads for the record is the one ngplus.ts reads.
    expect(readMeta()).toMatchObject({ slot: 'ngplus', cycles: 1, rule: 'highStakes' });
    // The slot keys are the ones the store persists under.
    expect(HAW_MAIN_KEY).toBe(slotStorageName('main'));
    expect(HAW_NGPLUS_KEY).toBe(slotStorageName('ngplus'));
    expect(HAW_STAMP_KEY).toBe(`${HAW_MAIN_KEY}::meta`);
  });

  it('a corrupt key reads as no run, is never uploaded and is never overwritten by a failed parse', async () => {
    putLocal(run());
    h.storage.set(HAW_NGPLUS_KEY, '{"state": broken');
    const { save } = makeSave();
    expect(save.readLocal()).toBeNull();
    expect(save.composeForUpload()).toBeNull();
    await save.syncNow();
    expect(server.posts).toHaveLength(0);

    // Resolving with nothing on the account leaves the keys exactly as they were.
    await save.resolve();
    expect(h.storage.get(HAW_NGPLUS_KEY)).toBe('{"state": broken');
    expect(h.storage.get(HAW_MAIN_KEY)).toBe(JSON.stringify(envelope()));
  });

  it('an invalid (not merely unparsable) classic envelope is also never uploaded', async () => {
    h.storage.set(HAW_MAIN_KEY, JSON.stringify({ state: { debt: -1 }, version: 2 }));
    const { save } = makeSave();
    await save.syncNow();
    expect(server.posts).toHaveLength(0);
  });

  it('writes sections back whole, removing the ones the chosen copy lacks, and stamps the owner', () => {
    putLocal(run({ ngplus: envelope({ keys: 1 }) }));
    const { save } = makeSave('me');
    save.writeLocal(run({ main: envelope({ keys: 2 }) }), 123);
    expect(JSON.parse(h.storage.get(HAW_MAIN_KEY)!).state.keys).toBe(2);
    expect(h.storage.has(HAW_NGPLUS_KEY)).toBe(false);
    expect(JSON.parse(h.storage.get(HAW_STAMP_KEY)!)).toEqual({ owner: 'me', at: 123, resets: 0 });
  });
});

/* ── Guests and owners ── */

describe('guests and owners', () => {
  it('a guest makes no request at all', async () => {
    putLocal(run());
    const { save } = makeSave(null);
    expect(await save.resolve()).toMatchObject({ kind: 'resolved', origin: 'local' });
    await save.syncNow();
    await save.writeCloud(run());
    expect(save.writeBeacon(run())).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(getHawSyncStatus()).toBe('guest');
  });

  it('a run made as a guest is claimable by the first account', async () => {
    putLocal(run(), { owner: null, at: 1 });
    const { save } = makeSave('me');
    const choice = await save.resolve();
    expect(choice).toMatchObject({ kind: 'resolved', origin: 'local' });
    await save.writeCloud((choice as { save: HawSave }).save);
    expect(server.posts).toHaveLength(1);
  });

  it("another member's local run is not offered or uploaded", async () => {
    putLocal(further(), { owner: 'someone-else', at: 1 });
    const { save, reload } = makeSave('me');
    expect(save.readLocal()).toBeNull();
    expect(await save.resolve()).toEqual({ kind: 'none' });
    await save.syncNow();
    expect(server.posts).toHaveLength(0);
    // The foreign keys are cleared so they do not carry on into this account, and the store starts empty.
    expect(h.storage.has(HAW_MAIN_KEY)).toBe(false);
    expect(reload).toHaveBeenCalled();
  });
});

/* ── First sign-in ── */

describe('a local run and an empty account', () => {
  it('is uploaded with expectedUpdatedAt null, so a first sign-in loses nothing', async () => {
    putLocal(further());
    const { save } = makeSave('me');
    const choice = await save.resolve();
    expect(choice).toMatchObject({ kind: 'resolved', origin: 'local' });
    expect(server.posts).toHaveLength(0);
    expect(getHawSyncStatus()).toBe('pending');

    await save.writeCloud((choice as { save: HawSave }).save);
    expect(server.posts).toHaveLength(1);
    expect(server.posts[0]!.expectedUpdatedAt).toBeNull();
    expect(parseHawSave(server.posts[0]!.saveData)?.main?.state.keys).toBe(1);
    expect(getHawSyncStatus()).toBe('account');
  });

  it('is not uploaded again when the account already holds exactly it', async () => {
    putLocal(run());
    server.row = { saveData: run({ savedAt: 9 }), updatedAt: server.stamp() };
    const { save } = makeSave('me');
    const choice = await save.resolve();
    expect(choice).toMatchObject({ kind: 'resolved', origin: 'cloud' });
    expect(getHawSyncStatus()).toBe('account');
    await save.writeCloud(run());
    expect(server.posts).toHaveLength(0);
  });
});

/* ── The account is further along ── */

describe('an account copy that is further along', () => {
  it('replaces this device and reloads the store', async () => {
    putLocal(run());
    server.row = { saveData: further(), updatedAt: server.stamp() };
    const { save, reload } = makeSave('me');
    const choice = await save.resolve();
    expect(choice).toMatchObject({ kind: 'resolved', origin: 'cloud' });
    expect(JSON.parse(h.storage.get(HAW_MAIN_KEY)!).state.keys).toBe(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('is ignored, logged once and never written over when it cannot be read', async () => {
    putLocal(run());
    server.row = { saveData: { main: { rubbish: true } }, updatedAt: server.stamp() };
    const { save, log } = makeSave('me');
    expect(await save.resolve()).toMatchObject({ kind: 'resolved', origin: 'local' });
    await save.resolve();
    expect(log).toHaveBeenCalledTimes(1);
    // Local is untouched, and nothing is sent over the copy this build cannot read.
    expect(JSON.parse(h.storage.get(HAW_MAIN_KEY)!)).toEqual(envelope());
    await save.writeCloud(run());
    expect(save.writeBeacon(run())).toBe(false);
    expect(server.posts).toHaveLength(0);
  });

  it('is not applied at all when it is unreadable and the device has no run: nothing is written', async () => {
    server.row = { saveData: { main: { rubbish: true } }, updatedAt: server.stamp() };
    const { save } = makeSave('me');
    expect(await save.resolve()).toEqual({ kind: 'none' });
    expect(h.storage.size).toBe(0);
  });
});

/* ── Both moved on ── */

describe('both copies moved on', () => {
  const roomsOnly = () => run({ main: envelope({ visitedRooms: { lobby: true, vault: true, slotVault: true } }) });
  const keysOnly = () => run({ main: envelope({ keys: 2 }) });

  it('asks, and applies the answer to both sides', async () => {
    putLocal(roomsOnly());
    server.row = { saveData: keysOnly(), updatedAt: server.stamp() };
    const { save, reload } = makeSave('me');
    const choice = await save.resolve();
    expect(choice.kind).toBe('conflict');
    // Nothing is overwritten before the answer.
    expect(JSON.parse(h.storage.get(HAW_MAIN_KEY)!).state.keys).toBe(0);
    expect(server.posts).toHaveLength(0);

    const cloud = (choice as { cloud: HawSave }).cloud;
    const rowBefore = server.row!.updatedAt;
    await save.commit(cloud);
    expect(JSON.parse(h.storage.get(HAW_MAIN_KEY)!).state.keys).toBe(2);
    expect(reload).toHaveBeenCalled();
    expect(server.posts).toHaveLength(1);
    expect(server.posts[0]!.expectedUpdatedAt).toBe(rowBefore);
  });

  it('a 409 stops uploads for the session and the next resolve asks', async () => {
    putLocal(run());
    server.row = { saveData: run(), updatedAt: server.stamp() };
    const { save } = makeSave('me');
    await save.resolve();

    // Another device saves in between.
    server.row = { saveData: keysOnly(), updatedAt: server.stamp() };
    await expect(save.writeCloud(roomsOnly())).rejects.toMatchObject({ reason: 'stale' });
    expect(save.isStale()).toBe(true);
    const sent = server.posts.length;

    // Further saves this session are not even attempted.
    await expect(save.writeCloud(further())).rejects.toBeDefined();
    expect(server.posts.length).toBe(sent);

    // This device moved on too: the next menu visit asks rather than applying either.
    putLocal(roomsOnly());
    expect((await save.resolve()).kind).toBe('conflict');
    expect(save.isStale()).toBe(false);
  });

  it('two saves in quick succession do not refuse each other', async () => {
    putLocal(run());
    server.row = { saveData: run(), updatedAt: server.stamp() };
    const { save } = makeSave('me');
    await save.resolve();
    const a = save.writeCloud(further());
    const b = save.writeCloud(run({ main: envelope({ keys: 2, visitedRooms: { lobby: true, vault: true } }) }));
    await Promise.all([a, b]);
    expect(server.posts).toHaveLength(2);
    expect(save.isStale()).toBe(false);
    expect(getHawSyncStatus()).toBe('account');
  });
});

/* ── Size ── */

describe('size', () => {
  it('a payload over the row cap is not sent', async () => {
    putLocal(run());
    const { save } = makeSave('me');
    await save.resolve();
    const huge = run({
      main: envelope({ flags: Object.fromEntries(Array.from({ length: 40_000 }, (_, i) => [`flag-${i}`, true])) }),
    });
    expect(JSON.stringify(huge).length).toBeGreaterThan(MAX_SAVE_BYTES);
    await save.writeCloud(huge);
    expect(save.writeBeacon(huge)).toBe(false);
    expect(server.posts).toHaveLength(0);
    expect(getHawSyncStatus()).toBe('pending');
  });
});

/* ── The beacon ── */

describe('the beacon', () => {
  it('carries expectedUpdatedAt, and sends nothing for a run the account already holds', async () => {
    const sendBeacon = vi.fn((_url: string, _blob: Blob) => true);
    vi.stubGlobal('navigator', { sendBeacon });
    putLocal(run());
    server.row = { saveData: run(), updatedAt: server.stamp() };
    const { save } = makeSave('me');
    await save.resolve();
    const knownAt = server.row.updatedAt;

    expect(save.writeBeacon(run({ main: envelope({ keys: 1 }) }))).toBe(true);
    const blob = sendBeacon.mock.calls[0]![1];
    expect(JSON.parse(await blob.text()).expectedUpdatedAt).toBe(knownAt);
  });
});

/* ── While playing ── */

describe('playing', () => {
  it('a save point uploads, a room change at most every two minutes, and a reset at once', async () => {
    putLocal(run());
    server.row = { saveData: run(), updatedAt: server.stamp() };
    const { save } = makeSave('me');
    await save.resolve();
    let clock = 1_000_000;
    const stop = startHawSync(save, () => clock);
    const store = useHouseAlwaysWinsStore.getState();
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    store.setCheckpoint('pokerHall', 'save-1');
    await settle();
    expect(server.posts).toHaveLength(1);
    expect(server.posts[0]!.expectedUpdatedAt).not.toBeNull();
    expect(parseHawSave(server.posts[0]!.saveData)?.main?.state.checkpointRoom).toBe('pokerHall');
    expect(getHawSyncStatus()).toBe('account');

    store.markVisited('vault'); // first room change since the save point: inside the interval
    await settle();
    expect(server.posts).toHaveLength(1);
    clock += 2 * 60_000;
    store.markVisited('slotVault');
    await settle();
    expect(server.posts).toHaveLength(2);

    store.resetRun();
    await settle();
    expect(server.posts).toHaveLength(3);
    expect(parseHawSave(server.posts[2]!.saveData)?.main?.state.introSeen).toBe(false);
    stop();

    // Stopped: nothing more is sent.
    store.setCheckpoint('lobby', 'spawn');
    await settle();
    expect(server.posts).toHaveLength(3);
  });

  it('signed out, none of it makes a request', async () => {
    const { save } = makeSave(null);
    const stop = startHawSync(save, () => 0);
    useHouseAlwaysWinsStore.getState().setCheckpoint('lobby', 'spawn');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).not.toHaveBeenCalled();
    stop();
  });
});

/* ── Review fixes ── */

describe('starting over', () => {
  it('an older, further run on another device does not silently undo a reset: the player is asked', async () => {
    // Device A held the further run on the account; then "New run" here.
    server.row = { saveData: further(), updatedAt: server.stamp() };
    putLocal(further());
    const { save } = makeSave('me');
    await save.resolve();
    const stop = startHawSync(save, () => 0);
    useHouseAlwaysWinsStore.getState().resetRun();
    await new Promise((resolve) => setTimeout(resolve, 0));
    stop();
    const emptied = parseHawSave(server.row!.saveData)!;
    expect(emptied.resets).toBe(1);
    expect(emptied.main?.state.keys).toBe(0);

    // Device B still holds the further run, never reset.
    h.storage.clear();
    putLocal(further(), { owner: 'me', at: 1 });
    const other = makeSave('me').save;
    const choice = await other.resolve();
    expect(choice.kind).toBe('conflict');
    expect(server.posts).toHaveLength(1);

    // Keeping the further run carries the reset count, so the first device is not asked the same question again.
    await other.commit((choice as { local: HawSave }).local);
    expect(parseHawSave(server.row!.saveData)?.resets).toBe(1);
    expect(parseHawSave(server.row!.saveData)?.main?.state.keys).toBe(1);
  });

  it("a reset while signed out leaves a run claimable by the next account, never cleared as someone else's", async () => {
    // Somebody signed in played here, then signed out; a guest starts a new run on the same browser.
    putLocal(further(), { owner: 'someone-else', at: 1 });
    const guest = makeSave(null).save;
    await guest.resolve();
    const stop = startHawSync(guest, () => 0);
    useHouseAlwaysWinsStore.getState().resetRun();
    useHouseAlwaysWinsStore.getState().setCheckpoint('lobby', 'save-1');
    stop();
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.parse(h.storage.get(HAW_STAMP_KEY)!).owner).toBeNull();

    // The guest signs up: the run is offered for upload, not cleared.
    const { save, reload } = makeSave('new-member');
    const choice = await save.resolve();
    expect(choice).toMatchObject({ kind: 'resolved', origin: 'local' });
    expect(h.storage.has(HAW_MAIN_KEY)).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('adopting a copy', () => {
  it("removes a New Game+ record the chosen copy does not have, so another member's slot choice never carries over", async () => {
    putLocal(
      run({ meta: { cleared: true, slot: 'ngplus' as const, seed: 7, rule: 'highStakes' as const, cycles: 1 } }),
      {
        owner: 'someone-else',
        at: 1,
      },
    );
    server.row = { saveData: further(), updatedAt: server.stamp() };
    const { save } = makeSave('me');
    expect(await save.resolve()).toMatchObject({ kind: 'resolved', origin: 'cloud' });
    expect(h.storage.has(HAW_META_KEY)).toBe(false);
    expect(JSON.parse(h.storage.get(HAW_MAIN_KEY)!).state.keys).toBe(1);
  });
});

describe('asking again after a refusal', () => {
  it('the menu asks the gate to read both copies once per refusal', async () => {
    putLocal(run());
    server.row = { saveData: run(), updatedAt: server.stamp() };
    const { save } = makeSave('me');
    await save.resolve();
    const listener = vi.fn();
    const unsubscribe = subscribeHawReresolve(listener);

    expect(reresolveHawIfStale(save)).toBe(false);
    server.row = { saveData: further(), updatedAt: server.stamp() };
    await expect(save.writeCloud(run({ main: envelope({ keys: 2 }) }))).rejects.toMatchObject({ reason: 'stale' });
    expect(reresolveHawIfStale(save)).toBe(true);
    expect(reresolveHawIfStale(save)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    await save.resolve();
    expect(save.isStale()).toBe(false);
    unsubscribe();
  });

  it('a page that comes back after its pagehide beacon is told to read again', async () => {
    vi.stubGlobal('navigator', { sendBeacon: vi.fn(() => true) });
    putLocal(run());
    server.row = { saveData: run(), updatedAt: server.stamp() };
    const { save } = makeSave('me');
    await save.resolve();
    expect(save.writeBeacon(further())).toBe(true);
    expect(save.isStale()).toBe(true);
    expect(save.claimReresolve()).toBe(true);
  });
});
