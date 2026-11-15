import { describe, expect, it, vi } from 'vitest';
import { memoryHomeStore, type CachedHome } from '../home-store';
import { canDeleteFiles, createStoredFiles, machineUp, StoredHome } from '../stored-home';
import { putEntry } from './store-helpers';

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

describe('delete my files', () => {
  it('removes the current archive, the replaced copy and the damaged copy together, and only this account', async () => {
    const store = memoryHomeStore();
    await store.transact([
      { key: 'u1', put: entry(10) },
      { key: 'u1:replaced', put: { ...entry(20), forSha: 'x' } },
      { key: 'u1:damaged', put: entry(30) },
      { key: 'u2', put: entry(99) },
      { key: 'u2:damaged', put: entry(98) },
    ]);
    await createStoredFiles('u1', () => store).deleteAll();
    expect(await store.get('u1')).toBeNull();
    expect(await store.get('u1:replaced')).toBeNull();
    expect(await store.get('u1:damaged')).toBeNull();
    expect(await store.get('u2')).not.toBeNull();
    expect(await store.get('u2:damaged')).not.toBeNull();
  });

  it('is all or nothing: a failed transaction deletes none of them', async () => {
    let failing = false;
    const store = memoryHomeStore({ failTransact: () => (failing ? new Error('boom') : null) });
    await putEntry(store, 'u1', entry(10));
    await putEntry(store, 'u1:damaged', entry(30));
    failing = true;
    await expect(createStoredFiles('u1', () => store).deleteAll()).rejects.toThrow('boom');
    expect(await store.get('u1')).not.toBeNull();
    expect(await store.get('u1:damaged')).not.toBeNull();
  });

  it('the rule: a machine in this tab is stopped first, another tab\'s machine is never touched', () => {
    for (const phase of ['downloading', 'booting', 'session', 'running']) expect(machineUp(phase)).toBe(true);
    for (const phase of ['idle', 'failed', 'stopped']) expect(machineUp(phase)).toBe(false);
    expect(canDeleteFiles({ readOnly: false })).toBe(true);
    expect(canDeleteFiles({ readOnly: true })).toBe(false);
  });
});
