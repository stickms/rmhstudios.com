import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DRIVER_FILES,
  installTestHooks,
  TEST_MARKER,
  testHooksEnabled,
  type BalatroMpTestApi,
  type TestBridge,
} from '../test-hooks';

function fakeFs() {
  const files = new Map<string, string>();
  const dirs = new Set<string>(['/']);
  return {
    files,
    dirs,
    mkdir: (p: string) => void dirs.add(p),
    writeFile: (p: string, d: string | Uint8Array) => void files.set(p, String(d)),
    analyzePath: (p: string) => ({ exists: dirs.has(p) || files.has(p) }),
  };
}

function fakeBridge() {
  let handler: ((d: { id: string; ok: boolean; data?: unknown }) => void) | null = null;
  const sent: Array<{ id: string; cmd: string; args: unknown[] }> = [];
  const bridge: TestBridge = {
    send: (_t, d) => void sent.push(d),
    on: (_t, fn) => {
      handler = fn;
      return () => {
        handler = null;
      };
    },
  };
  return {
    bridge,
    sent,
    reply: (d: { id: string; ok: boolean; data?: unknown }) => handler?.(d),
    attached: () => handler !== null,
  };
}

afterEach(() => vi.useRealTimers());

describe('MP test hooks', () => {
  it('exist only when the build flag is exactly "1"', () => {
    expect(testHooksEnabled('1')).toBe(true);
    for (const v of [undefined, '', '0', 'true', 1, true]) expect(testHooksEnabled(v)).toBe(false);
    const fs = fakeFs();
    const target: { __balatroMp?: BalatroMpTestApi } = {};
    expect(installTestHooks({ bridge: fakeBridge().bridge, fs, flag: '', target })).toBeNull();
    expect(target.__balatroMp).toBeUndefined();
    expect(fs.files.size).toBe(0);
  });

  it('writes the Lua driver and the marker, and exposes __balatroMp', () => {
    const fs = fakeFs();
    const target: { __balatroMp?: BalatroMpTestApi } = {};
    const api = installTestHooks({
      bridge: fakeBridge().bridge,
      fs,
      flag: '1',
      target,
      state: () => ({ lobby: 'ABC' }),
    });
    expect(target.__balatroMp).toBe(api);
    expect(fs.files.get(TEST_MARKER)).toBe('1');
    for (const f of DRIVER_FILES) expect(fs.files.get(f.path)).toContain('mp_test/');
    expect(fs.files.get('/Balatro/rmh_mp_test/autopilot.lua')).toContain(
      'NEVER ACTIVE IN PRODUCTION',
    );
    expect(api!.state()).toEqual({ lobby: 'ABC' });
  });

  it('sends test_cmd with array args and settles on the matching test_res', async () => {
    const b = fakeBridge();
    const api = installTestHooks({ bridge: b.bridge, fs: fakeFs(), flag: '1', target: {} })!;
    const a = api.cmd('start_run', { seed: 'X' });
    const c = api.cmd('play', ['best']);
    expect(b.sent).toEqual([
      { id: 't1', cmd: 'start_run', args: [{ seed: 'X' }] },
      { id: 't2', cmd: 'play', args: ['best'] },
    ]);
    b.reply({ id: 't2', ok: false, data: { error: 'no hands left' } });
    b.reply({ id: 'zzz', ok: true });
    b.reply({ id: 't1', ok: true, data: { state: 'BLIND_SELECT' } });
    await expect(a).resolves.toEqual({ state: 'BLIND_SELECT' });
    await expect(c).rejects.toThrow('no hands left');
    expect(api.pending()).toBe(0);
  });

  it('rejects bad command names, times out, and cleans up on uninstall', async () => {
    vi.useFakeTimers();
    const b = fakeBridge();
    const target: { __balatroMp?: BalatroMpTestApi } = {};
    const api = installTestHooks({ bridge: b.bridge, fs: fakeFs(), flag: '1', target })!;
    await expect(api.cmd('Bad Name')).rejects.toThrow(/bad command name/);
    const slow = api.cmd('wait_state', ['SHOP'], 1000);
    vi.advanceTimersByTime(1001);
    await expect(slow).rejects.toThrow(/timed out/);
    const hanging = api.cmd('state');
    api.uninstall();
    await expect(hanging).rejects.toThrow(/uninstalled/);
    expect(target.__balatroMp).toBeUndefined();
    expect(b.attached()).toBe(false);
  });
});
