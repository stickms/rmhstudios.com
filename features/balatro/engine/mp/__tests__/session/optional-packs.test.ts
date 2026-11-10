/**
 * EX-14: the Release ruleset's art is an optional pack (`release-<sha>.zip`). These run whole
 * lobbies on FakeNet against the real hub handler and check the contract around it:
 *   - nothing is fetched until a ruleset that needs the pack is picked (in a lobby or Practice);
 *   - then every seated peer fetches it once and reports it (player_info `packs`);
 *   - the host cannot start (`start-packs`) until every seated player holds it;
 *   - a failed download is reported and retried, never silently ignored.
 * Plus the store itself (createOptionalPacks): one load per kind, failures retried.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOptionalPacks, type OptionalPackStore } from '../../optional-packs';
import type { OptionalPack } from '../../types';
import { World, code, type Peer } from './world.test-support';

/** A store whose downloads the test resolves by hand. */
class FakePacks implements OptionalPackStore {
  readonly fetches: OptionalPack[] = [];
  private readonly mounted = new Set<OptionalPack>();
  private readonly pending: { kind: OptionalPack; done: (ok: boolean) => void }[] = [];
  private loading: Promise<boolean> | null = null;
  has(kind: OptionalPack) {
    return this.mounted.has(kind);
  }
  held() {
    return [...this.mounted].sort();
  }
  ensure(kind: OptionalPack) {
    if (this.mounted.has(kind)) return Promise.resolve(true);
    this.loading ??= new Promise<boolean>((resolve) => {
      this.fetches.push(kind);
      this.pending.push({
        kind,
        done: (ok) => {
          if (ok) this.mounted.add(kind);
          this.loading = null;
          resolve(ok);
        },
      });
    });
    return this.loading;
  }
  finish(ok = true) {
    for (const p of this.pending.splice(0)) p.done(ok);
  }
}

let w: World;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(1_762_000_000_000);
  w = new World();
});

afterEach(() => {
  for (const p of w.peers) expect(p.lua.invalid, `${p.id} sent Lua an invalid message`).toEqual([]);
  w.stop();
  vi.useRealTimers();
});

async function lobby(): Promise<{ host: Peer; bob: Peer; hp: FakePacks; bp: FakePacks }> {
  const hp = new FakePacks();
  const bp = new FakePacks();
  const host = w.peer('alice', { packs: hp });
  await w.step(20);
  host.lua.emit('ui_create_lobby', { queueMode: 'pvp_nemesis', kind: 'private' });
  await w.until(() => !!host.runtime.role?.code && code(host) === host.runtime.role.code, 5_000, 'hosted');
  const bob = w.peer('bob', { packs: bp });
  await w.step(20);
  bob.lua.emit('ui_join', { code: code(host) as string });
  await w.until(() => host.lua.last('lobby_view')?.state.players.length === 2, 30_000, 'bob joined');
  bob.lua.emit('ui_ready', { ready: true });
  await w.until(() => host.lua.last('lobby_view')?.canStart === true, 5_000, 'can start');
  return { host, bob, hp, bp };
}

const packsOf = (p: Peer, id: string) =>
  p.lua.last('lobby_view')?.state.players.find((x) => x.id === id)?.packs ?? [];

describe('EX-14 optional packs in a lobby', () => {
  it('nothing is fetched while the ruleset needs no pack', async () => {
    const { hp, bp, host } = await lobby();
    host.lua.emit('ui_set_option', { key: 'ruleset', value: 'ruleset_mp_minorleague' });
    await w.step(200);
    expect(hp.fetches).toEqual([]);
    expect(bp.fetches).toEqual([]);
    expect(host.lua.last('lobby_view')?.canStart).toBe(true);
  });

  it('picking Release makes every seated peer fetch it once, and gates the start until all hold it', async () => {
    const { host, bob, hp, bp } = await lobby();
    host.lua.emit('ui_set_option', { key: 'ruleset', value: 'ruleset_mp_release' });
    await w.until(() => hp.fetches.length === 1 && bp.fetches.length === 1, 5_000, 'both fetch');
    expect(host.lua.last('lobby_view')?.canStart).toBe(false);
    expect(host.lua.last('lobby_view')?.startBlockReason).toBe('packs');
    // Starting anyway is refused with the reason.
    host.lua.emit('ui_start', {});
    await w.step(50);
    expect(host.lua.errors()).toContain('start-packs');
    expect(host.lua.last('match_start')).toBeUndefined();

    hp.finish();
    await w.until(() => packsOf(host, 'alice').includes('release'), 5_000, 'host holds it');
    expect(host.lua.last('lobby_view')?.startBlockReason).toBe('packs');

    bp.finish();
    await w.until(() => packsOf(host, 'bob').includes('release'), 5_000, 'bob reported it');
    await w.until(() => host.lua.last('lobby_view')?.canStart === true, 5_000, 'can start');
    await w.until(() => packsOf(bob, 'bob').includes('release'), 5_000, 'bob sees it');
    // more lobby views never refetch
    host.lua.emit('ui_set_option', { key: 'startingLives', value: 3 });
    await w.step(100);
    expect(hp.fetches).toEqual(['release']);
    expect(bp.fetches).toEqual(['release']);

    host.lua.emit('ui_start', {});
    await w.until(() => !!host.lua.last('match_start') && !!bob.lua.last('match_start'), 5_000, 'match_start');
    expect(host.lua.last('match_start')?.ruleset).toBe('ruleset_mp_release');
    expect(host.lua.last('match_start')?.resolved.layers).toEqual(['release']);
  });

  it('a failed download is reported, keeps the start blocked, and the next lobby view retries', async () => {
    const { host, bob, hp, bp } = await lobby();
    host.lua.emit('ui_set_option', { key: 'ruleset', value: 'ruleset_mp_release' });
    await w.until(() => bp.fetches.length === 1, 5_000, 'bob fetches');
    hp.finish();
    bp.finish(false);
    await w.until(() => bob.lua.errors().includes('pack-failed'), 5_000, 'bob told');
    await w.step(100);
    expect(host.lua.last('lobby_view')?.startBlockReason).toBe('packs');
    // any lobby change re-checks: bob tries again and makes it
    host.lua.emit('ui_set_option', { key: 'startingLives', value: 3 });
    await w.until(() => bp.fetches.length === 2, 5_000, 'retry');
    bp.finish();
    await w.until(() => host.lua.last('lobby_view')?.canStart === true, 5_000, 'can start');
  });

  it('a peer that cannot fetch packs at all keeps a Release lobby from starting', async () => {
    const hp = new FakePacks();
    const host = w.peer('alice', { packs: hp });
    await w.step(20);
    host.lua.emit('ui_create_lobby', { queueMode: 'pvp_nemesis', kind: 'private' });
    await w.until(() => !!code(host), 5_000, 'hosted');
    const bob = w.peer('bob'); // no store
    await w.step(20);
    bob.lua.emit('ui_join', { code: code(host) as string });
    await w.until(() => host.lua.last('lobby_view')?.state.players.length === 2, 30_000, 'joined');
    bob.lua.emit('ui_ready', { ready: true });
    host.lua.emit('ui_set_option', { key: 'ruleset', value: 'ruleset_mp_release' });
    await w.until(() => hp.fetches.length === 1, 5_000, 'host fetches');
    hp.finish();
    await w.step(200);
    expect(host.lua.last('lobby_view')?.canStart).toBe(false);
    expect(host.lua.last('lobby_view')?.startBlockReason).toBe('packs');
  });
});

describe('EX-14 optional packs in Practice', () => {
  it('Practice on Release waits for the pack; other rulesets never fetch', async () => {
    const packs = new FakePacks();
    const me = w.peer('alice', { packs });
    await w.step(20);
    me.lua.emit('ui_practice', { ruleset: 'ruleset_mp_balanced', deck: 'b_red', stake: 1 });
    await w.until(() => !!me.lua.last('practice_start'), 5_000, 'practice');
    expect(packs.fetches).toEqual([]);
    me.lua.emit('ui_practice', { ruleset: 'ruleset_mp_release', deck: 'b_red', stake: 1 });
    await w.step(50);
    expect(packs.fetches).toEqual(['release']);
    expect(me.lua.all('practice_start')).toHaveLength(1);
    packs.finish();
    await w.until(() => me.lua.all('practice_start').length === 2, 5_000, 'release practice');
    expect(me.lua.last('practice_start')?.resolved.key).toBe('ruleset_mp_release');
  });
});

describe('createOptionalPacks', () => {
  it('loads a kind once (concurrent calls share it), mounts it, and retries after a failure', async () => {
    let fail = true;
    const fetch = vi.fn(async () => {
      if (fail) throw new Error('pack-503');
      return [{ name: 'rmh_mp/assets/1x/release_jokers.png', data: new Uint8Array([1]) }];
    });
    const mount = vi.fn();
    const logs: string[] = [];
    const store = createOptionalPacks({ mounted: () => false, fetch, mount, log: (m) => logs.push(m) });
    expect(store.has('release')).toBe(false);
    expect(await Promise.all([store.ensure('release'), store.ensure('release')])).toEqual([false, false]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mount).not.toHaveBeenCalled();
    expect(logs.join()).toMatch(/pack-503/);
    fail = false;
    expect(await store.ensure('release')).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mount).toHaveBeenCalledWith('release', [expect.objectContaining({ name: 'rmh_mp/assets/1x/release_jokers.png' })]);
    expect(store.held()).toEqual(['release']);
    expect(await store.ensure('release')).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('a pack mounted earlier on this page (its marker) is never fetched', async () => {
    const fetch = vi.fn();
    const store = createOptionalPacks({ mounted: (k) => k === 'release', fetch, mount: vi.fn() });
    expect(store.has('release')).toBe(true);
    expect(await store.ensure('release')).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
