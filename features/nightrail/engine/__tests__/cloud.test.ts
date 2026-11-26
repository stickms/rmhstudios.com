/**
 * Nightrail's unlocked lines: the union of this device and the account, never a conflict, always sorted, a guest makes
 * no request, and a stale write is folded in rather than lost.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const storage = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null),
    setItem: (k: string, v: string) => void storage.set(k, String(v)),
    removeItem: (k: string) => void storage.delete(k),
  };
  return { storage };
});

import {
  NIGHTRAIL_STORAGE_KEY,
  nightrailSave,
  normaliseUnlocks,
  persistNightrailUnlocks,
  summarizeNightrailSave,
} from '../cloud';

interface Row {
  saveData: unknown;
  updatedAt: string;
}
const server = {
  row: null as Row | null,
  clock: 0,
  posts: [] as Array<{ saveData: unknown; expectedUpdatedAt: unknown }>,
  stamp() {
    this.clock += 60_000;
    return new Date(Date.UTC(2027, 0, 5, 10, 0, 0) + this.clock).toISOString();
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeFetch(_url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? 'GET';
  if (method === 'GET') {
    return Promise.resolve(json({ saveData: server.row?.saveData ?? null, updatedAt: server.row?.updatedAt ?? null }));
  }
  const body = JSON.parse(init!.body as string) as { saveData: unknown; expectedUpdatedAt?: string | null };
  server.posts.push({ saveData: body.saveData, expectedUpdatedAt: body.expectedUpdatedAt });
  if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== (server.row?.updatedAt ?? null)) {
    return Promise.resolve(json({ error: 'Save changed elsewhere', updatedAt: server.row?.updatedAt ?? null }, 409));
  }
  server.row = { saveData: body.saveData, updatedAt: server.stamp() };
  return Promise.resolve(json({ success: true, updatedAt: server.row.updatedAt }));
}

const local = () => JSON.parse(h.storage.get(NIGHTRAIL_STORAGE_KEY) ?? 'null');

beforeEach(() => {
  h.storage.clear();
  server.row = null;
  server.clock = 0;
  server.posts = [];
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  nightrailSave.setIdentity(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normaliseUnlocks', () => {
  it('is sorted, deduplicated, real lines only, and always opens the first line', () => {
    expect(normaliseUnlocks([3, 1, 3, 9, 'x', null, 2])).toEqual([1, 2, 3]);
    expect(normaliseUnlocks([])).toEqual([1]);
    expect(normaliseUnlocks('nonsense')).toEqual([1]);
    expect(normaliseUnlocks({})).toEqual([1]);
  });

  it('summarises in figures', () => {
    expect(summarizeNightrailSave([1, 2, 3]).headline).toBe('3 of 5 lines');
    expect(summarizeNightrailSave([1, 2, 3]).lines[0]?.value).toBe('3');
  });
});

describe('resolve', () => {
  it('is the union of both copies, sorted, and never a conflict', async () => {
    h.storage.set(NIGHTRAIL_STORAGE_KEY, JSON.stringify([1, 2, 3]));
    server.row = { saveData: [1, 2, 4], updatedAt: server.stamp() };
    nightrailSave.setIdentity('me');
    const choice = await nightrailSave.resolve();
    expect(choice).toEqual({ kind: 'resolved', origin: 'local', save: [1, 2, 3, 4] });
    // This device now holds the union too.
    expect(local()).toEqual([1, 2, 3, 4]);
  });

  it('takes the account copy when it already holds everything, and writes it here', async () => {
    h.storage.set(NIGHTRAIL_STORAGE_KEY, JSON.stringify([1]));
    server.row = { saveData: [1, 2, 3], updatedAt: server.stamp() };
    nightrailSave.setIdentity('me');
    expect(await nightrailSave.resolve()).toEqual({ kind: 'resolved', origin: 'cloud', save: [1, 2, 3] });
    expect(local()).toEqual([1, 2, 3]);
  });

  it('keeps a local-only set as local, and an account-only set as the account', async () => {
    h.storage.set(NIGHTRAIL_STORAGE_KEY, JSON.stringify([1, 2]));
    nightrailSave.setIdentity('me');
    expect(await nightrailSave.resolve()).toEqual({ kind: 'resolved', origin: 'local', save: [1, 2] });

    h.storage.clear();
    server.row = { saveData: [1, 2, 3, 4], updatedAt: server.stamp() };
    expect(await nightrailSave.resolve()).toEqual({ kind: 'resolved', origin: 'cloud', save: [1, 2, 3, 4] });
    expect(local()).toEqual([1, 2, 3, 4]);
  });

  it('is nothing when neither side has anything', async () => {
    nightrailSave.setIdentity('me');
    expect(await nightrailSave.resolve()).toEqual({ kind: 'none' });
  });

  it('survives a garbage account copy', async () => {
    h.storage.set(NIGHTRAIL_STORAGE_KEY, JSON.stringify([1, 2]));
    server.row = { saveData: { not: 'a list' }, updatedAt: server.stamp() };
    nightrailSave.setIdentity('me');
    expect(await nightrailSave.resolve()).toMatchObject({ kind: 'resolved', save: [1, 2] });
  });

  it('a guest makes no request, and a local set stays claimable', async () => {
    h.storage.set(NIGHTRAIL_STORAGE_KEY, JSON.stringify([1, 2]));
    expect(await nightrailSave.resolve()).toEqual({ kind: 'resolved', origin: 'local', save: [1, 2] });
    await persistNightrailUnlocks([1, 2, 3]);
    expect(fetch).not.toHaveBeenCalled();
    expect(local()).toEqual([1, 2, 3]);

    nightrailSave.setIdentity('me');
    const choice = await nightrailSave.resolve();
    expect(choice).toMatchObject({ kind: 'resolved', origin: 'local', save: [1, 2, 3] });
  });
});

describe('persistNightrailUnlocks', () => {
  it('writes this device first, then the account with expectedUpdatedAt', async () => {
    nightrailSave.setIdentity('me');
    server.row = { saveData: [1], updatedAt: server.stamp() };
    await nightrailSave.resolve();
    const before = server.row.updatedAt;

    const kept = await persistNightrailUnlocks(new Set([2, 1]));
    expect(kept).toEqual([1, 2]);
    expect(local()).toEqual([1, 2]);
    expect(server.posts).toHaveLength(1);
    expect(server.posts[0]).toEqual({ saveData: [1, 2], expectedUpdatedAt: before });
  });

  it('a first save for a member with no row sends null', async () => {
    nightrailSave.setIdentity('me');
    await nightrailSave.resolve();
    await persistNightrailUnlocks([1, 2]);
    expect(server.posts[0]?.expectedUpdatedAt).toBeNull();
  });

  it('a stale write is refused, then folded in: nothing opened on either device is lost', async () => {
    nightrailSave.setIdentity('me');
    server.row = { saveData: [1, 2], updatedAt: server.stamp() };
    await nightrailSave.resolve();

    // Another device opens line 3 first.
    server.row = { saveData: [1, 2, 3], updatedAt: server.stamp() };
    const kept = await persistNightrailUnlocks([1, 2, 4]);
    expect(kept).toEqual([1, 2, 3, 4]);
    expect(server.posts).toHaveLength(2);
    expect(server.posts[1]?.saveData).toEqual([1, 2, 3, 4]);
    expect(server.row?.saveData).toEqual([1, 2, 3, 4]);
    expect(local()).toEqual([1, 2, 3, 4]);
  });

  it('offline, the local copy stands', async () => {
    nightrailSave.setIdentity('me');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await nightrailSave.resolve();
    expect(await persistNightrailUnlocks([1, 2])).toEqual([1, 2]);
    expect(local()).toEqual([1, 2]);
  });
});
