import { describe, expect, it } from 'vitest';
import { isUnseen, markSeen, storageKeyFor, type Release } from '@/lib/whats-new';

const release: Release = { id: 'test-release', version: '1', items: ['voice-calls'] };

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe('whats-new unread state', () => {
  it('is unseen when nothing is stored', () => {
    expect(isUnseen(release, fakeStorage())).toBe(true);
  });

  it('is seen once the release key is stored', () => {
    expect(isUnseen(release, fakeStorage({ [storageKeyFor(release)]: '1' }))).toBe(false);
  });

  it('a new release id is unseen for someone who saw the old one', () => {
    const s = fakeStorage({ [storageKeyFor(release)]: '1' });
    expect(isUnseen({ ...release, id: 'next' }, s)).toBe(true);
  });

  it('markSeen clears the unseen state', () => {
    const s = fakeStorage();
    expect(markSeen(release, s)).toBe(true);
    expect(isUnseen(release, s)).toBe(false);
  });

  it('never shows a dot when storage is missing or throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(isUnseen(release, null)).toBe(false);
    expect(isUnseen(release, throwing)).toBe(false);
    expect(markSeen(release, throwing)).toBe(false);
  });
});
