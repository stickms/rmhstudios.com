import { describe, expect, it } from 'vitest';

import { clearEverything, clearPersonalDeviceData, clearStoreById } from '../clear';
import { countUnsentWork, inspectDevice } from '../inspect';
import { databaseNames, fakeCaches, freshEnv, makeDatabase, openConnection } from './fakes';

async function populate() {
  const env = freshEnv();
  await makeDatabase(env.indexedDB, 'rmh-studio-db', {
    projects: [{ id: 'p1' }, { id: 'p2' }],
    samples: [{ id: 's1', buffer: new ArrayBuffer(2048) }],
    presets: [],
  });
  await makeDatabase(env.indexedDB, 'rmh-drafts', { drafts: [{ key: 'post:new:u1' }] });
  await makeDatabase(env.indexedDB, 'rmh-library-reader', { books: [{ slug: 'a', pages: new ArrayBuffer(4096) }] });
  env.localStorage.setItem('rmh-user-theme', 'night');
  env.localStorage.setItem('rmh-lang-picked-v1', '1');
  env.localStorage.setItem('rmh-compose-draft', '{"text":"half a post"}');
  env.localStorage.setItem('vb-meta', '{}');
  env.localStorage.setItem('rmh-device-clear-on-sign-out', '1');
  env.sessionStorage.setItem('dunesday:session', 'in');
  env.localStorage.setItem('unrelated-key', 'stays');
  return env;
}

describe('inspecting the device', () => {
  it('lists only what exists, with counts and byte sizes where the bytes are the point', async () => {
    const env = await populate();
    const report = await inspectDevice(env);
    const ids = report.stores.map((s) => s.id);
    expect(ids).toContain('studio');
    expect(ids).toContain('offline-caches');
    expect(ids).not.toContain('hearthworks-saves');
    const studio = report.stores.find((s) => s.id === 'studio');
    expect(studio?.parts).toMatchObject({ projects: 2, samples: 1, presets: 0 });
    expect(studio?.bytes).toBeGreaterThanOrEqual(2048);
    expect(report.stores.find((s) => s.id === 'library-reader')?.bytes).toBeGreaterThanOrEqual(4096);
    expect(report.stores.find((s) => s.id === 'drafts')?.bytes).toBeNull();
    expect(report.stores.find((s) => s.id === 'offline-caches')?.count).toBe(5);
    // An unregistered key is never listed.
    expect(report.stores.some((s) => s.id === 'unrelated-key')).toBe(false);
  });

  it('counts the work that exists only on this device', async () => {
    const env = await populate();
    expect(await countUnsentWork(env)).toEqual({ projects: 2, samples: 1, drafts: 2 });
  });

  it('reports an empty browser as empty', async () => {
    const report = await inspectDevice({ ...freshEnv(), caches: fakeCaches({}) });
    expect(report.stores).toEqual([]);
  });
});

describe('clearing one store', () => {
  it('deletes the database itself, so reopening the Studio finds nothing', async () => {
    const env = await populate();
    const result = await clearStoreById('studio', env);
    expect(result).toMatchObject({ cleared: 1, blocked: 0, failed: 0 });
    expect(await databaseNames(env.indexedDB)).not.toContain('rmh-studio-db');
    const reopened = await openConnection(env.indexedDB, 'rmh-studio-db');
    expect(reopened.objectStoreNames.length).toBe(0);
    reopened.close();
    expect(await databaseNames(env.indexedDB)).toContain('rmh-drafts');
  });

  it('removes a prefix line from localStorage and sessionStorage and leaves other keys', async () => {
    const env = await populate();
    await clearStoreById('game-saves', env);
    expect(env.localStorage.getItem('vb-meta')).toBeNull();
    expect(env.sessionStorage.getItem('dunesday:session')).toBeNull();
    expect(env.localStorage.getItem('rmh-user-theme')).toBe('night');
    expect(env.localStorage.getItem('unrelated-key')).toBe('stays');
  });

  it('deletes only the registered caches', async () => {
    const env = await populate();
    await clearStoreById('offline-caches', env);
    expect(await env.caches.keys()).toEqual(['other-cache']);
  });

  it('reports a delete another tab holds open as blocked, for that row only', async () => {
    const env = await populate();
    const held = await openConnection(env.indexedDB, 'rmh-library-reader');
    const result = await clearStoreById('library-reader', env);
    expect(result.blocked).toBe(1);
    expect(result.rows).toEqual([{ storeId: 'library-reader', name: 'rmh-library-reader', status: 'blocked' }]);
    held.close();
    // Once the other tab lets go, the browser finishes the queued delete.
    await new Promise((r) => setTimeout(r, 20));
    expect(await databaseNames(env.indexedDB)).not.toContain('rmh-library-reader');
  });

  it('does not stop at the blocked store when clearing several', async () => {
    const env = await populate();
    const held = await openConnection(env.indexedDB, 'rmh-library-reader');
    const result = await clearEverything(env);
    expect(result.rows.filter((r) => r.status === 'blocked').map((r) => r.storeId)).toEqual(['library-reader']);
    expect(await databaseNames(env.indexedDB)).not.toContain('rmh-studio-db');
    held.close();
  });
});

describe('clearing everything', () => {
  it('removes every registered store, preferences and the sign-out switch included, and nothing else', async () => {
    const env = await populate();
    await clearEverything(env);
    expect(await databaseNames(env.indexedDB)).toEqual([]);
    expect(env.localStorage.getItem('rmh-user-theme')).toBeNull();
    expect(env.localStorage.getItem('rmh-device-clear-on-sign-out')).toBeNull();
    expect(await env.caches.keys()).toEqual(['other-cache']);
    expect(env.localStorage.getItem('unrelated-key')).toBe('stays');
  });
});

describe('the personal-only clear used on sign-out', () => {
  it('keeps the theme, the language and the sign-out switch', async () => {
    const env = await populate();
    await clearPersonalDeviceData({}, env);
    expect(env.localStorage.getItem('rmh-user-theme')).toBe('night');
    expect(env.localStorage.getItem('rmh-lang-picked-v1')).toBe('1');
    expect(env.localStorage.getItem('rmh-device-clear-on-sign-out')).toBe('1');
    expect(env.localStorage.getItem('vb-meta')).toBeNull();
    expect(env.sessionStorage.getItem('dunesday:session')).toBeNull();
    expect(await databaseNames(env.indexedDB)).not.toContain('rmh-library-reader');
    // The offline caches are site assets, not personal.
    expect(await env.caches.keys()).toContain('rmh-static-v1');
  });

  it('keeps Studio work and unsent drafts unless told to delete them', async () => {
    const env = await populate();
    await clearPersonalDeviceData({}, env);
    expect(await databaseNames(env.indexedDB)).toEqual(['rmh-drafts', 'rmh-studio-db']);
    expect(env.localStorage.getItem('rmh-compose-draft')).toContain('half a post');
  });

  it('deletes Studio work and drafts when includeUnsent is true', async () => {
    const env = await populate();
    await clearPersonalDeviceData({ includeUnsent: true }, env);
    expect(await databaseNames(env.indexedDB)).toEqual([]);
    expect(env.localStorage.getItem('rmh-compose-draft')).toBeNull();
    expect(env.localStorage.getItem('rmh-user-theme')).toBe('night');
  });
});
