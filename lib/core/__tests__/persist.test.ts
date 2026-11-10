import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persisted, readJson, readString, removeKey, writeJson, writeString } from '../persist';

function fakeStorage(opts: { throws?: boolean } = {}): Storage {
  const m = new Map<string, string>();
  const boom = () => {
    throw new Error('blocked');
  };
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => (opts.throws ? boom() : (m.get(k) ?? null)),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => (opts.throws ? boom() : void m.delete(k)),
    setItem: (k: string, v: string) => (opts.throws ? boom() : void m.set(k, v)),
  };
}

function stub(local: Storage, session: Storage = fakeStorage()) {
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
}

describe('persist', () => {
  beforeEach(() => stub(fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips JSON and returns the fallback when absent', () => {
    expect(readJson('k', { n: 0 })).toEqual({ n: 0 });
    expect(writeJson('k', { n: 3 })).toBe(true);
    expect(readJson('k', { n: 0 })).toEqual({ n: 3 });
    removeKey('k');
    expect(readJson('k', 'x')).toBe('x');
  });

  it('corrupt JSON and failed validation read as the fallback', () => {
    writeString('k', '{nope');
    expect(readJson('k', 7)).toBe(7);
    writeJson('k', 'text');
    expect(readJson<number>('k', 7, { validate: (v) => (typeof v === 'number' ? v : undefined) })).toBe(7);
  });

  it('session storage is separate', () => {
    writeString('k', 'a');
    writeString('k', 'b', { storage: 'session' });
    expect([readString('k'), readString('k', { storage: 'session' })]).toEqual(['a', 'b']);
  });

  it('never throws when storage is blocked or absent', () => {
    stub(fakeStorage({ throws: true }));
    expect(readJson('k', 1)).toBe(1);
    expect(writeJson('k', 2)).toBe(false);
    expect(() => removeKey('k')).not.toThrow();
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', undefined);
    expect(readJson('k', 1)).toBe(1);
    expect(writeString('k', 'v')).toBe(false);
  });

  it('writeJson is false for unserialisable values', () => {
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    expect(writeJson('k', cyc)).toBe(false);
  });

  it('persisted() versions, migrates, and rejects newer data', () => {
    const v1 = persisted({ key: 'p', fallback: { a: 0 }, version: 1 });
    v1.write({ a: 5 });
    const v2 = persisted<{ a: number; b: number }>({
      key: 'p',
      fallback: { a: 0, b: 0 },
      version: 2,
      migrate: (d, from) => (from === 1 ? { ...(d as { a: number }), b: 9 } : d),
    });
    expect(v2.read()).toEqual({ a: 5, b: 9 });
    v2.write({ a: 1, b: 2 });
    expect(v1.read()).toEqual({ a: 0 }); // written by a newer build: fallback
    v2.clear();
    expect(v2.read()).toEqual({ a: 0, b: 0 });
  });
});
