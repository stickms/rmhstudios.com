import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendRoll,
  clearRollLog,
  readRollLog,
  ROLL_LOG_MAX,
  ROLL_LOG_PREFIX,
} from '@features/rmhcharacters/engine/roll-log';

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    keys: () => [...m.keys()],
  };
}

const entry = (n: number) => ({ at: n, label: `Roll ${n}`, text: `d20 (${n}) = ${n}`, total: n });

afterEach(() => vi.unstubAllGlobals());

describe('the roll log', () => {
  it('keeps the newest 50 rolls, newest first', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    for (let i = 1; i <= 60; i++) appendRoll('c1', entry(i));
    const log = readRollLog('c1');
    expect(log).toHaveLength(ROLL_LOG_MAX);
    expect(log[0]?.total).toBe(60);
    expect(log[49]?.total).toBe(11);
  });

  it('keeps one log per character under the registered prefix', () => {
    const store = memoryStorage();
    vi.stubGlobal('localStorage', store);
    appendRoll('a', entry(1));
    appendRoll('b', entry(2));
    expect(readRollLog('a').map((e) => e.total)).toEqual([1]);
    expect(readRollLog('b').map((e) => e.total)).toEqual([2]);
    expect(store.keys().sort()).toEqual([`${ROLL_LOG_PREFIX}a`, `${ROLL_LOG_PREFIX}b`]);
    clearRollLog('a');
    expect(readRollLog('a')).toEqual([]);
    expect(readRollLog('b')).toHaveLength(1);
  });

  it('reads empty from a store that throws, and never throws on write', () => {
    const boom = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });
    expect(readRollLog('c1')).toEqual([]);
    expect(() => appendRoll('c1', entry(1))).not.toThrow();
    expect(() => clearRollLog('c1')).not.toThrow();
  });

  it('reads empty from corrupt data and drops malformed entries', () => {
    const store = memoryStorage();
    vi.stubGlobal('localStorage', store);
    store.setItem(`${ROLL_LOG_PREFIX}c1`, '{not json');
    expect(readRollLog('c1')).toEqual([]);
    store.setItem(`${ROLL_LOG_PREFIX}c1`, JSON.stringify({ v: 1, d: [entry(1), { nope: true }] }));
    expect(readRollLog('c1')).toHaveLength(1);
  });

  it('never calls fetch', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('localStorage', memoryStorage());
    appendRoll('c1', entry(1));
    readRollLog('c1');
    clearRollLog('c1');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
