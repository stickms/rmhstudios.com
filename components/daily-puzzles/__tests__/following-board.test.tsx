// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; defaultValue_one?: string; count?: number; [k: string]: unknown }) => {
      const text = o.count === 1 && o.defaultValue_one ? o.defaultValue_one : o.defaultValue;
      return text.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name]));
    },
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

import { BoardTabs, FollowingBoardList, FollowingSummaryLine } from '../FollowingBoard';
import type { FollowingBoardEntry } from '@/lib/daily-puzzles/following.contract';

const entry = (over: Partial<FollowingBoardEntry>): FollowingBoardEntry => ({
  rank: 1,
  isYou: false,
  score: 0,
  moves: null,
  dnf: false,
  hintUsed: false,
  timeSeconds: null,
  displayName: 'Ann',
  avatar: null,
  solvedAt: '2026-11-23T12:00:00.000Z',
  ...over,
});

describe('FollowingBoardList', () => {
  it('explains an empty board and links to the follows page', () => {
    const html = renderToStaticMarkup(
      <FollowingBoardList gameMode="alibi" entries={[]} loading={false} failed={false} />,
    );
    expect(html).toContain('No friends have finished this puzzle yet.');
    expect(html).toContain('Friends are people you follow who follow you back.');
    expect(html).toContain('href="/follows"');
    expect(html).not.toContain('<ol');
  });

  it('shows the viewer alone with the same explanation', () => {
    const html = renderToStaticMarkup(
      <FollowingBoardList
        gameMode="alibi"
        entries={[entry({ isYou: true, displayName: 'Me', score: 12 })]}
        loading={false}
        failed={false}
      />,
    );
    expect(html).toContain('None of your friends have finished this puzzle yet.');
    expect(html).toContain('12 pts');
    expect(html).toContain('>You<');
  });

  it('names each member and the result in text, by the mode axis', () => {
    const lights = renderToStaticMarkup(
      <FollowingBoardList
        gameMode="lights-out"
        entries={[
          entry({ rank: 1, displayName: 'Ann', moves: 9 }),
          entry({ rank: 2, displayName: 'Me', isYou: true, moves: 14 }),
          entry({ rank: 3, displayName: 'Bob', moves: 2, dnf: true }),
        ]}
        loading={false}
        failed={false}
      />,
    );
    expect(lights).toContain('<bdi>Ann</bdi>');
    expect(lights).toContain('9 moves');
    expect(lights).toContain('14 moves');
    expect(lights).toContain('DNF');
    expect(lights).not.toContain('Friends are people you follow');

    const globe = renderToStaticMarkup(
      <FollowingBoardList gameMode="globeset" entries={[entry({ timeSeconds: 75 })]} loading={false} failed={false} />,
    );
    expect(globe).toContain('1:15');
  });

  it('shows a spinner while loading and a message on failure', () => {
    expect(
      renderToStaticMarkup(<FollowingBoardList gameMode="alibi" entries={undefined} loading failed={false} />),
    ).not.toContain('No friends');
    const failed = renderToStaticMarkup(
      <FollowingBoardList gameMode="alibi" entries={undefined} loading={false} failed />,
    );
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('Could not load your friends&#x27; results.');
  });
});

describe('BoardTabs', () => {
  it('offers Everyone and Friends as tabs', () => {
    const html = renderToStaticMarkup(<BoardTabs value="friends" onChange={() => {}} />);
    expect(html).toContain('Everyone');
    expect(html).toContain('Friends');
    expect(html).toContain('role="tab"');
  });
});

describe('FollowingSummaryLine', () => {
  it('says how many friends finished, the best of them and your own result', () => {
    const html = renderToStaticMarkup(
      <FollowingSummaryLine
        summary={{
          gameMode: 'alibi',
          finished: 4,
          best: { displayName: 'Ann', score: 90, moves: null, timeSeconds: null },
          you: { score: 60, moves: null, dnf: false, timeSeconds: null },
        }}
      />,
    );
    expect(html).toContain('4 friends finished');
    expect(html).toContain('<bdi>Ann</bdi>');
    expect(html).toContain('90 pts');
    expect(html).toContain('60 pts');
  });

  it('carries the id a hub card points aria-describedby at', () => {
    const html = renderToStaticMarkup(
      <FollowingSummaryLine id="sum-1" summary={{ gameMode: 'alibi', finished: 0, best: null, you: null }} />,
    );
    expect(html).toContain('id="sum-1"');
  });

  it('uses the singular and says so when nobody has finished', () => {
    const one = renderToStaticMarkup(
      <FollowingSummaryLine
        summary={{
          gameMode: 'lights-out',
          finished: 1,
          best: { displayName: 'Ann', score: 0, moves: 1, timeSeconds: null },
          you: null,
        }}
      />,
    );
    expect(one).toContain('1 friend finished');
    expect(one).toContain('1 move');
    const none = renderToStaticMarkup(
      <FollowingSummaryLine summary={{ gameMode: 'alibi', finished: 0, best: null, you: null }} />,
    );
    expect(none).toContain('No friends have finished yet');
  });
});
