import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name])),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children }: { to: string; params?: Record<string, string>; children: React.ReactNode }) => (
    <a href={to.replace(/\$(\w+)/g, (_m, k: string) => params?.[k] ?? '')}>{children}</a>
  ),
}));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({}) }));

import { FriendActivityView } from '../FriendActivity';
import type { FriendActivity } from '@/lib/games/activity-types';

const user = { userId: 'u1', handle: 'ann', name: 'Ann', image: null };
const data = (over: Partial<FriendActivity>): FriendActivity => ({ followed: 2, inGame: [], events: [], ...over });

describe('FriendActivityView', () => {
  it('renders nothing for a member who follows nobody', () => {
    expect(renderToStaticMarkup(<FriendActivityView data={data({ followed: 0 })} timeZone="UTC" />)).toBe('');
  });

  it('says so when the people they follow have nothing to show', () => {
    const html = renderToStaticMarkup(<FriendActivityView data={data({})} timeZone="UTC" />);
    expect(html).toContain('Nobody you follow has played lately.');
  });

  it('shows a loading state and an error state', () => {
    expect(renderToStaticMarkup(<FriendActivityView data={undefined} loading timeZone="UTC" />)).toContain(
      'friends-loading',
    );
    expect(renderToStaticMarkup(<FriendActivityView data={undefined} failed timeZone="UTC" />)).toContain(
      'Could not load',
    );
  });

  it('lists who is playing now with a link to the game', () => {
    const html = renderToStaticMarkup(
      <FriendActivityView
        data={data({ inGame: [{ user, game: { gameId: 'g1', title: 'Game One' } }] })}
        timeZone="UTC"
      />,
    );
    expect(html).toContain('Playing now');
    expect(html).toContain('<bdi>Ann</bdi>');
    expect(html).toContain('is playing Game One');
    expect(html).toContain('href="/games/g1"');
  });

  it('lists events under day headings, each a link', () => {
    const html = renderToStaticMarkup(
      <FriendActivityView
        data={data({
          events: [
            {
              id: 'e1',
              kind: 'achievement',
              at: '2026-11-20T10:00:00Z',
              user,
              gameId: '',
              gameTitle: '',
              detail: 'First Win',
            },
            {
              id: 'e2',
              kind: 'thread',
              at: '2026-11-19T10:00:00Z',
              user,
              gameId: 'g1',
              gameTitle: 'Game One',
              detail: 'Tips',
              threadId: 't1',
            },
          ],
        })}
        timeZone="UTC"
      />,
    );
    expect(html).toContain('Friday, November 20, 2026');
    expect(html).toContain('Thursday, November 19, 2026');
    expect(html).toContain('unlocked First Win');
    expect(html).toContain('href="/games/profile/ann"');
    expect(html).toContain('href="/games/hub/g1/t/t1"');
    expect(html).toContain('started a thread in Game One');
  });
});
