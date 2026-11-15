/**
 * PostDetail characterization (A6, batch 4). The single-post page is split into
 * `post-detail/*` state, hooks and sub-components; this suite pins the
 * server-rendered markup of every visible state so the split is provably
 * markup-neutral.
 *
 * renderToString runs no effects, so non-default states are reached by seeding
 * `useState` by call ordinal (see `S`). `S` is the only part of this file that
 * depends on how the page is factored.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

// The full timestamp is formatted in the runner's zone; pin it so snapshots are portable.
process.env.TZ = 'UTC';

const ctl = vi.hoisted(() => ({
  n: 0,
  seeds: new Map<number, unknown>(),
  session: { user: { id: 'me', name: 'Me', image: '/me.png' } } as unknown,
  resolved: null as unknown,
}));

vi.mock('react', async (orig) => {
  const actual = await orig<typeof import('react')>();
  return {
    ...actual,
    useState: ((init: unknown) => {
      const i = ctl.n++;
      return (actual.useState as (v: unknown) => unknown)(
        ctl.seeds.has(i) ? ctl.seeds.get(i) : init,
      );
    }) as typeof actual.useState,
  };
});
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      String(o?.defaultValue ?? k).replace(/\{\{(\w+)\}\}/g, (_, v) => String(o?.[v] ?? '')),
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    className,
    search,
  }: {
    children: unknown;
    to: unknown;
    className?: string;
    search?: unknown;
  }) => (
    <a href={String(to)} className={className} data-search={JSON.stringify(search ?? null)}>
      {children as never}
    </a>
  ),
  useNavigate: () => () => undefined,
  useLocation: ({ select }: { select: (l: { pathname: string }) => unknown }) =>
    select({ pathname: '/rmharks/p1' }),
}));
vi.mock('@/lib/toast', () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock('@/components/Providers', () => ({
  useSession: () => ({ data: ctl.session }),
  useResolvedUser: () => ({ resolved: ctl.resolved }),
}));
vi.mock('@/stores/userDisplayStore', () => ({
  useFreshUser: (u: unknown) => u,
  useUserDisplayStore: { getState: () => ({ setUsers: () => undefined }) },
}));
vi.mock('@/components/safety/use-reconsider', () => ({
  useReconsider: () => async () => null,
}));
vi.mock('@/lib/route/intent-fetch', () => ({
  peekIntentFetch: () => undefined,
  takeOrFetch: async () => ({ status: 500, data: null }),
}));
vi.mock('@/lib/feed/post-detail-prefetch', () => ({
  postBodyUrl: (id: string) => `body:${id}`,
  postCommentsUrl: (id: string) => `comments:${id}`,
}));

function marker(name: string) {
  return (props: Record<string, unknown>) => (
    <div
      data-stub={name}
      data-props={JSON.stringify(props, (_k, v) => (typeof v === 'function' ? '[fn]' : v))}
    />
  );
}
function wrapper(name: string) {
  return ({ children, ...props }: Record<string, unknown>) => (
    <div
      data-stub={name}
      data-props={JSON.stringify(props, (_k, v) => (typeof v === 'function' ? '[fn]' : v))}
    >
      {children as never}
    </div>
  );
}
vi.mock('../RMHarkOverflowMenu', () => ({ RMHarkOverflowMenu: marker('RMHarkOverflowMenu') }));
vi.mock('../RMHarkActions', () => ({ RMHarkActions: marker('RMHarkActions') }));
vi.mock('../CommentItem', () => ({ CommentItem: marker('CommentItem') }));
vi.mock('../HiddenReplies', () => ({ HiddenRepliesGroup: wrapper('HiddenRepliesGroup') }));
vi.mock('../AIGenerateButton', () => ({ AIGenerateButton: marker('AIGenerateButton') }));
vi.mock('../MentionTextarea', () => ({ MentionTextarea: marker('MentionTextarea') }));
vi.mock('../RMHarkContent', () => ({
  RMHarkContent: marker('RMHarkContent'),
  extractFirstUrl: (text: string) => /https?:\/\/\S+/.exec(text)?.[0] ?? null,
}));
vi.mock('../PollDisplay', () => ({ PollDisplay: marker('PollDisplay') }));
vi.mock('../TakeMeterLazy', () => ({ TakeMeterLazy: marker('TakeMeterLazy') }));
vi.mock('@/components/context-notes/ContextNotesLazy', () => ({
  ContextNotesLazy: marker('ContextNotesLazy'),
}));
vi.mock('@/components/code-embed/RunnableEmbed', () => ({
  RunnableEmbed: marker('RunnableEmbed'),
}));
vi.mock('@/components/posts-plus/PostPlusBadges', () => ({
  PostPlusBadges: marker('PostPlusBadges'),
}));
vi.mock('../GifEmbed', () => ({ GifEmbed: marker('GifEmbed') }));
vi.mock('../PostImageGrid', () => ({ PostImageGrid: marker('PostImageGrid') }));
vi.mock('../SensitiveMedia', () => ({ SensitiveMedia: wrapper('SensitiveMedia') }));
vi.mock('../LinkPreview', () => ({ LinkPreview: marker('LinkPreview') }));
vi.mock('../UserAvatar', () => ({ UserAvatar: marker('UserAvatar') }));
vi.mock('../ThreadSummary', () => ({ ThreadSummary: marker('ThreadSummary') }));
vi.mock('../RelatedPosts', () => ({ RelatedPosts: marker('RelatedPosts') }));
vi.mock('../EditHistory', () => ({ EditHistoryButton: marker('EditHistoryButton') }));

import { PostDetail } from '../PostDetail';

// useState ordinals in the page's render (see file header).
const S = {
  arrived: 0,
  post: 1,
  comments: 2,
  loading: 3,
  loadingComments: 4,
  notFound: 5,
  commentContent: 6,
  submitting: 7,
  translatedText: 8,
  showTranslated: 9,
  translating: 10,
} as const;

const ana = { id: 'ana', name: 'Ana', handle: 'ana_k', image: '/ana.png' };
const bob = { id: 'bob', name: 'Bob', handle: 'bob_b', image: null };

type Rec = Record<string, unknown>;
const POST: Rec = {
  id: 'p1',
  content: 'Hello world',
  createdAt: '2024-03-05T11:00:00Z',
  user: ana,
};
const post = (extra: Rec = {}): Rec => ({ ...POST, ...extra });

const comment = (id: string, extra: Rec = {}): Rec => ({
  id,
  content: `reply ${id}`,
  createdAt: '2024-03-05T12:00:00Z',
  userId: 'bob',
  user: { id: 'bob', name: 'Bob', image: null, username: 'bob' },
  ...extra,
});

type Seed = Partial<Record<keyof typeof S, unknown>>;
function render(seed: Seed = {}) {
  ctl.n = 0;
  ctl.seeds = new Map(Object.entries(seed).map(([k, v]) => [S[k as keyof typeof S], v]));
  return renderToString(<PostDetail postId="p1" />);
}
const ready = (p: Rec = POST, extra: Seed = {}): Seed => ({
  arrived: {},
  post: p,
  loading: false,
  loadingComments: false,
  ...extra,
});

describe('PostDetail characterization', () => {
  it('loading spinner', () => {
    expect(render({ arrived: {}, post: null, loading: true })).toMatchSnapshot();
  });
  it('not found, and no post', () => {
    expect(render({ arrived: {}, post: null, loading: false, notFound: true })).toMatchSnapshot();
    expect(render({ arrived: {}, post: null, loading: false })).toMatchSnapshot();
  });
  it('plain post, replies still loading', () => {
    expect(render(ready(POST, { loadingComments: true }))).toMatchSnapshot();
  });
  it('plain post, no replies yet (signed in)', () => {
    expect(render(ready())).toMatchSnapshot();
  });
  it('signed out shows the sign-in prompt', () => {
    ctl.session = null;
    try {
      expect(render(ready())).toMatchSnapshot();
    } finally {
      ctl.session = { user: { id: 'me', name: 'Me', image: '/me.png' } };
    }
  });
  it('author viewing their own post; resolved user overrides the composer avatar', () => {
    ctl.session = { user: { id: 'ana', name: 'Ana', image: '/old.png' } };
    ctl.resolved = { name: 'Ana R', image: '/new.png' };
    try {
      expect(render(ready())).toMatchSnapshot();
    } finally {
      ctl.session = { user: { id: 'me', name: 'Me', image: '/me.png' } };
      ctl.resolved = null;
    }
  });
  it('rich post: poll, take, embed, notes, badges, media, original, edited', () => {
    expect(
      render(
        ready(
          post({
            isTake: true,
            hasEmbed: true,
            hasNote: true,
            seriesId: 's1',
            expiresAt: '2030-01-01T00:00:00Z',
            poll: { question: 'Q', options: [] },
            gifUrl: 'https://media.tenor.com/g.gif',
            imageUrls: ['/i1.png', '/i2.png'],
            imageAlts: ['a', null],
            isSensitive: true,
            edited: true,
            original: { id: 'o1', content: 'quoted', user: bob },
          }),
        ),
      ),
    ).toMatchSnapshot();
  });
  it('quoted original without a known author', () => {
    expect(render(ready(post({ original: { id: 'o1', content: 'quoted' } })))).toMatchSnapshot();
  });
  it('link preview only without poll, media or empty content', () => {
    expect(render(ready(post({ content: 'see https://example.com/x now' })))).toMatchSnapshot();
    expect(
      render(ready(post({ content: 'see https://example.com/x now', imageUrls: ['/i.png'] }))),
    ).toMatchSnapshot();
    expect(
      render(ready(post({ content: 'see https://example.com/x now', poll: {} }))),
    ).toMatchSnapshot();
    expect(render(ready(post({ content: '' })))).toMatchSnapshot();
  });
  it('locked post hides take, embed, notes and badges', () => {
    expect(
      render(ready(post({ locked: true, isTake: true, hasEmbed: true, hasNote: true }))),
    ).toMatchSnapshot();
  });
  it('deleted by the user and by an admin', () => {
    expect(render(ready(post({ deletedAt: '2024-03-06T00:00:00Z' })))).toMatchSnapshot();
    expect(
      render(ready(post({ deletedAt: '2024-03-06T00:00:00Z', deletedByAdmin: true }))),
    ).toMatchSnapshot();
  });
  it('reply controls', () => {
    expect(render(ready(post({ replyControl: 'FOLLOWING' })))).toMatchSnapshot();
    expect(render(ready(post({ replyControl: 'MENTIONED' })))).toMatchSnapshot();
    expect(render(ready(post({ replyControl: 'EVERYONE' })))).toMatchSnapshot();
  });
  it('unknown author', () => {
    expect(render(ready(post({ user: undefined })))).toMatchSnapshot();
    expect(render(ready(post({ user: { id: 'z', name: null, handle: null } })))).toMatchSnapshot();
  });
  it('composer: draft, near the limit, over the limit, submitting', () => {
    expect(render(ready(POST, { commentContent: 'hi there' }))).toMatchSnapshot();
    expect(render(ready(POST, { commentContent: 'x'.repeat(485) }))).toMatchSnapshot();
    expect(render(ready(POST, { commentContent: 'x'.repeat(520) }))).toMatchSnapshot();
    expect(render(ready(POST, { commentContent: 'hi', submitting: true }))).toMatchSnapshot();
    expect(render(ready(POST, { commentContent: '   ' }))).toMatchSnapshot();
  });
  it('translation shown and hidden', () => {
    expect(
      render(ready(POST, { translatedText: 'Hola mundo', showTranslated: true })),
    ).toMatchSnapshot();
    expect(
      render(ready(POST, { translatedText: 'Hola mundo', showTranslated: false })),
    ).toMatchSnapshot();
    expect(render(ready(POST, { translating: true }))).toMatchSnapshot();
  });
  it('replies: staggered first eight, then plain; hidden ones regroup', () => {
    const many = Array.from({ length: 10 }, (_, i) => comment(`c${i}`));
    expect(render(ready(POST, { comments: many }))).toMatchSnapshot();
    expect(
      render(
        ready(POST, {
          comments: [
            comment('a'),
            comment('h1', { hidden: true }),
            comment('h2', { hidden: true }),
          ],
        }),
      ),
    ).toMatchSnapshot();
    expect(render(ready(POST, { comments: [comment('h1', { hidden: true })] }))).toMatchSnapshot();
  });
  it('is deterministic', () => {
    expect(render(ready())).toBe(render(ready()));
  });
});
