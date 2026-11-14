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

function setup(opts: { tars?: Uint8Array[]; saveError?: AgentError } = {}) {
  const share = new Map<string, Uint8Array>();
  const tars = [...(opts.tars ?? [fakeTar(1)])];
  const agent = {
    save: vi.fn(async () => {
      if (opts.saveError) throw opts.saveError;
      const tar = tars.length > 1 ? tars.shift()! : tars[0]!;
      share.set(SHARE_ARCHIVE_PATH, tar);
      return { bytes: tar.length };
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
  const store = memoryHomeStore();
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

  it('prepare treats a corrupt cached archive as empty', async () => {
    const { sync, store, vm } = setup();
    await store.put('u1', { archive: new Uint8Array([1, 2, 3]), sha256: 'x', savedAt: 1 });
    expect(await sync.prepare()).toBe('empty');
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
});
