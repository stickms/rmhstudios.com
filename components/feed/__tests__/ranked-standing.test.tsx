import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: Record<string, unknown>) => {
      const count = typeof o?.count === 'number' ? o.count : undefined;
      const template = String(
        (count === 1 ? o?.defaultValue_one : count !== undefined ? o?.defaultValue_other : undefined) ??
          o?.defaultValue ??
          _k,
      );
      return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o?.[name] ?? ''));
    },
    i18n: { language: 'en' },
  }),
}));

import { RankedStandingView } from '@/components/feed/RankedStanding';
import type { RankedStandingGame, RankedStandingResponse } from '@/lib/ranked/standing';

const game = (over: Partial<RankedStandingGame>): RankedStandingGame => ({
  game: 'altair',
  name: 'Altair',
  played: true,
  rating: 1300,
  tier: 'Platinum',
  provisional: false,
  placementsLeft: 0,
  wins: 4,
  losses: 2,
  draws: 1,
  place: 12,
  beyondCap: false,
  of: 340,
  shed: 0,
  idleDays: 1,
  ...over,
});

const ready = (games: RankedStandingGame[]) =>
  renderToStaticMarkup(
    <RankedStandingView
      state={{
        kind: 'ready',
        data: { season: 7, endsAt: '2027-02-16T00:00:00.000Z', progress: 0.25, games } as RankedStandingResponse,
      }}
    />,
  );

describe('RankedStandingView', () => {
  it('shows a placed member their rating, tier, record and place', () => {
    const html = ready([game({})]);
    expect(html).toContain('1,300');
    expect(html).toContain('Platinum');
    expect(html).toContain('4W 2L 1D');
    expect(html).toContain('Place 12 of 340');
    expect(html).toContain('aria-valuenow="25"');
    expect(html).toContain('Season 7 ends');
    expect(html).not.toContain('Down ');
  });

  it('says how many placement matches are left, with no place', () => {
    const html = ready([
      game({ rating: null, tier: null, provisional: true, placementsLeft: 2, place: null, of: null }),
    ]);
    expect(html).toContain('Placement: 2 matches left');
    expect(html).toContain('Not on the ladder');
    expect(html).not.toContain('1,300');
  });

  it('uses the singular for one match left', () => {
    const html = ready([
      game({ rating: null, tier: null, provisional: true, placementsLeft: 1, place: null, of: null }),
    ]);
    expect(html).toContain('Placement: 1 match left');
  });

  it('says the rating fell and why after idle days', () => {
    const html = ready([game({ shed: 20, idleDays: 16, rating: 1380 })]);
    expect(html).toContain('Down 20 points: no ranked match in 16 days');
  });

  it('shows a hidden member their numbers and "Not on the ladder"', () => {
    const html = ready([game({ place: null, of: null })]);
    expect(html).toContain('1,300');
    expect(html).toContain('Not on the ladder');
  });

  it('says outside the top 5,000 at the cap', () => {
    const html = ready([game({ place: null, beyondCap: true })]);
    expect(html).toContain('Outside the top 5,000');
  });

  it('lists unplayed games once and says so when none were played', () => {
    const none = ready([game({ played: false, rating: null }), game({ game: 'vega', name: 'Vega', played: false })]);
    expect(none).toContain('No ranked matches this season');
    expect(none).toContain('Not played this season: Altair, Vega');
    const some = ready([game({}), game({ game: 'vega', name: 'Vega', played: false })]);
    expect(some).toContain('Not played this season: Vega');
  });

  it('has loading, error and signed-out states', () => {
    const view = (kind: 'loading' | 'error' | 'signed-out') =>
      renderToStaticMarkup(<RankedStandingView state={{ kind }} />);
    expect(view('loading')).toContain('aria-busy="true"');
    expect(view('error')).toContain('Could not load your standing.');
    expect(view('signed-out')).toContain('Sign in to see your standing this season.');
  });
});
