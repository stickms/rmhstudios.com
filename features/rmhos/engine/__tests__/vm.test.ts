import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BootFailure, createV86Loader, createVm, isStateLoadFailure, relayConfig } from '../vm';
import { resolveImageManifest } from '../image-manifest';
import { BOOT_COLD_MS, BOOT_SNAPSHOT_MS, STALL_MS, type WatchdogClock } from '../boot-watchdog';
import type { VmPhase, VmPhaseDetail } from '../vm-types';

/** Every file answers: 206 for the ranged disk probe, 200 for the rest. */
const okFetch = (async (_url: string, init?: RequestInit) =>
  new Response(null, { status: init?.method === 'GET' ? 206 : 200 })) as unknown as typeof fetch;

describe('relayConfig', () => {
  it('turns the session URL into a Wisp URL with the ticket', () => {
    const r = relayConfig({ url: 'wss://rmhstudios.com/rmhos-net/', ticket: 'abc.def' });
    expect(r.relayUrl).toBe('wisps://rmhstudios.com/rmhos-net/?ticket=abc.def');
  });

  it('uses wisp:// for a plain ws:// relay', () => {
    const r = relayConfig({ url: 'ws://localhost:7005/rmhos-net/', ticket: 't' });
    expect(r.relayUrl).toBe('wisp://localhost:7005/rmhos-net/?ticket=t');
  });

  it('carries the ticket to the DoH forwarder through the doh_server host string', () => {
    // v86 builds `https://${doh_server}/dns-query`; the trailing `#` swallows the appended path.
    const r = relayConfig({ url: 'wss://rmhstudios.com/rmhos-net/', ticket: 'a.b' });
    expect(r.dohServer).toBe('rmhstudios.com/rmhos-net/dns-query?ticket=a.b#');
    const url = new URL(`https://${r.dohServer}/dns-query`);
    expect(url.pathname + url.search).toBe('/rmhos-net/dns-query?ticket=a.b');
  });

  it('is empty when there is no relay, so v86 builds no network adapter and opens no socket', () => {
    expect(relayConfig(null)).toEqual({ relayUrl: '', dohServer: '' });
  });
});

describe('createV86Loader', () => {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('overlapping loads import once and leave process intact', async () => {
    const original = globalThis.process;
    let calls = 0;
    let hiddenDuringImport = false;
    const load = createV86Loader(async () => {
      calls++;
      hiddenDuringImport = (globalThis as { process?: unknown }).process === undefined;
      await delay(10);
      return { V86: class {} };
    });
    const [a, b] = await Promise.all([load(), load()]);
    expect(a).toBe(b);
    expect(calls).toBe(1);
    expect(hiddenDuringImport).toBe(true);
    expect(globalThis.process).toBe(original);
    expect(await load()).toBe(a);
    expect(calls).toBe(1);
  });

  it('puts process back after a failed import and lets a retry try again', async () => {
    const original = globalThis.process;
    let calls = 0;
    const load = createV86Loader(async () => {
      calls++;
      await delay(1);
      if (calls === 1) throw new Error('network');
      return { V86: class {} };
    });
    await expect(load()).rejects.toThrow('network');
    expect(globalThis.process).toBe(original);
    await expect(load()).resolves.toBeDefined();
    expect(calls).toBe(2);
    expect(globalThis.process).toBe(original);
  });
});

describe('createVm cancellation', () => {
  it('aborting while the emulator loads builds no machine', async () => {
    const ctor = vi.fn();
    const ac = new AbortController();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const p = createVm({
      screen: {} as HTMLDivElement,
      manifest: resolveImageManifest(undefined)!,
      net: null,
      signal: ac.signal,
      fetch: okFetch,
      loader: async () => {
        await gate;
        return { V86: ctor as never };
      },
    });
    ac.abort();
    release();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(ctor).not.toHaveBeenCalled();
  });
});

describe('createVm ticket timing', () => {
  it('asks for the relay ticket only after the emulator has loaded, and builds nothing if aborted meanwhile', async () => {
    const order: string[] = [];
    const ctor = vi.fn();
    const ac = new AbortController();
    const p = createVm({
      screen: {} as HTMLDivElement,
      manifest: resolveImageManifest(undefined)!,
      net: async () => {
        order.push('net');
        ac.abort();
        return { url: 'ws://localhost:7005/rmhos-net/', ticket: 't' };
      },
      signal: ac.signal,
      fetch: okFetch,
      loader: async () => {
        order.push('loader');
        return { V86: ctor as never };
      },
    });
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(order).toEqual(['loader', 'net']);
    expect(ctor).not.toHaveBeenCalled();
  });
});

describe('isStateLoadFailure', () => {
  it.each([
    'Invalid length: 3',
    'Invalid header: deadbeef',
    'Version mismatch: dump=5 we=6',
    "Length doesn't match header: real=1 header=2",
    'Invalid info block length: 9',
    'zstd decompression failed',
  ])('acts on v86 state errors: %s', (m) => expect(isStateLoadFailure(m)).toBe(true));

  it.each([
    'Cannot read properties of undefined (reading "state")',
    'Maximum update depth exceeded: setState in useEffect',
    'query state is invalid',
    'Failed to restore focus',
    'NetworkError when attempting to fetch resource.',
  ])('leaves other rejections alone: %s', (m) => expect(isStateLoadFailure(m)).toBe(false));
});

/** A hand-cranked clock: timers fire only when the test advances time. */
function fakeClock() {
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; cb: () => void }>();
  const clock: WatchdogClock = {
    setTimeout: (cb, ms) => {
      timers.set(next, { at: now + ms, cb });
      return next++;
    },
    clearTimeout: (h) => void timers.delete(h as number),
  };
  const advance = async (ms: number) => {
    const target = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at;
      timers.delete(due[0]);
      due[1].cb();
      await Promise.resolve();
    }
    now = target;
    await new Promise((r) => setImmediate(r));
  };
  return { clock, advance, pending: () => timers.size };
}

/** The slice of v86 the wrapper talks to. `emit` plays the part of the emulator. */
class FakeV86 {
  static last: FakeV86 | null = null;
  static all: FakeV86[] = [];
  static options: unknown[] = [];
  listeners = new Map<string, Array<(ev: never) => void>>();
  destroyed = false;
  constructor(options: unknown) {
    FakeV86.last = this;
    FakeV86.all.push(this);
    FakeV86.options.push(options);
  }
  add_listener(name: string, cb: (ev: never) => void) {
    (this.listeners.get(name) ?? this.listeners.set(name, []).get(name)!).push(cb);
  }
  emit(name: string, ev?: unknown) {
    for (const cb of this.listeners.get(name) ?? []) cb(ev as never);
  }
  keyboard_set_status() {}
  async destroy() {
    this.destroyed = true;
  }
}

describe('the boot watchdog and the image probe in createVm', () => {
  const manifest = resolveImageManifest(undefined)!;
  const screen = { ownerDocument: { activeElement: null } } as unknown as HTMLDivElement;

  const start = (extra: Partial<Parameters<typeof createVm>[0]> = {}) => {
    FakeV86.all = [];
    FakeV86.options = [];
    FakeV86.last = null;
    const reports: string[] = [];
    const c = fakeClock();
    const p = createVm({
      screen,
      manifest,
      net: null,
      clock: c.clock,
      fetch: okFetch,
      report: (e) => reports.push(e.message),
      loader: async () => ({ V86: FakeV86 as never }),
      ...extra,
    });
    return { p, c, reports };
  };
  const track = (vm: Awaited<ReturnType<typeof createVm>>) => {
    const seen: Array<[VmPhase, VmPhaseDetail | undefined]> = [];
    vm.onPhase((p, d) => seen.push([p, d]));
    return seen;
  };
  const flush = () => new Promise((r) => setImmediate(r));

  beforeEach(() => {
    vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('passes the disk size from the manifest, so v86 sends no size probe', async () => {
    const { p } = start();
    await p;
    const o = FakeV86.options[0] as { hda: { size: number; async: boolean } };
    expect(o.hda.size).toBe(manifest.rootfs.size);
    expect(o.hda.async).toBe(true);
  });

  it('fails with no download progress for 30 s while downloading', async () => {
    const { p, c, reports } = start({ fetch: stateMissingFetch });
    const vm = await p;
    const seen = track(vm);
    await c.advance(STALL_MS - 1);
    expect(vm && seen.at(-1)![0]).toBe('downloading');
    await c.advance(2);
    expect(seen.at(-1)![0]).toBe('failed');
    expect(seen.at(-1)![1]).toMatchObject({ reason: 'stalled' });
    expect(reports.join()).toContain('stalled');
  });

  it('download progress keeps the machine alive past 30 s', async () => {
    const { p, c } = start();
    const vm = await p;
    const seen = track(vm);
    for (let i = 0; i < 4; i++) {
      await c.advance(STALL_MS - 1000);
      FakeV86.last!.emit('download-progress', { file_name: manifest.bzImage.url, loaded: 10 * (i + 1) });
    }
    expect(seen.at(-1)![0]).toBe('downloading');
  });

  it('a cold boot that never prints READY fails after 180 s, naming the boot', async () => {
    const { p, c } = start({ fetch: stateMissingFetch });
    const vm = await p;
    const seen = track(vm);
    expect(vm.bootKind()).toBe('cold');
    FakeV86.last!.emit('emulator-loaded');
    expect(seen.at(-1)![0]).toBe('booting');
    await c.advance(BOOT_COLD_MS - 1000);
    expect(seen.at(-1)![0]).toBe('booting');
    await c.advance(2000);
    expect(seen.at(-1)![0]).toBe('failed');
    expect(seen.at(-1)![1]).toMatchObject({ reason: 'boot-timeout' });
  });

  it('a cold boot that prints READY is running and disarms the watchdog', async () => {
    const { p, c } = start({ fetch: stateMissingFetch });
    const vm = await p;
    const seen = track(vm);
    FakeV86.last!.emit('emulator-loaded');
    for (const ch of 'RMHOS READY\n') FakeV86.last!.emit('serial1-output-byte', ch.charCodeAt(0));
    expect(seen.at(-1)![0]).toBe('running');
    expect(c.pending()).toBe(0);
  });

  it('a snapshot that does not restore within 60 s falls back to one cold boot, which then has 180 s', async () => {
    const { p, c, reports } = start();
    const vm = await p;
    const seen = track(vm);
    expect(vm.bootKind()).toBe('snapshot');
    FakeV86.last!.emit('emulator-loaded');
    await c.advance(BOOT_SNAPSHOT_MS + 1000);
    await flush();
    expect(FakeV86.all).toHaveLength(2);
    expect(FakeV86.all[0]!.destroyed).toBe(true);
    expect(vm.bootKind()).toBe('cold');
    expect(reports.join()).toContain('falling back to a cold boot');
    FakeV86.last!.emit('emulator-loaded');
    await c.advance(BOOT_COLD_MS + 1000);
    expect(seen.at(-1)![0]).toBe('failed');
    expect(FakeV86.all).toHaveLength(2); // no second fallback
  });

  it('a stall on the kernel after the snapshot is complete ends the boot (a cold boot would stall again)', async () => {
    const { p, c } = start();
    const vm = await p;
    const seen = track(vm);
    FakeV86.last!.emit('download-progress', { file_name: manifest.state!.url, loaded: manifest.state!.size });
    FakeV86.last!.emit('download-progress', { file_name: manifest.bzImage.url, loaded: 10 });
    await c.advance(STALL_MS + 1000);
    expect(FakeV86.all).toHaveLength(1);
    expect(seen.at(-1)![0]).toBe('failed');
    expect(seen.at(-1)![1]).toMatchObject({ reason: 'stalled' });
  });

  it('a snapshot download that stalls falls back to a cold boot instead of failing', async () => {
    const { p, c } = start();
    const vm = await p;
    track(vm);
    FakeV86.last!.emit('download-progress', { file_name: manifest.state!.url, loaded: 1000 });
    await c.advance(STALL_MS + 1000);
    await flush();
    expect(FakeV86.all).toHaveLength(2);
    expect(vm.bootKind()).toBe('cold');
  });

  const stateMissingFetch = (async (url: string, init?: RequestInit) =>
    new Response(null, {
      status: String(url).endsWith('state.zst') ? 404 : init?.method === 'GET' ? 206 : 200,
    })) as unknown as typeof fetch;

  it('a body-less 404 on the snapshot boots cold at once, without waiting', async () => {
    const { p, reports } = start({ fetch: stateMissingFetch });
    const vm = await p;
    expect(vm.bootKind()).toBe('cold');
    expect(FakeV86.all).toHaveLength(1);
    expect(JSON.stringify(FakeV86.options[0])).not.toContain('initial_state');
    expect(reports.join()).toContain('snapshot unusable');
  });

  it.each([
    ['bzImage', 404, 'image-missing'],
    ['seabios.bin', 404, 'image-missing'],
    ['rootfs.ext4', 416, 'image-missing'],
    ['rootfs.ext4', 200, 'image-invalid'], // the disk server ignores Range
  ])('%s answering %i fails with %s and builds no machine', async (file, status, reason) => {
    const f = (async (url: string, init?: RequestInit) =>
      new Response(null, {
        status: String(url).endsWith(file) ? status : init?.method === 'GET' ? 206 : 200,
      })) as unknown as typeof fetch;
    const { p } = start({ fetch: f });
    await expect(p).rejects.toMatchObject({ name: 'BootFailure', reason });
    expect(FakeV86.all).toHaveLength(0);
  });

  it('a network or CORS error on any file fails as "network"', async () => {
    const f = (async (url: string) => {
      if (String(url).endsWith('bzImage')) throw new TypeError('Failed to fetch');
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const { p } = start({ fetch: f });
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(BootFailure);
    expect(err.reason).toBe('network');
  });

  it('a disk whose Content-Range total is not the pinned size fails as invalid', async () => {
    const f = (async (url: string, init?: RequestInit) =>
      new Response(null, {
        status: init?.method === 'GET' ? 206 : 200,
        headers: String(url).endsWith('rootfs.ext4') ? { 'content-range': 'bytes 0-0/12345' } : {},
      })) as unknown as typeof fetch;
    const { p } = start({ fetch: f });
    await expect(p).rejects.toMatchObject({ reason: 'image-invalid' });
  });

  it('a file that never answers ends as "stalled" after the probe timeout', async () => {
    const hang = ((_u: string, init?: RequestInit) =>
      new Promise((_, rej) =>
        init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))),
      )) as unknown as typeof fetch;
    const { p, c } = start({ fetch: hang, probeTimeoutMs: 15_000 });
    const settled = p.catch((e) => e);
    await c.advance(STALL_MS + 1000);
    const err = await settled;
    expect(err).toBeInstanceOf(BootFailure);
    expect(err.reason).toBe('stalled');
  });

  it('a body-less 404 reported by v86 itself on the kernel fails the boot', async () => {
    const { p } = start();
    const vm = await p;
    const seen = track(vm);
    FakeV86.last!.emit('download-error', { file_name: manifest.bzImage.url, request: { status: 404 } });
    expect(seen.at(-1)).toEqual([
      'failed',
      expect.objectContaining({ reason: 'image-missing' }),
    ]);
  });

  it('the emulator constructor throwing is a "start" failure', async () => {
    class Boom {
      constructor() {
        throw new Error('out of memory');
      }
    }
    const { p } = start({ loader: async () => ({ V86: Boom as never }) });
    await expect(p).rejects.toMatchObject({ reason: 'start' });
  });

  it('destroy stops the watchdog', async () => {
    const { p, c } = start();
    const vm = await p;
    vm.destroy();
    expect(c.pending()).toBe(0);
  });
});
