/**
 * Saving, and the paths a tab can die on.
 *
 * Every assertion here corresponds to a way a real player loses progress:
 * a payload whose timestamp disagrees with the store's, a beacon that silently
 * did nothing, a save written before the load finished, or a tab left open in
 * the background all afternoon and credited with one minute.
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInitialState, useTempleStore } from '../store';
import {
  MIN_SERVER_GAP_MS,
  readSave,
  saveBeacon,
  saveLocal,
  stateToSave,
  saveToServer,
  setSaveIdentity,
  summarizeTempleSave,
  templeSave,
} from '../persistence';
import { untranslated } from '@/lib/game-saves/conflict';
import { applyTick, applyVigil } from '../tick';
import type { GameState } from '../types';

const AT = 1_700_000_000_000;

function playing(): GameState {
  const base = createInitialState();
  return {
    ...base,
    initialized: true,
    joy: 12_345,
    lifetimeJoy: 99_999,
    sources: { ...base.sources, devotee: 30 },
    trophies: new Set(['joy_0', 'joy_1']),
    blessings: new Set(['devotee_t1']),
  };
}

/**
 * A `localStorage` for a Node suite.
 *
 * The save is identity-aware now, and the rule that makes it so — a local copy
 * is stamped with whose it is — cannot be tested without somewhere to stamp it.
 */
function stubStorage(): Storage {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  } satisfies Storage;
  vi.stubGlobal('localStorage', storage);
  return storage;
}

beforeEach(() => {
  useTempleStore.setState(createInitialState());
  // Signed in unless a test says otherwise: every server-write assertion below
  // is about a player who has an account to write to.
  setSaveIdentity('player-1');
});

afterEach(() => {
  setSaveIdentity(null);
  vi.unstubAllGlobals();
});

/* ══════════════════════════════════════════════════════════════════════════
   The payload
   ══════════════════════════════════════════════════════════════════════════ */

describe('the save payload', () => {
  it('stamps the timestamp it was given, not the clock', () => {
    // The store's `lastSaved` and the payload's must be the same instant —
    // they are what the vigil measures an absence from, and two notions of
    // "when this was saved" is how an offline reward quietly drifts.
    expect(stateToSave(playing(), AT).lastSaved).toBe(AT);
  });

  it('round-trips through a save and back', () => {
    const before = playing();
    const after = readSave(JSON.parse(JSON.stringify(stateToSave(before, AT))));

    expect(after).toBeTruthy();
    expect(after!.joy).toBe(before.joy);
    expect(after!.lifetimeJoy).toBe(before.lifetimeJoy);
    expect(after!.sources!.devotee).toBe(30);
    // Sets survive the trip as sets, not as arrays.
    expect(after!.trophies).toBeInstanceOf(Set);
    expect(after!.trophies!.has('joy_1')).toBe(true);
    expect(after!.blessings!.has('devotee_t1')).toBe(true);
  });

  it('refuses anything that is not a save', () => {
    expect(readSave(null)).toBeNull();
    expect(readSave('nonsense')).toBeNull();
    expect(readSave({})).toBeNull();
    expect(readSave({ version: 99 })).toBeNull();
  });

  it('recognises a v1 save and carries the time over as Grace', () => {
    const migrated = readSave({
      version: 1,
      lifetimeHappiness: 1e18,
      prestigeCount: 6,
      totalPlaytime: 40_000,
      theme: 'dark',
    });

    expect(migrated).toBeTruthy();
    expect(migrated!.grace).toBeGreaterThan(0);
    expect(migrated!.playtime).toBe(40_000);
    expect(migrated!.theme).toBe('vespers');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Reaching the server as the page dies
   ══════════════════════════════════════════════════════════════════════════ */

describe('the teardown write', () => {
  it('goes out as a beacon, with a JSON content type', () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { sendBeacon });

    expect(saveBeacon(playing(), AT)).toBe(true);
    expect(sendBeacon).toHaveBeenCalledTimes(1);

    const [url, blob] = sendBeacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe('/api/temple-of-joy/save');
    // Without the type the route sees text/plain and some stacks refuse it.
    expect(blob.type).toBe('application/json');
  });

  it('falls back to a keepalive fetch when the beacon is refused', () => {
    // Beacon returns false when its queue is full or the body is over 64 KB,
    // which a late-game save can be.
    vi.stubGlobal('navigator', { sendBeacon: vi.fn(() => false) });
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);

    expect(saveBeacon(playing(), AT)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.keepalive).toBe(true);
    expect(init.method).toBe('POST');
  });

  it('falls back when the beacon throws outright', () => {
    vi.stubGlobal('navigator', {
      sendBeacon: () => {
        throw new Error('payload too large');
      },
    });
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);

    expect(saveBeacon(playing(), AT)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('survives an environment with no beacon at all', () => {
    vi.stubGlobal('navigator', {});
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);

    expect(saveBeacon(playing(), AT)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('the ordinary write', () => {
  it('is keepalive too, so an in-flight save outlives a navigation', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);

    await saveToServer(playing(), AT);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/temple-of-joy/save');
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(String(init.body)).saveData.lastSaved).toBe(AT);
  });

  it('throttles no faster than the endpoint allows', () => {
    // The route permits 20 requests a minute. The gap has to leave room for
    // the interval, the idle timer and a player switching tabs.
    expect(60_000 / MIN_SERVER_GAP_MS).toBeLessThanOrEqual(20);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Playing without an account
   ══════════════════════════════════════════════════════════════════════════ */

describe('a guest', () => {
  it('never touches the network', async () => {
    setSaveIdentity(null);
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { sendBeacon });

    await saveToServer(playing(), AT);
    expect(saveBeacon(playing(), AT)).toBe(false);
    expect(await templeSave.readCloud()).toBeNull();

    // A signed-out player has no row to write, and a 401 on every autosave is
    // how you teach somebody to ignore their console.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('still writes the save this browser holds', () => {
    setSaveIdentity(null);
    stubStorage();

    saveLocal(playing(), AT);
    const back = templeSave.readLocal();

    expect(back).toBeTruthy();
    expect(back!.lifetimeJoy).toBe(99_999);
    expect(back!.lastSaved).toBe(AT);
  });
});

describe('a save on a shared browser', () => {
  it('is claimed by whoever signs in after playing as a guest', () => {
    stubStorage();
    setSaveIdentity(null);
    saveLocal(playing(), AT);

    // The whole point of guest play: make an account, keep the temple.
    setSaveIdentity('player-1');
    expect(templeSave.readLocal()?.lifetimeJoy).toBe(99_999);
  });

  it('is invisible to a different account', () => {
    stubStorage();
    setSaveIdentity('player-1');
    saveLocal(playing(), AT);

    // Two people, one laptop. Reading somebody else's run would be bad; playing
    // on and autosaving it to YOUR account would be worse.
    setSaveIdentity('player-2');
    expect(templeSave.readLocal()).toBeNull();

    setSaveIdentity('player-1');
    expect(templeSave.readLocal()).toBeTruthy();
  });

  it('survives a build that predates the ownership stamp', () => {
    const storage = stubStorage();
    // What is on disk for everyone playing today: a save, and no meta beside it.
    storage.setItem('temple_of_joy_save_v2', JSON.stringify(stateToSave(playing(), AT)));

    setSaveIdentity('player-1');
    expect(templeSave.readLocal()?.lifetimeJoy).toBe(99_999);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Choosing between two temples
   ══════════════════════════════════════════════════════════════════════════ */

describe('the conflict summary', () => {
  it('reports the figures a player recognises their own run by', () => {
    const summary = summarizeTempleSave(stateToSave(playing(), AT), untranslated);

    expect(summary.savedAt).toBe(AT);
    expect(summary.headline).toContain('joy');
    // Sources owned: the 30 Devotees from `playing()`.
    expect(summary.lines.map((line) => line.value)).toContain('30');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Waking up
   ══════════════════════════════════════════════════════════════════════════ */

describe('a tab that was left in the background', () => {
  it('is credited from the last tick, not clamped to a minute', () => {
    const base = playing();
    const state: GameState = { ...base, lastTick: AT, lastSaved: AT };

    // A hidden tab gets no animation frames; the first one back would ask the
    // tick to integrate four hours, which it clamps to sixty seconds.
    const clamped = applyTick(state, AT + 4 * 3600_000);
    const woken = applyVigil(state, AT + 4 * 3600_000, state.lastTick);

    expect(woken.joy).toBeGreaterThan(clamped.joy - state.joy);
    expect(woken.seconds).toBeCloseTo(4 * 3600, 0);
  });

  it('measures from the save when no other point is given', () => {
    const state: GameState = { ...playing(), lastSaved: AT, lastTick: AT + 3600_000 };
    // Default `sinceMs` is the save, which is the case on load.
    expect(applyVigil(state, AT + 2 * 3600_000).seconds).toBeCloseTo(2 * 3600, 0);
    // Explicit `sinceMs` is the case on wake.
    expect(applyVigil(state, AT + 2 * 3600_000, state.lastTick).seconds).toBeCloseTo(3600, 0);
  });

  it('reports nothing for a glance at another tab', () => {
    const state: GameState = { ...playing(), lastTick: AT };
    expect(applyVigil(state, AT + 3_000, state.lastTick).seconds).toBe(0);
  });
});
