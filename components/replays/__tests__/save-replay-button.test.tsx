import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/** The Save replay button's states (rendered with react-dom/server) and the composer link "Post it" opens. */

const state = vi.hoisted(() => ({ session: null as null | { user: { id: string } } }));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => () => {},
  Link: ({ to, children, className }: { to: string; children: unknown; className?: string }) => (
    <a href={to} className={className}>
      {children as never}
    </a>
  ),
}));
vi.mock('@/components/Providers', () => ({ useSession: () => ({ data: state.session, isPending: false }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string }) => o.defaultValue,
  }),
}));
vi.mock('@/lib/toast', () => ({ toast: { success: () => {}, error: () => {} } }));
vi.mock('@/lib/contract/client', () => ({ api: async () => ({ id: 'r1' }) }));

import { SaveReplayButton } from '@/components/replays/SaveReplayButton';
import { replayPageUrl, replayShareSearch } from '@/lib/game/replay-share';

const data = { seed: 20261122, inputs: [[0, 0]] as [number, number][] };
const render = () => renderToStaticMarkup(<SaveReplayButton game="lights-out" data={data} durationMs={1000} />);

beforeEach(() => {
  state.session = null;
});

describe('SaveReplayButton', () => {
  it('tells a signed-out player to sign in, and offers no save', () => {
    const html = render();
    expect(html).toContain('Sign in to save a replay');
    expect(html).not.toContain('<button');
    expect(html).toContain('href="/login"');
  });

  it('offers Save replay to a signed-in player, never saving on its own', () => {
    state.session = { user: { id: 'u1' } };
    const html = render();
    expect(html).toContain('Save replay');
    expect(html).toContain('<button');
    expect(html).not.toContain('Post it');
  });
});

describe('the composer link', () => {
  it('is built from the translated text and the replay page', () => {
    expect(
      replayShareSearch({
        text: ' Lights Out, 2026-11-22: solved in 9 moves ',
        origin: 'https://rmhstudios.com',
        id: 'abc',
      }),
    ).toEqual({
      title: '',
      text: 'Lights Out, 2026-11-22: solved in 9 moves',
      url: 'https://rmhstudios.com/replays/abc',
      pending: '',
    });
  });

  it('keeps text in another language as it is, and drops a trailing slash from the origin', () => {
    expect(replayPageUrl('http://localhost:7005/', 'x1')).toBe('http://localhost:7005/replays/x1');
    expect(replayShareSearch({ text: 'Lights Out, 2026-11-22: 9 Züge', origin: 'https://a.test', id: 'x1' }).text).toBe(
      'Lights Out, 2026-11-22: 9 Züge',
    );
  });
});
