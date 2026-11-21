/**
 * What a shared result says, under a real i18next instance with no catalog (every string is its
 * `t()` default). The share dialog shows exactly what will be public, so in English its lines are
 * the card's lines (`cardLines`, the server's English).
 */
import { describe, expect, it } from 'vitest';
import { createInstance, type TFunction } from 'i18next';
import { cardLines, dailyPayload, songPayload } from '@/lib/rmhmusic/learn/social/share';
import { sharedPageState, shareExpiryLine, shareLinkLabel, shareText } from './share-text';

const i18n = createInstance();
void i18n.init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {},
  initAsync: false,
  interpolation: {
    escapeValue: false,
  },
});
const t = i18n.t.bind(i18n) as unknown as TFunction<'c-rmhmusic'>;

const result = (correct: boolean, skipped = false) => ({
  correct,
  skipped,
});
const daily = dailyPayload({
  date: '2026-11-15',
  score: 92,
  avgMs: 912,
  played: 30,
  skipped: 0,
  results: Array.from(
    {
      length: 30,
    },
    (_, i) => result(i < 28),
  ),
})!;
const chordless = dailyPayload({
  date: '2026-11-15',
  score: 88,
  avgMs: 1450,
  played: 20,
  skipped: 10,
  results: [
    ...Array.from(
      {
        length: 20,
      },
      () => result(true),
    ),
    ...Array.from(
      {
        length: 10,
      },
      () => result(false, true),
    ),
  ],
})!;
const song = songPayload(
  {
    songId: 'ode-to-joy',
    mode: 'play',
    bestScore: 98,
  },
  'guitar',
)!;
const wait = songPayload(
  {
    songId: 'ode-to-joy',
    mode: 'wait',
    bestScore: 61,
  },
  'voice',
)!;

describe('share-text', () => {
  it('says in English exactly what the card says', () => {
    for (const p of [daily, chordless, song, wait]) expect(shareText(t, 'en-GB', p)).toEqual(cardLines(p));
  });

  it('dates a Daily result in the viewer’s locale, in UTC', () => {
    expect(shareText(t, 'de', daily).lead).toContain('2026');
    expect(shareText(t, 'en-US', daily).lead).toBe('Daily sight reading · Nov 15, 2026');
  });

  it('names a link in the list by what it shares', () => {
    expect(shareLinkLabel(t, 'en-GB', daily)).toBe('Daily sight reading · 15 Nov 2026');
    expect(shareLinkLabel(t, 'en-GB', song)).toBe('Ode to Joy — Ludwig van Beethoven, Play along');
  });

  it('says when a link stops working', () => {
    expect(shareExpiryLine(t, 'en-GB', '2027-02-14T12:00:00.000Z')).toBe('Works until 14 Feb 2027');
  });
});

describe('sharedPageState', () => {
  const live = {
    state: 'live' as const,
    mine: false,
    payload: {
      v: 1 as const,
      kind: 'daily' as const,
      date: '2026-11-15',
      score: 92,
      stars: 2,
      right: 28,
      played: 30,
      skipped: 0,
      avgMs: 912,
    },
    lines: {
      lead: 'Daily sight reading · 15 Nov 2026',
      title: '92 points',
      subtitle: '28 of 30 right · 0.9 s a note',
      stars: '2 of 3 stars',
    },
    name: null,
    image: null,
    today: false,
  };

  it('is pending while nothing has arrived', () => {
    expect(
      sharedPageState({
        data: undefined,
        isError: false,
      }),
    ).toBe('pending');
  });

  it('is an error, not "gone", when the request failed (a 429, a 5xx, offline)', () => {
    expect(
      sharedPageState({
        data: undefined,
        isError: true,
      }),
    ).toBe('error');
  });

  it("is gone only on the server's own gone answer", () => {
    expect(
      sharedPageState({
        data: {
          state: 'gone',
        },
        isError: false,
      }),
    ).toBe('gone');
  });

  it('keeps what it showed when a later refetch fails', () => {
    expect(
      sharedPageState({
        data: live,
        isError: true,
      }),
    ).toBe('live');
    expect(
      sharedPageState({
        data: {
          state: 'gone',
        },
        isError: true,
      }),
    ).toBe('gone');
  });

  it('is live on a live answer', () => {
    expect(
      sharedPageState({
        data: live,
        isError: false,
      }),
    ).toBe('live');
  });
});
