import { describe, expect, it } from 'vitest';
import {
  decodeUpdatesCursor,
  encodeUpdatesCursor,
  gameGuideLink,
  gameGuidePreview,
  gameIdOfLink,
  gameUpdateLink,
  gameUpdatePreview,
  pageOf,
  UPDATES_PAGE_SIZE,
} from '@/lib/arcade/updates';

const note = (i: number) => ({
  id: `n${i}`,
  createdAt: new Date(1_700_000_000_000 - i * 1000),
});

describe('the updates page cursor', () => {
  it('round-trips a note', () => {
    const n = note(3);
    expect(decodeUpdatesCursor(encodeUpdatesCursor(n))).toEqual({
      at: n.createdAt.getTime(),
      id: 'n3',
    });
  });

  it('reads anything that is not a cursor as the first page', () => {
    for (const bad of [undefined, null, '', 'abc', '12_', '_n1', '12_n 1', "1_n1'; --", `${'9'.repeat(20)}_n1`]) {
      expect(decodeUpdatesCursor(bad)).toBeNull();
    }
  });
});

describe('pageOf', () => {
  it('returns the whole list and no cursor when it fits one page', () => {
    const rows = [note(0), note(1)];
    expect(pageOf(rows)).toEqual({
      items: rows,
      nextCursor: null,
    });
  });

  it('is exactly full with no cursor at the page size, and has one when a row more was read', () => {
    const full = Array.from(
      {
        length: UPDATES_PAGE_SIZE,
      },
      (_, i) => note(i),
    );
    expect(pageOf(full).nextCursor).toBeNull();
    const more = [...full, note(UPDATES_PAGE_SIZE)];
    const page = pageOf(more);
    expect(page.items).toHaveLength(UPDATES_PAGE_SIZE);
    // The cursor names the last row ON the page, so the next page starts after it.
    expect(page.nextCursor).toBe(encodeUpdatesCursor(full[UPDATES_PAGE_SIZE - 1]!));
  });

  it('handles an empty list', () => {
    expect(pageOf([])).toEqual({
      items: [],
      nextCursor: null,
    });
  });
});

describe('notification text', () => {
  it('words a patch note as "<Game> updated to <version>: <title>"', () => {
    expect(gameUpdatePreview('Hearthworks', '2026-10-12', 'Fire sale')).toBe(
      'Hearthworks updated to 2026-10-12: Fire sale',
    );
  });

  it('words a guide as "New guide for <Game>: <title>"', () => {
    expect(gameGuidePreview('Hearthworks', 'Boss tips')).toBe('New guide for Hearthworks: Boss tips');
  });

  it('links a note to the updates page and a guide to itself, and the game is recoverable from either', () => {
    expect(gameUpdateLink('hearthworks')).toBe('/games/hearthworks/updates');
    expect(gameGuideLink('hearthworks', 'g1')).toBe('/games/hearthworks/guides/g1');
    expect(gameIdOfLink(gameUpdateLink('hearthworks'))).toBe('hearthworks');
    expect(gameIdOfLink(gameGuideLink('hearthworks', 'g1'))).toBe('hearthworks');
    expect(gameIdOfLink('/settings/security')).toBeNull();
    expect(gameIdOfLink(null)).toBeNull();
  });
});
