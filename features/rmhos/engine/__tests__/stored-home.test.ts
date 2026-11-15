import { describe, expect, it, vi } from 'vitest';
import { memoryHomeStore, type CachedHome } from '../home-store';
import { createStoredFiles, StoredHome } from '../stored-home';

const entry = (n: number, savedAt = n): CachedHome => ({
  archive: new Uint8Array(n),
  sha256: `sha${n}`,
  savedAt,
});

describe('stored files without a machine', () => {
  async function seeded() {
    const store = memoryHomeStore();
    await store.transact([
      { key: 'u1', put: entry(10, 100) },
      { key: 'u1:replaced', put: { ...entry(20, 50), forSha: 'x' } },
      { key: 'u1:damaged', put: entry(30, 25) },
      { key: 'u2', put: entry(99) },
    ]);
    return store;
  }

  it('lists, downloads and removes straight from the store: no HomeSync, agent or VM exists', async () => {
    const store = await seeded();
    const files = createStoredFiles('u1', () => store);
    expect(await files.copies()).toEqual({
      current: { size: 10, savedAt: 100 },
      replaced: { size: 20, savedAt: 50 },
      damaged: { size: 30, savedAt: 25 },
    });
    expect((await files.exportCopy('damaged'))?.length).toBe(30);
    expect((await files.exportCopy('current'))?.length).toBe(10);
    expect(await files.info()).toMatchObject({ savedAt: 100 });
    await files.removeCopy('replaced');
    expect((await files.copies())?.replaced).toBeNull();
    // Another account's files and this account's current archive are untouched.
    expect(await store.get('u2')).not.toBeNull();
    expect((await files.copies())?.current).not.toBeNull();
  });

  it('never removes the current archive, whatever it is asked', async () => {
    const store = await seeded();
    const home = new StoredHome(store, 'u1');
    await expect(home.removeCopy('current' as never)).rejects.toThrow();
    expect(await store.get('u1')).not.toBeNull();
  });

  it('opens nothing until a method is called, and answers "nothing" when signed out', async () => {
    const getStore = vi.fn(() => memoryHomeStore());
    const signedIn = createStoredFiles('u1', getStore);
    expect(getStore).not.toHaveBeenCalled();
    await signedIn.copies();
    expect(getStore).toHaveBeenCalledTimes(1);

    const out = vi.fn(() => memoryHomeStore());
    const signedOut = createStoredFiles(null, out);
    expect(await signedOut.copies()).toBeNull();
    expect(await signedOut.exportCopy('current')).toBeNull();
    expect(await signedOut.info()).toBeNull();
    await signedOut.removeCopy('damaged');
    expect(out).not.toHaveBeenCalled();
  });
});
