import { describe, expect, it, vi } from 'vitest';
import { createV86Loader, createVm, isStateLoadFailure, relayConfig } from '../vm';
import { resolveImageManifest } from '../image-manifest';

describe('relayConfig', () => {
  it('turns the session URL into a Wisp URL with the ticket', () => {
    const r = relayConfig(
      { url: 'wss://rmhstudios.com/rmhos-net/', ticket: 'abc.def' },
      'ignored',
      true,
    );
    expect(r.relayUrl).toBe('wisps://rmhstudios.com/rmhos-net/?ticket=abc.def');
  });

  it('uses wisp:// for a plain ws:// relay', () => {
    const r = relayConfig({ url: 'ws://localhost:7005/rmhos-net/', ticket: 't' }, 'x', false);
    expect(r.relayUrl).toBe('wisp://localhost:7005/rmhos-net/?ticket=t');
  });

  it('carries the ticket to the DoH forwarder through the doh_server host string', () => {
    // v86 builds `https://${doh_server}/dns-query`; the trailing `#` swallows the appended path.
    const r = relayConfig({ url: 'wss://rmhstudios.com/rmhos-net/', ticket: 'a.b' }, 'x', true);
    expect(r.dohServer).toBe('rmhstudios.com/rmhos-net/dns-query?ticket=a.b#');
    const url = new URL(`https://${r.dohServer}/dns-query`);
    expect(url.pathname + url.search).toBe('/rmhos-net/dns-query?ticket=a.b');
  });

  it('points at the same origin with no ticket when there is no relay', () => {
    const r = relayConfig(null, 'rmhstudios.com', true);
    expect(r.relayUrl).toBe('wisps://rmhstudios.com/rmhos-net/');
    expect(r.dohServer).not.toContain('ticket');
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
      manifest: resolveImageManifest(undefined),
      net: null,
      signal: ac.signal,
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
