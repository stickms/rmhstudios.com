import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The resume rail's two rules that no individual source can enforce:
 *
 *  1. **Ranking** — most recent first, one card per destination, cut to the
 *     limit. Five independent sources each hand over their own most-recent list;
 *     nothing but this function knows they overlap, and a rail that shows the
 *     same book twice looks broken in a way none of the sources can see.
 *  2. **Empty means invisible** — a labelled, permanently empty box is the
 *     worst thing a brand-new account can be shown.
 *
 * `resume.server.ts` imports Prisma at module scope, so it is mocked; every
 * function under test here is pure and never reaches for it.
 */

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

import {
  rankResumeCards,
  shouldShowResumeRail,
  describeResumeState,
  RESUME_LIMIT_MAX,
  type ResumeCard,
  type ResumeKind,
} from '@/lib/history/resume.server';

function makeCard(over: Partial<ResumeCard> & { updatedAt: string }): ResumeCard {
  return {
    kind: 'game' as ResumeKind,
    title: 'A game',
    href: '/isleworks?resume=1',
    subtitle: '',
    state: [],
    ...over,
  };
}

describe('rankResumeCards — ordering', () => {
  it('puts the most recently touched card first', () => {
    const ranked = rankResumeCards([
      makeCard({ href: '/a', updatedAt: '2026-08-01T00:00:00.000Z' }),
      makeCard({ href: '/c', updatedAt: '2026-08-05T00:00:00.000Z' }),
      makeCard({ href: '/b', updatedAt: '2026-08-03T00:00:00.000Z' }),
    ]);
    expect(ranked.map((c) => c.href)).toEqual(['/c', '/b', '/a']);
  });

  it('orders across sources, not within them', () => {
    const ranked = rankResumeCards([
      makeCard({ kind: 'deck', href: '/study/d1', updatedAt: '2026-08-02T00:00:00.000Z' }),
      makeCard({ kind: 'read', href: '/library/x', updatedAt: '2026-08-04T00:00:00.000Z' }),
      makeCard({ kind: 'game', href: '/isleworks', updatedAt: '2026-08-03T00:00:00.000Z' }),
    ]);
    expect(ranked.map((c) => c.kind)).toEqual(['read', 'game', 'deck']);
  });
});

describe('rankResumeCards — limiting', () => {
  it('cuts to the requested limit', () => {
    const cards = Array.from({ length: 20 }, (_, i) =>
      makeCard({ href: `/g${i}`, updatedAt: `2026-08-0${(i % 9) + 1}T00:00:00.000Z` }),
    );
    expect(rankResumeCards(cards, 5)).toHaveLength(5);
  });

  it('keeps the NEWEST cards when it cuts, not the first ones handed over', () => {
    const ranked = rankResumeCards(
      [
        makeCard({ href: '/old', updatedAt: '2026-01-01T00:00:00.000Z' }),
        makeCard({ href: '/new', updatedAt: '2026-08-05T00:00:00.000Z' }),
      ],
      1,
    );
    expect(ranked.map((c) => c.href)).toEqual(['/new']);
  });

  it('clamps an absurd limit instead of returning everything', () => {
    const cards = Array.from({ length: 100 }, (_, i) =>
      makeCard({ href: `/g${i}`, updatedAt: '2026-08-05T00:00:00.000Z' }),
    );
    expect(rankResumeCards(cards, 10_000)).toHaveLength(RESUME_LIMIT_MAX);
  });

  it('returns nothing for a zero or nonsense limit', () => {
    const cards = [makeCard({ updatedAt: '2026-08-05T00:00:00.000Z' })];
    expect(rankResumeCards(cards, 0)).toEqual([]);
    expect(rankResumeCards(cards, Number.NaN)).toEqual([]);
  });
});

describe('rankResumeCards — de-duplication and unusable cards', () => {
  it('shows one card per destination, keeping the most recent', () => {
    const ranked = rankResumeCards([
      makeCard({ kind: 'read', href: '/library/x', updatedAt: '2026-08-01T00:00:00.000Z' }),
      makeCard({ kind: 'read', href: '/library/x', updatedAt: '2026-08-05T00:00:00.000Z' }),
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].updatedAt).toBe('2026-08-05T00:00:00.000Z');
  });

  it('treats the same path under different kinds as different cards', () => {
    const ranked = rankResumeCards([
      makeCard({ kind: 'read', href: '/library/x', updatedAt: '2026-08-01T00:00:00.000Z' }),
      makeCard({ kind: 'watch', href: '/library/x', updatedAt: '2026-08-02T00:00:00.000Z' }),
    ]);
    expect(ranked).toHaveLength(2);
  });

  it('drops a card that cannot say what it is or go anywhere', () => {
    const ranked = rankResumeCards([
      makeCard({ title: '', href: '/a', updatedAt: '2026-08-05T00:00:00.000Z' }),
      makeCard({ title: '   ', href: '/b', updatedAt: '2026-08-05T00:00:00.000Z' }),
      makeCard({ title: 'Fine', href: '', updatedAt: '2026-08-05T00:00:00.000Z' }),
      makeCard({ title: 'Fine', href: '/ok', updatedAt: '2026-08-05T00:00:00.000Z' }),
    ]);
    expect(ranked.map((c) => c.href)).toEqual(['/ok']);
  });

  it('does not mutate the caller list', () => {
    const cards = [
      makeCard({ href: '/a', updatedAt: '2026-08-01T00:00:00.000Z' }),
      makeCard({ href: '/b', updatedAt: '2026-08-05T00:00:00.000Z' }),
    ];
    rankResumeCards(cards);
    expect(cards.map((c) => c.href)).toEqual(['/a', '/b']);
  });
});

describe('the empty rail is no rail', () => {
  it('shouldShowResumeRail is false for an empty list', () => {
    expect(shouldShowResumeRail([])).toBe(false);
    expect(shouldShowResumeRail(rankResumeCards([]))).toBe(false);
  });

  it('is true as soon as there is one thing to resume', () => {
    expect(shouldShowResumeRail([makeCard({ updatedAt: '2026-08-05T00:00:00.000Z' })])).toBe(true);
  });

  /**
   * A source check, in the spirit of `design-consistency.test.ts`: the rule only
   * matters where it is rendered, and a unit test of a predicate the component
   * does not call would pass forever while the component grew an empty state.
   */
  it('ResumeRail returns null rather than rendering an empty rail', () => {
    const src = readFileSync(join(process.cwd(), 'components', 'feed', 'ResumeRail.tsx'), 'utf8');
    expect(
      /length\s*===\s*0\)\s*return null/.test(src),
      'components/feed/ResumeRail.tsx must early-return `null` when it has no cards. ' +
        'An empty resume rail on a new account is a labelled empty box that says the ' +
        'product is broken before the user has done anything — worse than no rail.',
    ).toBe(true);
  });
});

describe('describeResumeState — the subtitle is state, never a date', () => {
  it('renders where you were, not when', () => {
    expect(describeResumeState([{ at: 'level', value: 7 }])).toBe('Level 7');
    expect(describeResumeState([{ at: 'due', value: 12 }])).toBe('12 due');
    expect(describeResumeState([{ at: 'percent', value: 40 }])).toBe('40% read');
  });

  it('joins several facts with the site separator', () => {
    expect(
      describeResumeState([
        { at: 'level', value: 7 },
        { at: 'timeLeft', value: 720 },
      ]),
    ).toBe('Level 7 · 12m left');
  });

  it('is empty when a source knew nothing about the state', () => {
    expect(describeResumeState([])).toBe('');
  });
});
