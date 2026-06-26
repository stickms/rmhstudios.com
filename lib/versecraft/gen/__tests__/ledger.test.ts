import { describe, it, expect } from 'vitest';
import { fallbackWorld, fallbackChapter } from '../fallback';
import { fallbackLedgerEntry, compactLedger, renderLedger } from '../ledger';
import type { LedgerEntry } from '../world-types';

const world = fallbackWorld('ember-tide-hush-417', '');

describe('fallbackLedgerEntry', () => {
  it('produces a well-formed entry for the chapter index', () => {
    const chapter = fallbackChapter(world, 0);
    const entry = fallbackLedgerEntry(world, chapter);
    expect(entry.index).toBe(0);
    expect(entry.summary.length).toBeGreaterThan(0);
    expect(Array.isArray(entry.facts)).toBe(true);
  });
});

describe('compactLedger', () => {
  it('keeps recent entries verbatim and digests the rest', () => {
    const entries: LedgerEntry[] = Array.from({ length: 7 }, (_, i) => ({
      index: i, summary: `Ch${i}`, revealed: [], threadsOpened: [], threadsClosed: [],
      relationshipShifts: [], facts: [],
    }));
    const { digest, recent } = compactLedger(entries, 4);
    expect(recent).toHaveLength(4);
    expect(recent.map((e) => e.index)).toEqual([3, 4, 5, 6]);
    expect(digest).toContain('Ch0');
    expect(digest).toContain('Ch2');
  });

  it('returns no digest when within the keep window', () => {
    const entries: LedgerEntry[] = [{ index: 0, summary: 'A', revealed: [], threadsOpened: [], threadsClosed: [], relationshipShifts: [], facts: [] }];
    const { digest, recent } = compactLedger(entries, 4);
    expect(digest).toBe('');
    expect(recent).toHaveLength(1);
  });
});

describe('renderLedger', () => {
  it('is empty for no entries', () => {
    expect(renderLedger([])).toBe('');
  });
  it('includes a STORY SO FAR header when entries exist', () => {
    const entry = fallbackLedgerEntry(world, fallbackChapter(world, 0));
    expect(renderLedger([entry])).toContain('STORY SO FAR');
  });
});
