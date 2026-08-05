/**
 * Post kinds (F1) and saved views (B8).
 *
 * Both are pure lookup/normalisation layers whose bugs are quiet rather than
 * loud: a comment sort that is subtly wrong makes an AMA unreadable without
 * erroring, and a saved view that throws on a stale key breaks one person's
 * page in a way nobody else can reproduce.
 */

import { describe, it, expect } from 'vitest';
import {
  rulesFor,
  sortComments,
  answeredSummary,
  isPostKind,
  POST_KINDS,
  type SortableComment,
} from '@/lib/feed/post-kinds';
import {
  parseViewPayload,
  droppedKeys,
  isViewSurface,
  VIEW_SURFACES,
  savedViewInputSchema,
} from '@/lib/views/saved-view';

const NOW = Date.UTC(2026, 7, 5, 12, 0, 0);
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000);

function c(over: Partial<SortableComment> & { id: string }): SortableComment {
  return {
    createdAt: hoursAgo(1),
    score: 0,
    parentId: null,
    answeredByHost: false,
    ...over,
  };
}

describe('post kinds', () => {
  it('declares rules for every kind', () => {
    for (const kind of POST_KINDS) expect(rulesFor(kind).kind).toBe(kind);
  });

  it('falls back to standard for an unknown or absent kind', () => {
    // `kind` is a varchar with a default. A row from an older deploy, or a new
    // kind read by an older client, must render as an ordinary post rather
    // than blanking the thread.
    expect(rulesFor(null).kind).toBe('standard');
    expect(rulesFor(undefined).kind).toBe('standard');
    expect(rulesFor('town-hall').kind).toBe('standard');
    expect(isPostKind('town-hall')).toBe(false);
  });

  it('keeps the big formats shallow', () => {
    // Past two levels a thread renders as a staircase on a phone and the
    // host's answer is indented off the edge.
    expect(rulesFor('megathread').maxDepth).toBeLessThanOrEqual(2);
    expect(rulesFor('ama').maxDepth).toBeLessThanOrEqual(2);
    expect(rulesFor('standard').maxDepth).toBeGreaterThan(2);
  });

  it('sorts a standard thread oldest-first', () => {
    const out = sortComments(
      [c({ id: 'b', createdAt: hoursAgo(1) }), c({ id: 'a', createdAt: hoursAgo(5) })],
      'standard',
      NOW,
    );
    expect(out.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('sorts a megathread by decayed engagement, not raw score', () => {
    // An old high-scoring comment must not pin the top of a live thread.
    const out = sortComments(
      [
        c({ id: 'old', score: 100, createdAt: hoursAgo(24 * 14) }),
        c({ id: 'new', score: 40, createdAt: hoursAgo(1) }),
      ],
      'megathread',
      NOW,
    );
    expect(out[0]!.id).toBe('new');
  });

  it('puts every answered question above every unanswered one — the AMA feature', () => {
    const out = sortComments(
      [
        c({ id: 'loud', score: 500, answeredByHost: false }),
        c({ id: 'quiet', score: 1, answeredByHost: true }),
      ],
      'ama',
      NOW,
    );
    // Score is deliberately not allowed to outrank an answer: the answer is
    // what the reader opened the AMA for.
    expect(out.map((x) => x.id)).toEqual(['quiet', 'loud']);
  });

  it('breaks ties on id so a re-render never reshuffles under the reader', () => {
    const same = [c({ id: 'b' }), c({ id: 'a' }), c({ id: 'c' })];
    const first = sortComments(same, 'megathread', NOW).map((x) => x.id);
    for (let i = 0; i < 10; i++) {
      expect(sortComments(same, 'megathread', NOW).map((x) => x.id)).toEqual(first);
    }
  });

  it('counts only top-level comments as questions', () => {
    const summary = answeredSummary([
      c({ id: 'q1', answeredByHost: true }),
      c({ id: 'q2' }),
      c({ id: 'r1', parentId: 'q1', answeredByHost: true }),
    ]);
    expect(summary).toEqual({ total: 2, answered: 1 });
  });

  it('does not mutate its input', () => {
    const input = [c({ id: 'b' }), c({ id: 'a' })];
    const before = input.map((x) => x.id);
    sortComments(input, 'ama', NOW);
    expect(input.map((x) => x.id)).toEqual(before);
  });
});

describe('saved views', () => {
  it('knows its surfaces', () => {
    for (const s of VIEW_SURFACES) expect(isViewSurface(s)).toBe(true);
    expect(isViewSurface('admin-queue')).toBe(false);
  });

  it('keeps the fields a surface declares', () => {
    const out = parseViewPayload('ladder', { remote: true, minScore: 70 });
    expect(out).toEqual({ remote: true, minScore: 70 });
  });

  it('DROPS a key the surface no longer declares instead of throwing', () => {
    // The whole point. A filter gets removed; every view that mentioned it
    // still has to open. Throwing breaks one person's page with no UI fix.
    const out = parseViewPayload('ladder', { remote: true, seniority: 'staff' });
    expect(out).toEqual({ remote: true });
    expect(droppedKeys('ladder', { remote: true, seniority: 'staff' })).toEqual(['seniority']);
  });

  it('drops a declared key whose VALUE is now invalid, keeping the rest', () => {
    // Per-key parsing, not whole-object: one bad field must not discard a view.
    const out = parseViewPayload('homes', { city: 'Rochester', minBeds: 'three' });
    expect(out).toEqual({ city: 'Rochester' });
  });

  it('survives a payload that is not an object at all', () => {
    for (const junk of [null, undefined, 'nope', 42, []]) {
      expect(parseViewPayload('market', junk)).toEqual({});
      expect(droppedKeys('market', junk)).toEqual([]);
    }
  });

  it('bounds every collection, because a saved view becomes a query', () => {
    const tooMany = { keywords: Array.from({ length: 50 }, (_, i) => `k${i}`) };
    // An unbounded keywords array is an unbounded IN clause.
    expect(parseViewPayload('ladder', tooMany)).toEqual({});
  });

  it('validates create input', () => {
    expect(
      savedViewInputSchema.safeParse({ surface: 'ladder', name: 'Remote', payload: {} }).success,
    ).toBe(true);
    expect(
      savedViewInputSchema.safeParse({ surface: 'nope', name: 'x', payload: {} }).success,
    ).toBe(false);
    expect(
      savedViewInputSchema.safeParse({ surface: 'ladder', name: '   ', payload: {} }).success,
    ).toBe(false);
  });
});
