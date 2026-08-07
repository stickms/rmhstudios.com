/**
 * L16 — pack position arithmetic and the wire contract.
 *
 * The sparse positions are the whole reason `position` is an explicit column
 * rather than an array index, so what is asserted here is the property that
 * buys: inserting between two items is one write, and the renumbering path is
 * reached only when the gaps are genuinely used up.
 */

import { describe, expect, it } from 'vitest';
import {
  AUTHORABLE_PACK_KINDS,
  PACK_ITEM_MAX,
  PACK_KINDS,
  PackCreateZ,
  PackItemsZ,
  PackListQueryZ,
  PackUpdateZ,
  POSITION_STEP,
  nextPosition,
  positionBetween,
  resequence,
} from '../packs';

describe('nextPosition', () => {
  it('starts at the step and advances by it', () => {
    expect(nextPosition(null)).toBe(POSITION_STEP);
    expect(nextPosition(undefined)).toBe(POSITION_STEP);
    expect(nextPosition(10)).toBe(20);
    expect(nextPosition(30)).toBe(40);
  });

  it('snaps a position left behind by a renumber back onto the grid', () => {
    expect(nextPosition(15)).toBe(20);
    expect(nextPosition(11)).toBe(20);
  });

  it('never returns something at or below its input', () => {
    for (const last of [0, 1, 9, 10, 99, 1000]) {
      expect(nextPosition(last)).toBeGreaterThan(last);
    }
  });
});

describe('positionBetween', () => {
  it('places an item halfway between two neighbours — one row written', () => {
    expect(positionBetween(10, 20)).toBe(15);
    expect(positionBetween(10, 30)).toBe(20);
  });

  it('handles the two ends', () => {
    expect(positionBetween(null, null)).toBe(POSITION_STEP);
    expect(positionBetween(null, 10)).toBe(0);
    expect(positionBetween(30, null)).toBe(40);
  });

  it('returns null exactly when the gap is exhausted', () => {
    // Adjacent integers have nothing between them; that is the signal to
    // renormalise, and it must be a distinguishable value rather than a
    // collision with an existing position.
    expect(positionBetween(10, 11)).toBeNull();
    expect(positionBetween(10, 10)).toBeNull();
    expect(positionBetween(10, 12)).toBe(11);
  });

  it('survives repeated insertion at the same point before it gives up', () => {
    // The point of the sparse step: three insertions at the same seam still
    // cost one write each.
    let low = 10;
    const high = 20;
    const written: number[] = [];
    for (let i = 0; i < 3; i++) {
      const next = positionBetween(low, high);
      expect(next).not.toBeNull();
      written.push(next!);
      low = next!;
    }
    expect(written).toEqual([15, 17, 18]);
  });
});

describe('resequence', () => {
  it('renumbers onto the sparse grid, restoring the gaps', () => {
    expect(resequence(['a', 'b', 'c'])).toEqual([
      { item: 'a', position: 10 },
      { item: 'b', position: 20 },
      { item: 'c', position: 30 },
    ]);
  });

  it('leaves an empty pack empty', () => {
    expect(resequence([])).toEqual([]);
  });
});

describe('pack kinds', () => {
  it('does not offer `album` as something to author by hand', () => {
    // An album is what a multi-track upload creates. A hand-made one would be
    // a claim about the pack rather than a fact about where it came from.
    expect(PACK_KINDS).toContain('album');
    expect(AUTHORABLE_PACK_KINDS).not.toContain('album');
    for (const kind of AUTHORABLE_PACK_KINDS) expect(PACK_KINDS).toContain(kind);
  });

  it('rejects `album` on the create schema', () => {
    expect(PackCreateZ.safeParse({ title: 'x', kind: 'album' }).success).toBe(false);
    expect(PackCreateZ.safeParse({ title: 'x', kind: 'pack' }).success).toBe(true);
    expect(PackCreateZ.safeParse({ title: 'x', kind: 'course' }).success).toBe(true);
  });
});

describe('wire schemas', () => {
  it('requires a non-empty title and bounds the seed list', () => {
    expect(PackCreateZ.safeParse({ title: '   ' }).success).toBe(false);
    expect(
      PackCreateZ.safeParse({ title: 'ok', songIds: Array(PACK_ITEM_MAX + 1).fill('a') }).success,
    ).toBe(false);
  });

  it('defaults a new pack to unpublished', () => {
    const parsed = PackCreateZ.parse({ title: 'Mix' });
    expect(parsed.isPublic).toBe(false);
    expect(parsed.kind).toBe('pack');
  });

  it('rejects an update that changes nothing', () => {
    expect(PackUpdateZ.safeParse({}).success).toBe(false);
    expect(PackUpdateZ.safeParse({ isPublic: true }).success).toBe(true);
    // `description: null` is a real edit — it clears the field.
    expect(PackUpdateZ.safeParse({ description: null }).success).toBe(true);
  });

  it('rejects an items patch that asks for nothing', () => {
    expect(PackItemsZ.safeParse({}).success).toBe(false);
    expect(PackItemsZ.safeParse({ add: [] }).success).toBe(false);
    expect(PackItemsZ.safeParse({ add: ['song1'] }).success).toBe(true);
    expect(PackItemsZ.safeParse({ order: ['a', 'b'] }).success).toBe(true);
  });

  it('defaults the browse to public packs only', () => {
    expect(PackListQueryZ.parse({}).scope).toBe('public');
    expect(PackListQueryZ.safeParse({ scope: 'everyone' }).success).toBe(false);
  });
});
