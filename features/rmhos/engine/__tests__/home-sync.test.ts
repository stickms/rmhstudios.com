import { describe, expect, it, vi } from 'vitest';
import { AgentError } from '../agent';
import { SHARE_ARCHIVE_PATH } from '../agent-protocol';
import { HomeSync } from '../home-sync';
import { memoryHomeStore, type CachedHome, type HomeStore } from '../home-store';

async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** A 1536-byte tar-like blob: ustar header at the start and the end-of-archive blocks. */
function fakeTar(fill: number): Uint8Array {
  const t = new Uint8Array(1536);
  t.fill(fill, 0, 100);
  t.set(new TextEncoder().encode('ustar  \0'), 257);
  return t;
}

function setup(
  opts: {
    tars?: Uint8Array[];
    saveError?: AgentError;
    reportBytes?: number;
    store?: HomeStore;
  } = {},
) {
  const share = new Map<string, Uint8Array>();
  const tars = [...(opts.tars ?? [fakeTar(1)])];
  const agent = {
    save: vi.fn(async () => {
      if (opts.saveError) throw opts.saveError;
      const tar = tars.length > 1 ? tars.shift()! : tars[0]!;
      share.set(SHARE_ARCHIVE_PATH, tar);
      return { bytes: opts.reportBytes ?? tar.length };
    }),
  };
  const vm = {
    writeShareFile: vi.fn(async (p: string, d: Uint8Array) => void share.set(p, d)),
    readShareFile: vi.fn(async (p: string) => {
      const d = share.get(p);
      if (!d) throw new Error('missing');
      return d;
    }),
    deleteShareFile: vi.fn(async (p: string) => void share.delete(p)),
  };
  const store = opts.store ?? memoryHomeStore();
  const sync = new HomeSync({ userId: 'u1', vm, agent: agent as never, store });
  return { share, agent, vm, store, sync };
}

describe('HomeSync', () => {
  it('prepare with nothing cached is empty and leaves the share alone', async () => {
    const { sync, vm } = setup();
    expect(await sync.prepare()).toBe('empty');
    expect(vm.writeShareFile).not.toHaveBeenCalled();
  });

  it('prepare writes the gunzipped tar of a cached archive and says local', async () => {
    const { sync, store, share } = setup();
    const tar = fakeTar(7);
    await store.put('u1', { archive: await gzip(tar), sha256: 'x', savedAt: 1 });
    expect(await sync.prepare()).toBe('local');
    expect(share.get(SHARE_ARCHIVE_PATH)).toEqual(tar);
  });

  it('prepare reports a corrupt cached archive as corrupt', async () => {
    const { sync, store, vm } = setup();
    await store.put('u1', { archive: new Uint8Array([1, 2, 3]), sha256: 'x', savedAt: 1 });
    expect(await sync.prepare()).toBe('corrupt');
    expect(vm.writeShareFile).not.toHaveBeenCalled();
  });

  it('save stores the gzipped tar, removes the share file and reports bytes', async () => {
    const { sync, store, share } = setup();
    const r = await sync.save();
    expect(r.status).toBe('saved');
    const stored = await store.get('u1');
    expect(stored).not.toBeNull();
    expect(await gunzip(stored!.archive)).toEqual(fakeTar(1));
    expect(stored!.sha256).toMatch(/^[0-9a-f]{64}$/);
    if (r.status === 'saved') expect(r.bytes).toBe(stored!.archive.length);
    expect(share.has(SHARE_ARCHIVE_PATH)).toBe(false);
  });

  it('an identical second save is unchanged and does not write again', async () => {
    const { sync, store } = setup();
    const put = vi.spyOn(store, 'put');
    await sync.save();
    expect(await sync.save()).toEqual({ status: 'unchanged' });
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('a changed tar is saved again', async () => {
    const { sync, store } = setup({ tars: [fakeTar(1), fakeTar(2)] });
    await sync.save();
    expect((await sync.save()).status).toBe('saved');
    expect(await gunzip((await store.get('u1'))!.archive)).toEqual(fakeTar(2));
  });

  it('a rejected put is storage-full and keeps the previous entry', async () => {
    const { sync, store } = setup({ tars: [fakeTar(1), fakeTar(2)] });
    await sync.save();
    const before = await store.get('u1');
    vi.spyOn(store, 'put').mockRejectedValue(new DOMException('full', 'QuotaExceededError'));
    expect(await sync.save()).toEqual({ status: 'storage-full' });
    expect(await store.get('u1')).toEqual(before);
  });

  it('an agent error is failed with its code', async () => {
    const { sync, store } = setup({ saveError: new AgentError('save', 'save failed') });
    expect(await sync.save()).toEqual({ status: 'failed', code: 'save' });
    expect(await store.get('u1')).toBeNull();
  });

  it('concurrent saves share one SAVE', async () => {
    const { sync, agent } = setup();
    const [a, b] = await Promise.all([sync.save(), sync.save()]);
    expect(agent.save).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it('asks the browser to persist storage once after the first save', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { persist } });
    try {
      const { sync } = setup({ tars: [fakeTar(1), fakeTar(2)] });
      await sync.save();
      await sync.save();
      expect(persist).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('exportArchive returns what was stored, or null', async () => {
    const { sync, store } = setup();
    expect(await sync.exportArchive()).toBeNull();
    await sync.save();
    expect(await sync.exportArchive()).toEqual((await store.get('u1'))!.archive);
  });

  it('importArchive accepts a gzip of a tar and stores it', async () => {
    const { sync, store } = setup();
    const gz = await gzip(fakeTar(9));
    await sync.importArchive(gz);
    const stored = await store.get('u1');
    expect(stored!.archive).toEqual(gz);
    expect(await sync.prepare()).toBe('local');
  });

  it('importArchive accepts a gzip of an empty archive', async () => {
    const { sync } = setup();
    await expect(sync.importArchive(await gzip(new Uint8Array(1024)))).resolves.toBeUndefined();
    await expect(sync.importArchive(await gzip(new Uint8Array(0)))).resolves.toBeUndefined();
  });

  it('importArchive rejects non-gzip and gzip of garbage, storing nothing', async () => {
    const { sync, store } = setup();
    await expect(sync.importArchive(new TextEncoder().encode('hello'))).rejects.toThrow();
    await expect(
      sync.importArchive(await gzip(new TextEncoder().encode('hello'))),
    ).rejects.toThrow();
    expect(await store.get('u1')).toBeNull();
  });
});

describe('memory home store', () => {
  it('round-trips and deletes', async () => {
    const s: HomeStore = memoryHomeStore();
    const h: CachedHome = { archive: new Uint8Array([1]), sha256: 'a', savedAt: 5 };
    expect(await s.get('x')).toBeNull();
    await s.put('x', h);
    expect(await s.get('x')).toEqual(h);
    await s.delete('x');
    expect(await s.get('x')).toBeNull();
  });

  describe('the stored home is only ever replaced deliberately', () => {
    it('discardDamaged moves a corrupt entry aside and keeps it under :damaged', async () => {
      const { sync, store } = setup();
      const damaged = { archive: new Uint8Array([9, 9, 9]), sha256: 'bad', savedAt: 1 };
      await store.put('u1', damaged);
      expect(await sync.prepare()).toBe('corrupt');
      await sync.discardDamaged();
      expect(await store.get('u1')).toBeNull();
      expect(await store.get('u1:damaged')).toEqual(damaged);
    });

    it('exportArchive hands back the raw damaged bytes', async () => {
      const { sync, store } = setup();
      await store.put('u1', { archive: new Uint8Array([9, 9, 9]), sha256: 'bad', savedAt: 1 });
      expect(Array.from((await sync.exportArchive())!)).toEqual([9, 9, 9]);
    });

    it('import suspends saves: the store keeps the imported archive', async () => {
      const { sync, store, agent } = setup({ tars: [fakeTar(5)] });
      await sync.prepare();
      const backup = await gzip(fakeTar(8));
      await sync.importArchive(backup);
      expect(await sync.save()).toEqual({ status: 'failed', code: 'suspended' });
      expect(agent.save).not.toHaveBeenCalled();
      expect((await store.get('u1'))!.archive).toEqual(backup);
    });

    it('import waits for a save already in flight, then wins', async () => {
      const { sync, store } = setup({ tars: [fakeTar(5)] });
      await sync.prepare();
      const backup = await gzip(fakeTar(8));
      const saving = sync.save();
      await sync.importArchive(backup);
      await saving;
      expect((await store.get('u1'))!.archive).toEqual(backup);
    });

    it('a tar of the wrong length is bad_archive and the store is untouched', async () => {
      const { sync, store } = setup({ reportBytes: 999 });
      await sync.prepare();
      expect(await sync.save()).toEqual({ status: 'failed', code: 'bad_archive' });
      expect(await store.get('u1')).toBeNull();
    });

    it('something that is not a tar is bad_archive', async () => {
      const junk = new Uint8Array(1536).fill(7);
      const { sync, store } = setup({ tars: [junk] });
      await sync.prepare();
      expect(await sync.save()).toEqual({ status: 'failed', code: 'bad_archive' });
      expect(await store.get('u1')).toBeNull();
    });

    it('an empty tar does not replace a non-empty stored home, unless allowed', async () => {
      const { sync, store } = setup({ tars: [new Uint8Array(10240)] });
      const stored = { archive: await gzip(fakeTar(3)), sha256: 'old', savedAt: 1 };
      await store.put('u1', stored);
      await sync.prepare();
      expect(await sync.save()).toEqual({ status: 'failed', code: 'empty_home' });
      expect(await store.get('u1')).toEqual(stored);
      expect((await sync.save({ allowEmpty: true })).status).toBe('saved');
    });

    it('an empty tar may be stored first, or replace an empty one', async () => {
      const { sync } = setup({ tars: [new Uint8Array(10240)] });
      await sync.prepare();
      expect((await sync.save()).status).toBe('saved');
    });

    it('another tab replacing the entry is changed_elsewhere and nothing is written', async () => {
      const { sync, store } = setup({ tars: [fakeTar(2)] });
      await store.put('u1', { archive: await gzip(fakeTar(1)), sha256: 'mine', savedAt: 1 });
      await sync.prepare();
      const theirs = { archive: await gzip(fakeTar(4)), sha256: 'theirs', savedAt: 2 };
      await store.put('u1', theirs);
      expect(await sync.save()).toEqual({ status: 'failed', code: 'changed_elsewhere' });
      expect(await store.get('u1')).toEqual(theirs);
    });

    it('an entry created elsewhere after an empty start is changed_elsewhere too', async () => {
      const { sync, store } = setup({ tars: [fakeTar(2)] });
      await sync.prepare(); // nothing stored
      await store.put('u1', { archive: await gzip(fakeTar(4)), sha256: 'theirs', savedAt: 2 });
      expect(await sync.save()).toEqual({ status: 'failed', code: 'changed_elsewhere' });
    });

    it('its own earlier write is not "elsewhere"', async () => {
      const { sync } = setup({ tars: [fakeTar(1), fakeTar(2)] });
      await sync.prepare();
      expect((await sync.save()).status).toBe('saved');
      expect((await sync.save()).status).toBe('saved');
    });

    it('only a QuotaExceededError is storage-full; anything else is storage_error', async () => {
      const failing = (err: Error): HomeStore => ({
        ...memoryHomeStore(),
        put: async () => {
          throw err;
        },
      });
      const quota = new Error('full');
      quota.name = 'QuotaExceededError';
      const a = setup({ store: failing(quota) });
      await a.sync.prepare();
      expect(await a.sync.save()).toEqual({ status: 'storage-full' });
      const b = setup({ store: failing(new Error('boom')) });
      await b.sync.prepare();
      expect(await b.sync.save()).toEqual({ status: 'failed', code: 'storage_error' });
    });

    it('exportLive gzips the desktop home without writing the store, even when saving is refused', async () => {
      const { sync, store } = setup({ tars: [fakeTar(6)] });
      await store.put('u1', { archive: await gzip(fakeTar(1)), sha256: 'mine', savedAt: 1 });
      await sync.prepare();
      const theirs = { archive: await gzip(fakeTar(4)), sha256: 'theirs', savedAt: 2 };
      await store.put('u1', theirs);
      const live = await sync.exportLive();
      expect(Array.from(await gunzip(live))).toEqual(Array.from(fakeTar(6)));
      expect(await store.get('u1')).toEqual(theirs);
    });
  });
});
