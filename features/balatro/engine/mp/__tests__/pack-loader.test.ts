/**
 * pack-loader.ts (WS3): mounting the MP pack, the `mp_pack` sequence Lua sees,
 * the session start, the clipboard intents and the page view state — on an
 * in-memory FS with trackingDelegate semantics and an injected pack fetch.
 */
import { describe, expect, it } from 'vitest';
import { BRIDGE_PATHS } from '../bridge-protocol';
import { codeFromClipboard, openMultiplayer, type MpSession, type StartMultiplayerOptions } from '../pack-loader';
import { GAME_DIR, mpPackPath, type MpHost } from '../../runtime';
import { loadFixture } from '../__fixtures__/load';
import type { LobbyState } from '../types';

const lobbyState = (loadFixture('types.json') as { objects: { lobbyState: LobbyState } }).objects.lobbyState;

const enc = new TextEncoder();
const dec = new TextDecoder();

function memHost(overrides: Partial<MpHost> = {}) {
  const files = new Map<string, Uint8Array>();
  const dirs = new Set<string>(['/']);
  const moveFns = new Set<(a: string, b: string) => void>();
  const deleteFns = new Set<(a: string) => void>();
  const fs = {
    mkdir: (p: string) => void dirs.add(p),
    writeFile: (p: string, d: Uint8Array | string) => void files.set(p, typeof d === 'string' ? enc.encode(d) : d),
    readFile: (p: string) => {
      const f = files.get(p);
      if (!f) throw new Error('ENOENT');
      return f;
    },
    unlink: (p: string) => {
      files.delete(p);
      for (const fn of deleteFns) fn(p);
    },
    analyzePath: (p: string) => ({ exists: files.has(p) || dirs.has(p) }),
  };
  const host = {
    fs,
    tracking: true,
    onMove: (fn: (a: string, b: string) => void) => (moveFns.add(fn), () => void moveFns.delete(fn)),
    onDelete: (fn: (a: string) => void) => (deleteFns.add(fn), () => void deleteFns.delete(fn)),
    autoload: null,
    mounted: false,
    ...overrides,
  } as unknown as MpHost;
  /** Lua consumes `in` and returns its lines. */
  const luaRead = () => {
    const f = files.get(BRIDGE_PATHS.IN);
    if (!f) return [];
    fs.unlink(BRIDGE_PATHS.IN);
    return dec
      .decode(f)
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { s: number; t: string; d: Record<string, unknown> });
  };
  /** Lua sends a batch. */
  const luaSend = (...msgs: { s: number; t: string; d: unknown }[]) => {
    files.set(BRIDGE_PATHS.OUT, enc.encode(msgs.map((m) => JSON.stringify(m)).join('\n')));
    for (const fn of moveFns) fn(BRIDGE_PATHS.OUT_TMP, BRIDGE_PATHS.OUT);
  };
  return { host, files, luaRead, luaSend };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

const packFiles = [
  { name: 'rmh_mp/init.lua', data: enc.encode('return {}') },
  { name: 'resources/textures/2x/rmh_mp/j.png', data: new Uint8Array([1, 2]) },
  { name: 'main.lua', data: enc.encode('evil') },
  { name: 'rmh_mp/../main.lua', data: enc.encode('evil') },
];

describe('mpPackPath', () => {
  it('only writes under an rmh_mp directory inside /Balatro', () => {
    expect(mpPackPath('rmh_mp/init.lua')).toBe(`${GAME_DIR}/rmh_mp/init.lua`);
    expect(mpPackPath('rmh_mp/loc/en-us.lua')).toBe(`${GAME_DIR}/rmh_mp/loc/en-us.lua`);
    expect(mpPackPath('resources/textures/1x/rmh_mp/a.png')).toBe(`${GAME_DIR}/resources/textures/1x/rmh_mp/a.png`);
    for (const bad of ['main.lua', 'rmh_mp', 'rmh_mp/', '/rmh_mp/x.lua', 'rmh_mp/../main.lua', 'rmh_mp/./x', 'rmh_mp//x', 'rmh_mp\\x.lua', 'a/rmh_mp.lua', 'rmh_mp/x y.lua']) {
      expect(mpPackPath(bad), bad).toBeNull();
    }
  });
});

describe('codeFromClipboard', () => {
  it('accepts a code or an invite link, trimmed and upper-cased', () => {
    expect(codeFromClipboard('  abc234\n')).toBe('ABC234');
    expect(codeFromClipboard('https://rmhstudios.com/balatro?lobby=XYZ789')).toBe('XYZ789');
    expect(codeFromClipboard('')).toBeNull();
    expect(codeFromClipboard('ABC23')).toBeNull();
    expect(codeFromClipboard('ABC2340')).toBeNull();
    expect(codeFromClipboard('ABCI23')).toBeNull(); // I is not in the alphabet
  });
});

describe('openMultiplayer', () => {
  it('mounts the pack, writes ready, and tells Lua loading → ready before the session starts', async () => {
    const { host, files, luaRead } = memHost();
    const order: string[] = [];
    const ctrl = openMultiplayer(host, {
      fetchPack: async (progress) => {
        progress(0.5);
        progress(1);
        return packFiles;
      },
      loadSession: async () => ({
        startMultiplayer: (o: StartMultiplayerOptions) => {
          order.push(`start:${o.intent}`);
          o.bridge.send('toast', { key: 'hello' });
          return { stop: () => order.push('stop') } satisfies MpSession;
        },
      }),
      onLog: () => {},
    });
    await ctrl.open('menu');
    await tick();
    expect(files.has(`${GAME_DIR}/rmh_mp/init.lua`)).toBe(true);
    expect(files.has(`${GAME_DIR}/resources/textures/2x/rmh_mp/j.png`)).toBe(true);
    expect(dec.decode(files.get(`${GAME_DIR}/main.lua`) ?? new Uint8Array())).toBe(''); // refused
    expect(files.has(BRIDGE_PATHS.MP_READY)).toBe(true);
    const lines = luaRead();
    expect(lines.map((l) => `${l.t}:${(l.d.status as string) ?? l.d.key}`)).toEqual([
      'mp_pack:loading',
      'mp_pack:loading',
      'mp_pack:loading',
      'mp_pack:ready',
      'toast:hello',
    ]);
    expect(lines.map((l) => l.s)).toEqual([1, 2, 3, 4, 5]);
    expect(order).toEqual(['start:menu']);
    expect(ctrl.getState()).toMatchObject({ active: true, pack: 'ready' });
    await ctrl.open('menu'); // idempotent
    expect(order).toEqual(['start:menu']);
    ctrl.stop();
    expect(order).toEqual(['start:menu', 'stop']);
    expect(ctrl.getState().active).toBe(false);
  });

  it('reports a failed pack and retries on the next open', async () => {
    const { host, luaRead } = memHost();
    let calls = 0;
    const ctrl = openMultiplayer(host, {
      fetchPack: async () => {
        calls += 1;
        if (calls === 1) throw new Error('pack-503');
        return packFiles;
      },
      loadSession: async () => null,
      onLog: () => {},
    });
    await ctrl.open('menu');
    await tick();
    const first = luaRead();
    expect(first.at(-1)).toMatchObject({ t: 'mp_pack', d: { status: 'error', error: 'pack-503' } });
    expect(ctrl.getState().pack).toBe('error');
    await ctrl.open('menu');
    await tick();
    expect(luaRead().at(-1)).toMatchObject({ t: 'mp_pack', d: { status: 'ready' } });
    expect(ctrl.getState().active).toBe(false); // no session module in this build
    ctrl.stop();
  });

  it('skips the download when boot already mounted the pack, and starts no session for sp', async () => {
    const { host, luaRead } = memHost({ mounted: true, autoload: 'sp' });
    let fetched = false;
    let started = false;
    const ctrl = openMultiplayer(host, {
      fetchPack: async () => ((fetched = true), packFiles),
      loadSession: async () => ({ startMultiplayer: () => ((started = true), { stop() {} }) }),
    });
    await ctrl.open('sp');
    await tick();
    expect(fetched).toBe(false);
    expect(started).toBe(false);
    expect(luaRead().map((l) => l.d.status)).toEqual(['ready']);
    ctrl.stop();
  });

  it('opens again when Lua sends mp_open after the handover', async () => {
    const { host, luaSend } = memHost();
    const intents: string[] = [];
    const ctrl = openMultiplayer(host, {
      handover: { lastLuaSeq: 1, backlog: [] },
      fetchPack: async () => packFiles,
      loadSession: async () => ({ startMultiplayer: (o) => (intents.push(o.intent), { stop() {} }) }),
    });
    luaSend({ s: 1, t: 'mp_open', d: { intent: 'menu' } }); // the stub's, already handled
    await tick();
    expect(intents).toEqual([]);
    luaSend({ s: 2, t: 'mp_open', d: { intent: 'menu' } });
    await tick();
    await tick();
    expect(intents).toEqual(['menu']);
    ctrl.stop();
  });

  it('joins from the clipboard, reports a bad clipboard, and copies the code', async () => {
    const { host, luaSend, luaRead } = memHost({ mounted: true });
    const joined: string[] = [];
    let clip = 'nonsense';
    const written: string[] = [];
    const ctrl = openMultiplayer(host, {
      loadSession: async () => ({
        startMultiplayer: (o) => {
          o.bridge.send('lobby_view', {
            state: lobbyState,
            me: 'u1',
            isHost: true,
            canStart: false,
          });
          return { stop() {}, join: (c) => joined.push(c) };
        },
      }),
      clipboard: { readText: async () => clip, writeText: async (t) => void written.push(t) },
      onLog: () => {},
    });
    await ctrl.open('menu');
    luaRead();
    luaSend({ s: 1, t: 'ui_join_clipboard', d: {} });
    await tick();
    await tick();
    expect(luaRead().map((l) => l.d.code)).toEqual(['clipboard-empty']);
    clip = 'pqr456';
    luaSend({ s: 2, t: 'ui_join_clipboard', d: {} });
    await tick();
    await tick();
    expect(joined).toEqual(['PQR456']);
    // The code comes from the lobby_view the session sent.
    luaSend({ s: 3, t: 'ui_copy_code', d: {} });
    await tick();
    expect(written).toEqual([lobbyState.code]);
    expect(ctrl.getState()).toMatchObject({ code: lobbyState.code, isHost: true });
    ctrl.stop();
  });

  it('tracks hub status, the lobby code and the invite popover for the page chrome', async () => {
    const { host, luaSend } = memHost({ mounted: true });
    const ctrl = openMultiplayer(host, { loadSession: async () => null });
    let changes = 0;
    ctrl.subscribe(() => (changes += 1));
    ctrl.mailbox.send('net_status', { hub: 'connecting', account: { name: 'a', avatarUrl: null } });
    expect(ctrl.getState().hub).toBe('connecting');
    luaSend({ s: 1, t: 'ui_invite', d: {} });
    await tick();
    expect(ctrl.getState().inviteOpen).toBe(true);
    ctrl.setInviteOpen(false);
    luaSend({ s: 2, t: 'ui_leave', d: {} });
    await tick();
    expect(ctrl.getState()).toMatchObject({ code: null, inviteOpen: false });
    expect(changes).toBeGreaterThanOrEqual(3);
    ctrl.stop();
  });
});
