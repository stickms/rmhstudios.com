/**
 * ProfileEditModal characterization (A6, batch 2). The editor is split into
 * `profile-edit/*` state, hooks and section components; this suite pins the
 * server-rendered markup of every visible state so the split is provably
 * markup-neutral.
 *
 * renderToString runs no effects, so non-default states are reached by seeding
 * `useState` by call ordinal (see `S`). The ordinals are the order in which the
 * editor's state hooks are called; `S` is the only part of this file that
 * depends on how the component is factored.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

const ctl = vi.hoisted(() => ({
  n: 0,
  seeds: new Map<number, unknown>(),
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
vi.mock('@/components/Providers', () => ({
  useResolvedUser: () => ({ refresh: () => undefined }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      String(o?.defaultValue ?? k).replace(/\{\{(\w+)\}\}/g, (_, v) => String(o?.[v] ?? '')),
  }),
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => undefined }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => async () => true }));
// Radix portals render nothing under SSR; pass the sheet through as plain divs.
vi.mock('@/components/ui/sheet', () => {
  const box = (name: string) =>
    function Box({ children, className }: { children?: unknown; className?: string }) {
      return (
        <div data-sheet={name} className={className}>
          {children as never}
        </div>
      );
    };
  return {
    Sheet: ({ open, children }: { open: boolean; children?: unknown }) =>
      open ? <div data-sheet="root">{children as never}</div> : null,
    SheetContent: box('content'),
    SheetHeader: box('header'),
    SheetTitle: box('title'),
    SheetDescription: box('description'),
  };
});
function marker(name: string) {
  return (props: Record<string, unknown>) => (
    <div
      data-stub={name}
      data-props={JSON.stringify(props, (_k, v) => (typeof v === 'function' ? '[fn]' : v))}
    />
  );
}
vi.mock('@/components/shared/EmojiPickerButton', () => ({
  EmojiPickerButton: marker('EmojiPickerButton'),
}));
vi.mock('../ImageCropModal', () => ({ ImageCropModal: marker('ImageCropModal') }));
vi.mock('../SpotifySongSearch', () => ({ SpotifySongSearch: marker('SpotifySongSearch') }));
vi.mock('../BioAssist', () => ({ BioAssist: marker('BioAssist') }));

import { ProfileEditModal } from '../ProfileEditModal';

// useState ordinals in the editor's render (see file header).
const S = {
  section: 0,
  handle: 1,
  handleStatus: 2,
  displayName: 3,
  bio: 4,
  location: 5,
  website: 6,
  links: 7,
  showLikes: 8,
  dmPrivacy: 9,
  tipGoal: 10,
  tipGoalLabel: 11,
  membershipPrice: 12,
  avatarFile: 13,
  avatarPreview: 14,
  cropSrc: 15,
  bannerFile: 16,
  bannerPreview: 17,
  bannerRemoved: 18,
  submitting: 19,
  resettingAvatar: 20,
  hasCustomAvatar: 21,
  error: 22,
  selectedSong: 23,
  bannerCrop: 24,
  bannerPicture: 25,
  bannerLoading: 26,
} as const;

const INITIAL = {
  handle: 'ana_k' as string | null,
  handleCooldownMs: 0,
  name: 'Ana' as string | null,
  image: '/ana.png' as string | null,
  bannerUrl: '/banner.png' as string | null,
  bio: 'Makes things' as string | null,
  location: 'Lisbon' as string | null,
  website: 'https://ana.example' as string | null,
  links: [{ label: 'Blog', url: 'https://blog.example' }],
  showLikes: true,
  dmPrivacy: 'EVERYONE',
  tipGoal: 1000,
  tipGoalLabel: 'Mic fund',
  membershipPriceCoins: 500,
  profileSongSpotifyId: null as string | null,
  profileSongTitle: null as string | null,
  profileSongArtist: null as string | null,
  profileSongPreviewUrl: null as string | null,
  profileSongAlbumArt: null as string | null,
};

function render(
  seed: Partial<Record<keyof typeof S, unknown>> = {},
  initial: Partial<typeof INITIAL> & { hasCustomAvatar?: boolean } = {},
  open = true,
) {
  ctl.n = 0;
  ctl.seeds = new Map(Object.entries(seed).map(([k, v]) => [S[k as keyof typeof S], v]));
  return renderToString(
    <ProfileEditModal
      open={open}
      onClose={() => undefined}
      onSaved={() => undefined}
      initial={{ ...INITIAL, ...initial }}
    />,
  );
}

describe('ProfileEditModal characterization', () => {
  it('closed renders nothing', () => {
    expect(render({}, {}, false)).toMatchSnapshot();
  });
  it('identity section, pristine', () => {
    expect(render()).toMatchSnapshot();
  });
  it('identity section without banner, avatar, handle or bio', () => {
    expect(
      render(
        {},
        {
          handle: null,
          name: null,
          image: null,
          bannerUrl: null,
          bio: null,
          location: null,
          website: null,
          links: [],
        },
      ),
    ).toMatchSnapshot();
  });
  it('custom avatar shows the reset action', () => {
    expect(render({}, { hasCustomAvatar: true })).toMatchSnapshot();
  });
  it('handle on cooldown', () => {
    expect(render({}, { handleCooldownMs: 3 * 86400000 })).toMatchSnapshot();
    expect(render({}, { handleCooldownMs: 1000 })).toMatchSnapshot();
  });
  it('handle check states', () => {
    for (const handleStatus of ['checking', 'available', 'taken', 'invalid']) {
      expect(render({ handle: 'new_handle', handleStatus })).toMatchSnapshot();
    }
    // Same handle as before: the status icons and hints stay quiet.
    expect(render({ handleStatus: 'available' })).toMatchSnapshot();
  });
  it('dirty draft with a pending avatar, banner removal and an error', () => {
    expect(
      render({
        displayName: 'Ana Maria',
        bio: 'x'.repeat(150),
        avatarFile: { name: 'avatar.png' },
        avatarPreview: 'blob:avatar',
        bannerRemoved: true,
        bannerPreview: null,
        error: 'Failed to save',
      }),
    ).toMatchSnapshot();
  });
  it('name and bio over the limit disable saving', () => {
    expect(render({ displayName: '', bio: 'y'.repeat(170) })).toMatchSnapshot();
    expect(render({ displayName: 'n'.repeat(55) })).toMatchSnapshot();
  });
  it('saving and resetting disable the controls', () => {
    expect(
      render({ displayName: 'Changed', submitting: true, hasCustomAvatar: true }),
    ).toMatchSnapshot();
    expect(
      render({ resettingAvatar: true, hasCustomAvatar: true, displayName: 'Changed' }),
    ).toMatchSnapshot();
  });
  it('crop modal open', () => {
    expect(render({ cropSrc: 'blob:crop' })).toMatchSnapshot();
  });
  it('banner crop modal open, and the adjust control while its picture loads', () => {
    const picture = { blob: null, kept: true };
    expect(render({ bannerCrop: { src: 'blob:banner', ...picture } })).toMatchSnapshot();
    expect(render({ bannerLoading: true })).toMatchSnapshot();
  });
  it('links section: rows, empty, and at the limit', () => {
    expect(render({ section: 'links' })).toMatchSnapshot();
    expect(render({ section: 'links', links: [] })).toMatchSnapshot();
    expect(
      render({
        section: 'links',
        links: Array.from({ length: 5 }, (_, i) => ({ label: `L${i}`, url: `https://l${i}.x` })),
      }),
    ).toMatchSnapshot();
  });
  it('creator section with and without a soundtrack', () => {
    expect(render({ section: 'creator' })).toMatchSnapshot();
    expect(
      render({
        section: 'creator',
        selectedSong: { id: 's1', title: 'Song', artist: 'Band', previewUrl: null, albumArt: null },
      }),
    ).toMatchSnapshot();
  });
  it('privacy section for each DM setting', () => {
    for (const dmPrivacy of ['EVERYONE', 'FOLLOWERS', 'NONE']) {
      expect(render({ section: 'privacy', dmPrivacy })).toMatchSnapshot();
    }
    expect(render({ section: 'privacy', showLikes: false })).toMatchSnapshot();
  });
  it('is deterministic', () => {
    expect(render({ section: 'links' })).toBe(render({ section: 'links' }));
  });
});
