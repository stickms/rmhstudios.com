/**
 * ProfileColumn characterization (A6, batch 4). The profile page is split into
 * `profile-column/*` state, hooks and sub-components; this suite pins the
 * server-rendered markup of every visible state so the split is provably
 * markup-neutral.
 *
 * renderToString runs no effects, so non-default states are reached by seeding
 * `useState` by call ordinal (see `S`). Hooks that own state of their own
 * (song, shelves, kudos, optimistic action) are mocked so they consume no
 * ordinal; `S` is the only part of this file that depends on how the column is
 * factored.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

const ctl = vi.hoisted(() => ({
  n: 0,
  seeds: new Map<number, unknown>(),
  song: { isPlaying: false, embedOpen: false },
  shelves: { show: false, label: 'Shelves' },
  session: { user: { id: 'me' } } as unknown,
  cache: {} as Record<string, unknown>,
  suspend: false,
}));

vi.mock('react', async (orig) => {
  const actual = await orig<typeof import('react')>();
  return {
    ...actual,
    // Lazy panels resolve synchronously to a marker named after their import path,
    // or (suspend mode) stay pending so the Suspense fallbacks are pinned too.
    lazy: ((loader: () => Promise<unknown>) => {
      const name = /dynamic_import__\("([^"]+)"\)/.exec(String(loader))?.[1] ?? 'lazy';
      const Lazy = (props: Record<string, unknown>) => {
        if (ctl.suspend) throw new Promise(() => undefined);
        return (
          <div
            data-lazy={name}
            data-props={JSON.stringify(props, (_k, v) => (typeof v === 'function' ? '[fn]' : v))}
          />
        );
      };
      return Lazy;
    }) as typeof actual.lazy,
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
  Link: ({ children, to, className }: { children: unknown; to: unknown; className?: string }) => (
    <a href={String(to)} className={className}>
      {children as never}
    </a>
  ),
  useNavigate: () => () => undefined,
}));
vi.mock('sonner', () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock('@/lib/auth-client', () => ({ authClient: { updateUser: () => undefined } }));
vi.mock('@/components/Providers', () => ({
  useSession: () => ({ data: ctl.session }),
  useResolvedUser: () => ({ refresh: () => undefined }),
}));
vi.mock('@/stores/userDisplayStore', () => {
  const useUserDisplayStore = (sel: (s: { cache: Record<string, unknown> }) => unknown) =>
    sel({ cache: ctl.cache });
  useUserDisplayStore.getState = () => ({
    setUsers: () => undefined,
    forceSetUser: () => undefined,
  });
  return { useUserDisplayStore };
});
vi.mock('@/hooks/useOptimisticAction', () => ({
  useOptimisticAction: () => ({ run: () => undefined }),
}));
vi.mock('@/hooks/useProfileSong', () => ({
  useProfileSong: () => ({ ...ctl.song, toggle: () => undefined, closeEmbed: () => undefined }),
}));
vi.mock('@/components/reading/useShelvesTab', () => ({ useShelvesTab: () => ctl.shelves }));
vi.mock('@/components/gifting/useKudosTabLabel', () => ({ useKudosTabLabel: () => 'Kudos' }));
vi.mock('@/lib/feed/profile-prefetch', () => ({ profilePostsFirstPageUrl: (id: string) => id }));
vi.mock('@/lib/route/intent-fetch', () => ({ takeOrFetch: async () => ({ status: 500 }) }));
vi.mock('@/lib/contract/client', () => ({ api: async () => ({}) }));

function marker(name: string) {
  return (props: Record<string, unknown>) => (
    <div
      data-stub={name}
      data-props={JSON.stringify(props, (_k, v) => (typeof v === 'function' ? '[fn]' : v))}
    />
  );
}
vi.mock('@/components/economy/GiftSubDialog', () => ({ GiftSubDialog: marker('GiftSubDialog') }));
vi.mock('@/components/profile/ProfileShowcase', () => ({
  ProfileShowcase: marker('ProfileShowcase'),
}));
vi.mock('@/components/profile/ProfileHero', () => ({ ProfileHero: marker('ProfileHero') }));
vi.mock('@/components/ui/tabs', () => ({ Tabs: marker('Tabs') }));
vi.mock('../VirtualPostList', () => ({ VirtualPostList: marker('VirtualPostList') }));
vi.mock('../AchievementsColumn', () => ({ AchievementsColumn: marker('AchievementsColumn') }));
vi.mock('../ProfileEditModal', () => ({ ProfileEditModal: marker('ProfileEditModal') }));
vi.mock('../SocialListModal', () => ({ SocialListModal: marker('SocialListModal') }));

import { ProfileColumn } from '../ProfileColumn';

// useState ordinals in the column's render (see file header).
const S = {
  profile: 0,
  loading: 1,
  notFound: 2,
  tab: 3,
  showEdit: 4,
  tipOpen: 5,
  tipMounted: 6,
  giftOpen: 7,
  socialModal: 8,
  items: 9,
  cursor: 10,
  hasMore: 11,
  loadingItems: 12,
  likedItems: 13,
  likedCursor: 14,
  likedHasMore: 15,
  loadingLiked: 16,
  membershipBusy: 17,
  messageSending: 18,
  messageError: 19,
} as const;

const base = {
  id: 'u1',
  name: 'Ana K',
  username: 'ana',
  handle: 'ana_k',
  image: '/ana.png',
  isVerified: false,
  isAdmin: false,
  createdAt: '2024-01-01T00:00:00Z',
  bio: 'hi',
  location: null,
  website: null,
  showLikes: false,
  dmPrivacy: 'everyone',
  profileSongSpotifyId: null,
  profileSongTitle: null,
  profileSongArtist: null,
  profileSongPreviewUrl: null,
  profileSongAlbumArt: null,
  followerCount: 5,
  followingCount: 6,
  rmharkCount: 7,
  isFollowing: false,
  isOwnProfile: false,
  coins: 0,
};
const OTHER = { ...base };
const OWN = { ...base, isOwnProfile: true, handleCooldownMs: 100, hasCustomAvatar: true };
const RICH = {
  ...base,
  isVerified: true,
  isAdmin: true,
  guestbookMode: 'everyone',
  showLikes: true,
  birthdayToday: true,
  status: null,
  modules: [],
  profileSongSpotifyId: 'sp1',
  profileSongTitle: 'Song',
  cosmetics: {
    theme: { id: 't', accent: '#111', accentHover: '#222', accentFg: '#333', accentDim: '#444' },
  },
};

const post = (id: string) => ({ id, content: `post ${id}`, user: { id: 'u1' } });

type Seed = Partial<Record<keyof typeof S, unknown>>;

function render(seed: Seed = {}, initialProfile: unknown = OTHER) {
  ctl.n = 0;
  ctl.seeds = new Map(Object.entries(seed).map(([k, v]) => [S[k as keyof typeof S], v]));
  const html = renderToString(
    <ProfileColumn userId="u1" initialProfile={initialProfile as never} />,
  );
  // A suspended boundary embeds the component stack (file paths, line numbers).
  return html.replace(
    /<template data-msg="[\s\S]*?"><\/template>/g,
    '<template data-msg="…"></template>',
  );
}
const withProfile = (p: unknown, extra: Seed = {}): Seed => ({ profile: p, ...extra });

describe('ProfileColumn characterization', () => {
  it('loading (no loader data)', () => {
    expect(render({}, undefined)).toMatchSnapshot();
  });
  it('not found (loader said null) and missing profile', () => {
    expect(render({}, null)).toMatchSnapshot();
    expect(render({ loading: false, profile: null })).toMatchSnapshot();
  });
  it('another member, signed in, empty RMHarks', () => {
    expect(render(withProfile(OTHER, { items: [], hasMore: true }))).toMatchSnapshot();
  });
  it('own profile, empty RMHarks', () => {
    expect(render(withProfile(OWN), OWN)).toMatchSnapshot();
  });
  it('signed out', () => {
    ctl.session = null;
    try {
      expect(render(withProfile(OTHER))).toMatchSnapshot();
    } finally {
      ctl.session = { user: { id: 'me' } };
    }
  });
  it('RMHarks list, loading more, and the end marker', () => {
    expect(
      render(withProfile(OTHER, { items: [post('a'), post('b')], hasMore: false })),
    ).toMatchSnapshot();
    expect(
      render(withProfile(OTHER, { items: [post('a')], loadingItems: true })),
    ).toMatchSnapshot();
    expect(render(withProfile(OTHER, { loadingItems: true }))).toMatchSnapshot();
  });
  it('likes tab: empty (own and other), list, loading, end', () => {
    expect(render(withProfile(OWN, { tab: 'likes' }), OWN)).toMatchSnapshot();
    expect(render(withProfile({ ...OTHER, showLikes: true }, { tab: 'likes' }))).toMatchSnapshot();
    expect(
      render(withProfile(RICH, { tab: 'likes', likedItems: [post('l1')], likedHasMore: false })),
    ).toMatchSnapshot();
    expect(
      render(withProfile(RICH, { tab: 'likes', likedItems: [post('l1')], loadingLiked: true })),
    ).toMatchSnapshot();
  });
  it('rich profile: verified, admin, theme, birthday, guestbook tab, shelves tab', () => {
    ctl.shelves = { show: true, label: 'Shelves' };
    try {
      expect(render(withProfile(RICH), RICH)).toMatchSnapshot();
    } finally {
      ctl.shelves = { show: false, label: 'Shelves' };
    }
  });
  it('cached display data overrides the profile name and image', () => {
    ctl.cache = { u1: { name: 'Cached Name', image: '/cached.png' } };
    try {
      expect(render(withProfile(OTHER))).toMatchSnapshot();
    } finally {
      ctl.cache = {};
    }
  });
  it('nameless profile falls back to username then "User"', () => {
    expect(render(withProfile({ ...OTHER, name: null }))).toMatchSnapshot();
    expect(render(withProfile({ ...OTHER, name: null, username: null }))).toMatchSnapshot();
  });
  it('other tabs: achievements, guestbook, kudos, shelves', () => {
    for (const tab of ['achievements', 'guestbook', 'kudos', 'shelves']) {
      expect(render(withProfile(RICH, { tab }), RICH)).toMatchSnapshot();
    }
  });
  it('song embed open', () => {
    ctl.song = { isPlaying: true, embedOpen: true };
    try {
      expect(render(withProfile(RICH), RICH)).toMatchSnapshot();
    } finally {
      ctl.song = { isPlaying: false, embedOpen: false };
    }
  });
  it('dialogs: tip (mounted/open), gift, edit, followers/following', () => {
    expect(render(withProfile(OTHER, { tipMounted: true, tipOpen: true }))).toMatchSnapshot();
    expect(render(withProfile(OTHER, { giftOpen: true }))).toMatchSnapshot();
    expect(render(withProfile(OWN, { showEdit: true }), OWN)).toMatchSnapshot();
    expect(render(withProfile(OWN, { tipMounted: true }), OWN)).toMatchSnapshot();
    expect(render(withProfile(OTHER, { socialModal: 'followers' }))).toMatchSnapshot();
    expect(render(withProfile(OTHER, { socialModal: 'following' }))).toMatchSnapshot();
  });
  it('suspended lazy panels show their fallbacks', () => {
    ctl.suspend = true;
    try {
      expect(render(withProfile(RICH), RICH)).toMatchSnapshot();
      for (const tab of ['guestbook', 'kudos', 'shelves']) {
        expect(render(withProfile(RICH, { tab }), RICH)).toMatchSnapshot();
      }
      expect(render(withProfile(RICH, { tipMounted: true }), RICH)).toMatchSnapshot();
      expect(render(withProfile(OTHER, { tipMounted: true }))).toMatchSnapshot();
    } finally {
      ctl.suspend = false;
    }
  });
  it('hero busy and error flags are handed down', () => {
    expect(
      render(
        withProfile(OTHER, {
          membershipBusy: true,
          messageSending: true,
          messageError: 'Nope',
        }),
      ),
    ).toMatchSnapshot();
  });
  it('is deterministic', () => {
    expect(render(withProfile(RICH), RICH)).toBe(render(withProfile(RICH), RICH));
  });
});
