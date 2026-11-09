import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeStorage } from './Providers';

// Providers' theme effects go through `safeStorage`; storage that throws on any access (Safari
// with "Block all cookies") or on writes (a full quota) once crashed every page into the error
// boundary. This pins the contract those effects rely on: nothing here ever throws.
describe('Providers safeStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes through to localStorage when it works', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    });
    safeStorage.setItem('a', '1');
    expect(safeStorage.getItem('a')).toBe('1');
    safeStorage.removeItem('a');
    expect(safeStorage.getItem('a')).toBeNull();
  });

  it('a full quota drops the write instead of throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      removeItem: () => {},
    });
    expect(() => safeStorage.setItem('a', '1')).not.toThrow();
  });

  it('storage that throws on every access reads as empty and ignores writes', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.stubGlobal('localStorage', {
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
    });
    expect(safeStorage.getItem('a')).toBeNull();
    expect(() => safeStorage.setItem('a', '1')).not.toThrow();
    expect(() => safeStorage.removeItem('a')).not.toThrow();
  });

  it('no localStorage at all (it is not defined) also reads as empty', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(safeStorage.getItem('a')).toBeNull();
    expect(() => safeStorage.setItem('a', '1')).not.toThrow();
  });
});
