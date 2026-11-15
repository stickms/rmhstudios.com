import { describe, expect, it, vi } from 'vitest';
import { AgentError } from '../agent';
import { SHARE_ARCHIVE_PATH } from '../agent-protocol';
import { HomeSession, type SessionEnv, type SessionSnapshot } from '../home-session';
import { HomeSync } from '../home-sync';
import { memoryHomeStore } from '../home-store';

async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
function fakeTar(fill: number): Uint8Array {
  const t = new Uint8Array(1536);
  t.fill(fill, 0, 100);
  t.set(new TextEncoder().encode('ustar  \0'), 257);
  return t;
}

/** An environment that records every timer and listener, so teardown can be asserted. */
function fakeEnv() {
  const timers = new Map<number, () => void>();
  let next = 1;
  const listeners = new Map<string, Set<(ev: Event) => void>>();
  const target = (prefix: string) => ({
    addEventListener: (t: string, cb: (ev: Event) => void) => {
      const k = `${prefix}:${t}`;
      (listeners.get(k) ?? listeners.set(k, new Set()).get(k)!).add(cb);
    },
    removeEventListener: (t: string, cb: (ev: Event) => void) =>
      void listeners.get(`${prefix}:${t}`)?.delete(cb),
  });
  const state = { now: 1_000, visibility: 'visible' };
  const env: SessionEnv = {
    now: () => state.now,
    setInterval: (cb) => {
      timers.set(next, cb);
      return next++;
    },
    clearInterval: (h) => void timers.delete(h as number),
    doc: Object.defineProperty(target('doc'), 'visibilityState', {
      get: () => state.visibility,
    }) as SessionEnv['doc'],
    win: target('win'),
  };
  const count = (k: string) => listeners.get(k)?.size ?? 0;
  const fire = (k: string, ev: Event = new Event('x')) =>
    [...(listeners.get(k) ?? [])].forEach((cb) => cb(ev));
  return { env, timers, state, count, fire };
}

function setup(opts: { restoreError?: Error; stored?: Uint8Array; memory?: boolean } = {}) {
  const share = new Map<string, Uint8Array>();
  // The in-memory store reports kind 'memory' (storage blocked); tests act like IndexedDB unless asked.
  const store = { ...memoryHomeStore(), kind: opts.memory ? ('memory' as const) : ('indexeddb' as const) };
  const vm = {
    writeShareFile: async (p: string, d: Uint8Array) => void share.set(p, d),
    readShareFile: async (p: string) => share.get(p)!,
    deleteShareFile: async (p: string) => void share.delete(p),
  };
  let poweroff: (() => void) | null = null;
  const order: string[] = [];
  const agent = {
    startSession: vi.fn(async () => void order.push('session')),
    restore: vi.fn(async () => {
      order.push('restore');
      if (opts.restoreError) throw opts.restoreError;
    }),
    save: vi.fn(async () => {
      share.set(SHARE_ARCHIVE_PATH, fakeTar(9));
      return { bytes: 1536 };
    }),
    onPoweroff: (cb: () => void) => {
      poweroff = cb;
      return () => {
        poweroff = null;
      };
    },
  };
  const sync = new HomeSync({ userId: 'u1', vm, agent, store });
  const e = fakeEnv();
  const snaps: SessionSnapshot[] = [];
  const session = new HomeSession({
    agent,
    sync,
    linuxUser: 'zed',
    autosaveMs: 300_000,
    env: e.env,
    onChange: (s) => snaps.push(s),
  });
  return { session, sync, store, agent, share, e, snaps, order, vm, firePoweroff: () => poweroff?.() };
}

describe('HomeSession handshake', () => {
  it('prepares, signs in, restores, then runs; the runner only starts once the machine is running', async () => {
    const t = setup();
    await t.session.start();
    expect(t.order).toEqual(['session', 'restore']);
    expect(t.session.snapshot).toMatchObject({ stage: 'running', desktopReady: true });
    expect(t.e.timers.size).toBe(1);
  });

  it('a failed RESTORE is a visible failure and no save is possible', async () => {
    const t = setup({ restoreError: new AgentError('timeout') });
    await t.session.start();
    expect(t.session.snapshot).toMatchObject({
      stage: 'failed',
      failure: 'handshake',
      desktopReady: false,
      error: 'agent: timeout',
    });
    expect(await t.session.save()).toEqual({ status: 'failed', code: 'not-running' });
    expect(t.agent.save).not.toHaveBeenCalled();
    expect(t.e.timers.size).toBe(0);
    expect(t.e.count('win:beforeunload')).toBe(0);
    expect(await t.store.get('u1')).toBeNull();
  });

  it('an unreadable stored archive stops the boot: corrupt, nothing signed in, nothing overwritten', async () => {
    const t = setup();
    const damaged = { archive: new Uint8Array([1, 2, 3]), sha256: 'x', savedAt: 1 };
    await t.store.put('u1', damaged);
    await t.session.start();
    expect(t.session.snapshot).toMatchObject({ stage: 'failed', failure: 'corrupt' });
    expect(t.agent.startSession).not.toHaveBeenCalled();
    expect(await t.session.save()).toEqual({ status: 'failed', code: 'not-running' });
    expect(t.e.timers.size).toBe(0);
    expect(await t.store.get('u1')).toEqual(damaged);
    // The person chooses to start empty: the entry is kept under :damaged.
    await t.session.startEmpty();
    expect(await t.store.get('u1')).toBeNull();
    expect(await t.store.get('u1:damaged')).toEqual(damaged);
  });
});

describe('HomeSession saving', () => {
  it('autosave, hiding the tab and a manual save all go through sync.save', async () => {
    const t = setup();
    await t.session.start();
    [...t.e.timers.values()][0]!();
    await vi.waitFor(() => expect(t.session.snapshot.lastSave).not.toBeNull());
    expect(t.agent.save).toHaveBeenCalledTimes(1);
    t.e.state.visibility = 'hidden';
    t.e.fire('doc:visibilitychange');
    await vi.waitFor(() => expect(t.agent.save).toHaveBeenCalledTimes(2));
    expect((await t.session.save()).status).toMatch(/saved|unchanged/);
  });

  it('input marks the session dirty; a good save clears it, input during a save does not', async () => {
    const t = setup();
    await t.session.start();
    t.session.markDirty();
    expect(t.session.snapshot.dirty).toBe(true);
    await t.session.save();
    expect(t.session.snapshot.dirty).toBe(false);
    const p = t.session.save();
    t.session.markDirty();
    await p;
    expect(t.session.snapshot.dirty).toBe(true);
  });

  it('importing a backup suspends saves: the store keeps the backup', async () => {
    const t = setup();
    await t.session.start();
    const backup = await gzip(fakeTar(5));
    await t.session.importBackup(backup);
    const r = await t.session.save();
    expect(r).toEqual({ status: 'failed', code: 'suspended' });
    expect(t.agent.save).not.toHaveBeenCalled();
    expect((await t.store.get('u1'))!.archive).toEqual(backup);
  });

  it('guest power-off: one last save, then everything is torn down', async () => {
    const t = setup();
    await t.session.start();
    t.firePoweroff();
    await vi.waitFor(() => expect(t.session.snapshot.stage).toBe('stopped'));
    expect(t.agent.save).toHaveBeenCalledTimes(1);
    expect(t.session.snapshot.desktopReady).toBe(false);
    expect(t.e.timers.size).toBe(0);
    expect(t.e.count('win:beforeunload')).toBe(0);
  });
});

describe('HomeSession teardown', () => {
  it('machineStopped clears the timer and the listeners and blocks saves', async () => {
    const t = setup();
    await t.session.start();
    expect(t.e.count('doc:visibilitychange')).toBe(1);
    expect(t.e.count('win:beforeunload')).toBe(1);
    t.session.machineStopped('failed');
    expect(t.session.snapshot).toMatchObject({ stage: 'failed', desktopReady: false });
    expect(t.e.timers.size).toBe(0);
    expect(t.e.count('doc:visibilitychange')).toBe(0);
    expect(t.e.count('win:beforeunload')).toBe(0);
    expect(await t.session.save()).toEqual({ status: 'failed', code: 'not-running' });
  });

  it('dispose removes timers and listeners and silences later updates', async () => {
    const t = setup();
    await t.session.start();
    const seen = t.snaps.length;
    t.session.dispose();
    expect(t.e.timers.size).toBe(0);
    expect(t.e.count('doc:visibilitychange')).toBe(0);
    expect(t.e.count('win:beforeunload')).toBe(0);
    t.session.markDirty();
    expect(await t.session.save()).toEqual({ status: 'failed', code: 'not-running' });
    expect(t.snaps.length).toBe(seen);
  });

  it('dispose during the handshake: it never becomes running', async () => {
    const t = setup();
    const started = t.session.start();
    t.session.dispose();
    await started;
    expect(t.e.timers.size).toBe(0);
    expect(t.session.snapshot.stage).not.toBe('running');
  });

  describe('the unload prompt', () => {
    const ask = (t: ReturnType<typeof setup>) => {
      const ev = new Event('beforeunload', { cancelable: true });
      t.e.fire('win:beforeunload', ev);
      return ev.defaultPrevented;
    };

    it('does not ask right after a good save', async () => {
      const t = setup();
      await t.session.start();
      expect(ask(t)).toBe(false);
      await t.session.save();
      expect(ask(t)).toBe(false);
    });

    it('asks while the toolbar says Unsaved changes (dirty), however recent the last save', async () => {
      const t = setup();
      await t.session.start();
      await t.session.save();
      t.session.markDirty();
      expect(ask(t)).toBe(true);
      await t.session.save();
      expect(ask(t)).toBe(false);
    });

    it('asks while a save is still running', async () => {
      const t = setup();
      await t.session.start();
      let release!: () => void;
      t.agent.save.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => {
              t.share.set(SHARE_ARCHIVE_PATH, fakeTar(9));
              resolve({ bytes: 1536 });
            };
          }),
      );
      const saving = t.session.save();
      expect(t.session.snapshot.saving).toBe(true);
      expect(ask(t)).toBe(true);
      release();
      await saving;
      expect(ask(t)).toBe(false);
    });

    it('asks when the last save failed', async () => {
      const t = setup();
      await t.session.start();
      t.agent.save.mockRejectedValueOnce(new AgentError('timeout'));
      await t.session.save();
      expect(t.session.snapshot.lastSave?.result.status).toBe('failed');
      expect(ask(t)).toBe(true);
    });

    it('asks when the last good save is older than one autosave interval', async () => {
      const t = setup();
      await t.session.start();
      expect(ask(t)).toBe(false);
      t.e.state.now += 400_000;
      expect(ask(t)).toBe(true);
    });
  });

  it('dispose during a save: nothing is written afterwards', async () => {
    const t = setup();
    await t.session.start();
    let release!: () => void;
    t.agent.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => {
            t.share.set(SHARE_ARCHIVE_PATH, fakeTar(9));
            resolve({ bytes: 1536 });
          };
        }),
    );
    const saving = t.session.save();
    t.session.dispose();
    release();
    await saving;
    expect(await t.store.get('u1')).toBeNull();
  });

  it('a failed handshake offers the previous files back when a backup replaced them', async () => {
    const t = setup({ restoreError: new AgentError('timeout') });
    const old = { archive: await gzip(fakeTar(1)), sha256: 'old', savedAt: 1 };
    await t.store.put('u1', old);
    await t.sync.importArchive(await gzip(fakeTar(8))); // as the page does before restarting
    const fresh = new HomeSession({
      agent: t.agent,
      sync: new HomeSync({ userId: 'u1', vm: t.vm, agent: t.agent, store: t.store }),
      linuxUser: 'zed',
      autosaveMs: 300_000,
      env: t.e.env,
      onChange: () => {},
    });
    await fresh.start();
    expect(fresh.snapshot).toMatchObject({
      stage: 'failed',
      failure: 'handshake',
      previousAvailable: true,
      previousSavedAt: 1,
    });
    await fresh.putPreviousBack();
    expect(await t.store.get('u1')).toEqual(old);
  });

  it('put-back is not offered when a save has changed the main entry since the backup', async () => {
    const t = setup({ restoreError: new AgentError('timeout') });
    await t.store.put('u1', { archive: await gzip(fakeTar(1)), sha256: 'old', savedAt: 1 });
    await t.sync.importArchive(await gzip(fakeTar(8)));
    await t.store.put('u1', { archive: await gzip(fakeTar(9)), sha256: 'newer', savedAt: 7 }); // work saved after the restore
    const fresh = new HomeSession({
      agent: t.agent,
      sync: new HomeSync({ userId: 'u1', vm: t.vm, agent: t.agent, store: t.store }),
      linuxUser: 'zed',
      autosaveMs: 300_000,
      env: t.e.env,
      onChange: () => {},
    });
    await fresh.start();
    expect(fresh.snapshot).toMatchObject({ stage: 'failed', previousAvailable: false, previousSavedAt: null });
    expect(await t.store.get('u1:replaced')).toBeNull(); // dropped at start
    await expect(fresh.putPreviousBack()).rejects.toMatchObject({ code: 'previous_stale' });
  });

  it('with storage blocked (in-memory store) the unload prompt asks whenever the desktop is ready', async () => {
    const t = setup({ memory: true });
    await t.session.start();
    await t.session.save();
    expect(t.session.snapshot.storeKind).toBe('memory');
    expect(t.session.snapshot.dirty).toBe(false);
    const ev = new Event('beforeunload', { cancelable: true });
    t.e.fire('win:beforeunload', ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('after a previous_stale refusal the offer is withdrawn from the snapshot', async () => {
    const t = setup({ restoreError: new AgentError('timeout') });
    await t.store.put('u1', { archive: await gzip(fakeTar(1)), sha256: 'old', savedAt: 1 });
    await t.sync.importArchive(await gzip(fakeTar(8)));
    const fresh = new HomeSession({
      agent: t.agent,
      sync: new HomeSync({ userId: 'u1', vm: t.vm, agent: t.agent, store: t.store }),
      linuxUser: 'zed',
      autosaveMs: 300_000,
      env: t.e.env,
      onChange: () => {},
    });
    await fresh.start();
    expect(fresh.snapshot.previousAvailable).toBe(true);
    // Another tab saves over the restored backup while the failure screen is up.
    await t.store.put('u1', { archive: await gzip(fakeTar(9)), sha256: 'newer', savedAt: 7 });
    await expect(fresh.putPreviousBack()).rejects.toMatchObject({ code: 'previous_stale' });
    expect(fresh.snapshot).toMatchObject({ previousAvailable: false, previousSavedAt: null });
  });
});
