import { describe, expect, it, vi } from 'vitest';
import { AgentError } from '../agent';
import { SHARE_ARCHIVE_PATH } from '../agent-protocol';
import { BackupError, HomeSync } from '../home-sync';
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

  describe('replacing the home with a backup', () => {
    it('a put that fails un-suspends, keeps the old archive and reports why', async () => {
      const store = memoryHomeStore();
      const quota = new Error('full');
      quota.name = 'QuotaExceededError';
      let failNext = false;
      const failing: HomeStore = {
        ...store,
        put: async (id, h) => {
          if (failNext && id === 'u1') throw quota;
          return store.put(id, h);
        },
      };
      const { sync, agent } = setup({ store: failing, tars: [fakeTar(2)] });
      const old = { archive: await gzip(fakeTar(1)), sha256: 'old', savedAt: 5 };
      await store.put('u1', old);
      await sync.prepare();
      failNext = true;
      await expect(sync.importArchive(await gzip(fakeTar(8)))).rejects.toMatchObject({
        name: 'BackupError',
        code: 'storage-full',
      });
      expect(await store.get('u1')).toEqual(old);
      failNext = false;
      // Saving works again: the import did not happen.
      expect((await sync.save()).status).toBe('saved');
      expect(agent.save).toHaveBeenCalled();
    });

    it('any other put failure is storage_error; a bad file is invalid and touches nothing', async () => {
      const store = memoryHomeStore();
      const broken: HomeStore = {
        ...store,
        put: async () => {
          throw new Error('boom');
        },
      };
      const a = setup({ store: broken });
      await expect(a.sync.importArchive(await gzip(fakeTar(8)))).rejects.toMatchObject({
        code: 'storage_error',
      });
      const b = setup();
      await b.store.put('u1', { archive: await gzip(fakeTar(1)), sha256: 'old', savedAt: 5 });
      await expect(b.sync.importArchive(new Uint8Array([1, 2]))).rejects.toBeInstanceOf(BackupError);
      await expect(b.sync.importArchive(new Uint8Array([1, 2]))).rejects.toMatchObject({
        code: 'invalid',
      });
      expect((await b.store.get('u1'))!.sha256).toBe('old');
      expect(await b.store.get('u1:replaced')).toBeNull();
    });

    /** A store holding `first`, then a backup imported over it by a session that is then gone. */
    async function restored() {
      const t = setup({ tars: [fakeTar(5)] });
      const first = { archive: await gzip(fakeTar(1)), sha256: 'first', savedAt: 1234 };
      await t.store.put('u1', first);
      await t.sync.prepare();
      const backup = await gzip(fakeTar(8));
      await t.sync.importArchive(backup);
      return { ...t, first, backup };
    }
    /** What the page does next: a new machine, a new HomeSync over the same store. */
    const nextSync = (t: { store: HomeStore; vm: never; agent: never }) =>
      new HomeSync({ userId: 'u1', vm: t.vm, agent: t.agent, store: t.store });

    it('stores the home it replaces under :replaced with the sha of the backup that replaced it', async () => {
      const { store, first, backup } = await restored();
      const replaced = (await store.get('u1:replaced'))!;
      expect(replaced.archive).toEqual(first.archive);
      expect(replaced.savedAt).toBe(1234);
      expect(replaced.forSha).toBe((await store.get('u1'))!.sha256);
      expect((await store.get('u1'))!.archive).toEqual(backup);
    });

    it('put-back is offered (with the time) only while the main entry is still the restored backup', async () => {
      const t = await restored();
      const next = nextSync(t as never);
      await next.prepare(); // the new machine starts: main is still the backup
      expect(await next.previousOffer()).toEqual({ savedAt: 1234 });
    });

    it('put-back swaps main for :replaced, removes :replaced, and keeps no copy of the backup', async () => {
      const t = await restored();
      const next = nextSync(t as never);
      await next.prepare();
      await next.putPreviousBack();
      expect(await t.store.get('u1')).toEqual(t.first);
      expect(await t.store.get('u1:replaced')).toBeNull();
      expect(await t.store.get('u1:damaged')).toBeNull();
      expect(await next.previousOffer()).toBeNull();
    });

    it('after a save changed the main entry put-back is not offered and is refused', async () => {
      const t = await restored();
      // Something else saved over the restored backup (e.g. another session of this account).
      const newer = { archive: await gzip(fakeTar(9)), sha256: 'newer', savedAt: 9999 };
      await t.store.put('u1', newer);
      const next = nextSync(t as never);
      expect(await next.previousOffer()).toBeNull();
      await expect(next.putPreviousBack()).rejects.toMatchObject({ code: 'previous_stale' });
      expect(await t.store.get('u1')).toEqual(newer); // newer work untouched
    });

    it('the first save that changes the main entry clears :replaced, with no user action', async () => {
      const t = await restored(); // the guest will save fakeTar(5); the backup is fakeTar(8)
      const next = nextSync(t as never);
      await next.prepare();
      expect(await t.store.get('u1:replaced')).not.toBeNull();
      expect((await next.save()).status).toBe('saved');
      expect(await t.store.get('u1:replaced')).toBeNull();
      expect(await next.previousOffer()).toBeNull();
    });

    it('a save that leaves the main entry as the backup keeps :replaced', async () => {
      const t = setup({ tars: [fakeTar(8)] }); // the guest saves exactly the backup's tar
      await t.store.put('u1', { archive: await gzip(fakeTar(1)), sha256: 'first', savedAt: 1 });
      await t.sync.prepare();
      await t.sync.importArchive(await gzip(fakeTar(8)));
      const next = new HomeSync({ userId: 'u1', vm: t.vm, agent: t.agent as never, store: t.store });
      await next.prepare();
      expect((await next.save()).status).toBe('unchanged');
      expect(await t.store.get('u1:replaced')).not.toBeNull();
    });

    it('a stale :replaced (its backup no longer the main entry) is dropped at session start', async () => {
      const t = await restored();
      await t.store.put('u1', { archive: await gzip(fakeTar(9)), sha256: 'newer', savedAt: 5 });
      await nextSync(t as never).prepare();
      expect(await t.store.get('u1:replaced')).toBeNull();
    });

    it('a current :replaced survives session start', async () => {
      const t = await restored();
      await nextSync(t as never).prepare();
      expect(await t.store.get('u1:replaced')).not.toBeNull();
    });

    it('a :replaced without forSha is never offered and is dropped at start', async () => {
      const { sync, store } = setup();
      await store.put('u1', { archive: await gzip(fakeTar(1)), sha256: 'x', savedAt: 1 });
      await store.put('u1:replaced', { archive: await gzip(fakeTar(2)), sha256: 'y', savedAt: 2 });
      expect(await sync.previousOffer()).toBeNull();
      await sync.prepare();
      expect(await store.get('u1:replaced')).toBeNull();
    });

    it('a second import before any save keeps the ORIGINAL home as the one previous copy', async () => {
      const t = await restored(); // home P imported over by backup A
      const next = nextSync(t as never);
      await next.prepare();
      const backupB = await gzip(fakeTar(3));
      await next.importArchive(backupB);
      const replaced = (await t.store.get('u1:replaced'))!;
      expect(replaced.archive).toEqual(t.first.archive); // still P, not A
      expect(replaced.forSha).toBe((await t.store.get('u1'))!.sha256); // now for B
      expect((await t.store.get('u1'))!.archive).toEqual(backupB);
    });

    it('import A, import B, put-back: P is back', async () => {
      const t = await restored();
      const second = nextSync(t as never);
      await second.prepare();
      await second.importArchive(await gzip(fakeTar(3)));
      const third = nextSync(t as never);
      await third.prepare();
      expect(await third.previousOffer()).toEqual({ savedAt: 1234 });
      await third.putPreviousBack();
      expect(await t.store.get('u1')).toEqual(t.first);
      expect(await t.store.get('u1:replaced')).toBeNull();
    });

    it('after a save, a new import keeps the saved home (not P) as the previous copy', async () => {
      const t = await restored(); // guest saves fakeTar(5)
      const next = nextSync(t as never);
      await next.prepare();
      expect((await next.save()).status).toBe('saved'); // main is now the saved home, :replaced gone
      const saved = (await t.store.get('u1'))!;
      const after = nextSync(t as never);
      await after.prepare();
      await after.importArchive(await gzip(fakeTar(3)));
      const replaced = (await t.store.get('u1:replaced'))!;
      expect(replaced.archive).toEqual(saved.archive);
      expect(replaced.sha256).toBe(saved.sha256);
    });

    it('a damaged current entry is kept under :damaged when a backup replaces it', async () => {
      const { sync, store } = setup();
      const damaged = { archive: new Uint8Array([9, 9, 9]), sha256: 'bad', savedAt: 1 };
      await store.put('u1', damaged);
      expect(await sync.prepare()).toBe('corrupt');
      await sync.importArchive(await gzip(fakeTar(4)));
      expect(await store.get('u1:replaced')).toBeNull();
      expect(await store.get('u1:damaged')).toEqual(damaged);
    });
  });

  describe('a damaged copy is never discarded', () => {
    const first = { archive: new Uint8Array([9, 9, 9]), sha256: 'first', savedAt: 1 };
    const second = { archive: new Uint8Array([8, 8, 8]), sha256: 'second', savedAt: 2 };

    it('discardDamaged aborts, touching nothing, when an earlier damaged copy exists', async () => {
      const { sync, store } = setup();
      await store.put('u1:damaged', first);
      await store.put('u1', second);
      await expect(sync.discardDamaged()).rejects.toMatchObject({ code: 'damaged_exists' });
      expect(await store.get('u1')).toEqual(second);
      expect(await store.get('u1:damaged')).toEqual(first);
    });

    it('importArchive over an unreadable main entry aborts the same way, and saving still works', async () => {
      const { sync, store, agent } = setup({ tars: [fakeTar(2)] });
      await store.put('u1:damaged', first);
      await store.put('u1', second);
      expect(await sync.prepare()).toBe('corrupt');
      await expect(sync.importArchive(await gzip(fakeTar(4)))).rejects.toMatchObject({
        code: 'damaged_exists',
      });
      expect(await store.get('u1')).toEqual(second);
      expect(await store.get('u1:damaged')).toEqual(first);
      expect(await store.get('u1:replaced')).toBeNull();
      void agent; // not suspended: the instance may still save
    });

    it('after the earlier copy is downloaded and removed, both operations go through', async () => {
      const { sync, store } = setup();
      await store.put('u1:damaged', first);
      await store.put('u1', second);
      expect(Array.from((await sync.exportCopy('damaged'))!)).toEqual([9, 9, 9]);
      await sync.removeCopy('damaged');
      expect(await store.get('u1:damaged')).toBeNull();
      await sync.discardDamaged();
      expect(await store.get('u1:damaged')).toEqual(second);
      expect(await store.get('u1')).toBeNull();
    });

    it('both copies are kept when a later one arrives only after the earlier was removed', async () => {
      const { sync, store } = setup();
      await store.put('u1', first);
      await sync.discardDamaged();
      await store.put('u1', second);
      await expect(sync.discardDamaged()).rejects.toMatchObject({ code: 'damaged_exists' });
      expect(await store.get('u1:damaged')).toEqual(first);
      expect(await store.get('u1')).toEqual(second);
    });
  });

  describe('stored copies', () => {
    it('lists the current archive and the two extras, and exports and removes them', async () => {
      const { sync, store } = setup();
      const cur = { archive: await gzip(fakeTar(1)), sha256: 'c', savedAt: 100 };
      const rep = { archive: await gzip(fakeTar(2)), sha256: 'r', savedAt: 50, forSha: 'c' };
      const dam = { archive: new Uint8Array([9, 9]), sha256: 'd', savedAt: 10 };
      await store.put('u1', cur);
      await store.put('u1:replaced', rep);
      await store.put('u1:damaged', dam);
      expect(await sync.storedCopies()).toEqual({
        current: { size: cur.archive.length, savedAt: 100 },
        replaced: { size: rep.archive.length, savedAt: 50 },
        damaged: { size: 2, savedAt: 10 },
      });
      expect(await sync.exportCopy('current')).toEqual(cur.archive);
      expect(await sync.exportCopy('replaced')).toEqual(rep.archive);
      expect(await sync.exportCopy('damaged')).toEqual(dam.archive);
      await sync.removeCopy('replaced');
      await sync.removeCopy('damaged');
      expect(await sync.storedCopies()).toMatchObject({ replaced: null, damaged: null });
      expect((await sync.storedCopies()).current).not.toBeNull(); // the current one is never removable here
    });

    it('removeCopy refuses anything but replaced or damaged, and never touches the current copy', async () => {
      const { sync, store } = setup();
      const cur = { archive: await gzip(fakeTar(1)), sha256: 'c', savedAt: 100 };
      await store.put('u1', cur);
      await expect(sync.removeCopy('current' as never)).rejects.toThrow();
      await expect(sync.removeCopy('../x' as never)).rejects.toThrow();
      expect(await store.get('u1')).toEqual(cur);
    });

    it('lists nothing for an account with nothing stored', async () => {
      const { sync } = setup();
      expect(await sync.storedCopies()).toEqual({ current: null, replaced: null, damaged: null });
      expect(await sync.exportCopy('damaged')).toBeNull();
    });
  });

  describe('a suspended or disposed instance never writes', () => {
    it('suspend() during a save: the save does not put', async () => {
      const { sync, store, agent } = setup({ tars: [fakeTar(2)] });
      await sync.prepare();
      let release!: () => void;
      agent.save.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ bytes: 1536 });
          }),
      );
      const saving = sync.save();
      sync.suspend();
      // The tar arrives in the share after the guest answers.
      const share = (sync as unknown as { deps: { vm: { writeShareFile: (p: string, d: Uint8Array) => Promise<void> } } }).deps.vm;
      await share.writeShareFile(SHARE_ARCHIVE_PATH, fakeTar(2));
      release();
      expect(await saving).toEqual({ status: 'failed', code: 'suspended' });
      expect(await store.get('u1')).toBeNull();
    });
  });
});
