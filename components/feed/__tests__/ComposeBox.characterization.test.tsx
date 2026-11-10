/**
 * ComposeBox characterization (A6). The composer is split into `compose/*`
 * sub-components and hooks; this suite pins the server-rendered markup of every
 * visible state so the split is provably markup-neutral.
 *
 * A node-env renderToString run executes no effects and no event handlers, so
 * non-default states are reached by seeding `useState` by call ordinal. The
 * ordinals below are the composer's hook order (own states, then the code-embed
 * and posts-plus hooks' states inline where they are called); the refactor keeps
 * that order, and a mismatch shows up as a snapshot diff, not silently.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';

const ctl = vi.hoisted(() => ({
  n: 0,
  seeds: new Map<number, unknown>(),
  signedIn: true,
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
  useSession: () => ({
    data: ctl.signedIn ? { user: { id: 'u1', name: 'Ana', image: null } } : null,
  }),
  useResolvedUser: () => ({ resolved: null }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      String(o?.defaultValue ?? k).replace(/\{\{(\w+)\}\}/g, (_, v) => String(o?.[v] ?? '')),
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: unknown; to: unknown }) => (
    <a href={String(to)}>{children as never}</a>
  ),
}));
// Portalled surfaces render inline so their contents are part of the snapshot.
vi.mock('@/components/ui/anchored-menu', () => ({
  AnchoredMenu: ({
    open,
    label,
    className,
    children,
  }: {
    open: boolean;
    label: string;
    className?: string;
    children: unknown;
  }) =>
    open ? (
      <div data-anchored-menu={label} className={className}>
        {children as never}
      </div>
    ) : null,
}));
vi.mock('@/components/ui/overlay-panel', () => ({
  OverlayPanel: ({ children }: { children: unknown }) => (
    <div data-overlay-panel>{children as never}</div>
  ),
}));

import { ComposeBox } from '../ComposeBox';

// useState ordinals in ComposeBox's render (see file header).
const S = {
  content: 0,
  audience: 1,
  replyControl: 2,
  replyOpen: 3,
  isSensitive: 4,
  isTake: 5,
  embed: 6,
  ttl: 8,
  series: 9,
  pollDuration: 11,
  unlockPrice: 12,
  submitting: 13,
  attachment: 14,
  menuOpen: 15,
  audienceOpen: 16,
  poll: 17,
  gifUrl: 18,
  imageUrls: 19,
  imageAlts: 20,
  altEditIndex: 21,
  imageError: 22,
  uploadingCount: 23,
  showSchedule: 24,
  scheduleAt: 25,
  savedMsg: 26,
  pendingDraft: 27,
  showPriceModal: 28,
  showCheatSheet: 29,
} as const;

function render(seed: Partial<Record<keyof typeof S, unknown>> = {}, props: object = {}) {
  ctl.n = 0;
  ctl.seeds = new Map(Object.entries(seed).map(([k, v]) => [S[k as keyof typeof S], v]));
  // The lazy ThreadPostPanel cannot load under SSR, so React embeds the abort
  // reason (component stack, absolute paths, line:col) in a template; that is
  // not markup under test.
  return renderToString(<ComposeBox {...props} />).replace(
    /<template data-msg="[^"]*"/g,
    '<template data-msg="<ssr-abort>"',
  ).replace(/ data-c?stck="[^"]*"/g, '');
}

beforeEach(() => {
  ctl.signedIn = true;
});

describe('ComposeBox characterization', () => {
  it('signed out', () => {
    ctl.signedIn = false;
    expect(render()).toMatchSnapshot();
  });
  it('default', () => {
    expect(render()).toMatchSnapshot();
  });
  it('text with counter warning and community cap', () => {
    expect(render({ content: 'x'.repeat(265) }, { communityId: 'c1' })).toMatchSnapshot();
  });
  it('over the length limit offers a thread', () => {
    expect(render({ content: 'y'.repeat(300) })).toMatchSnapshot();
  });
  it('price pill, content warning and take chips', () => {
    expect(
      render({ content: 'hello', unlockPrice: '25', isSensitive: true, isTake: true }),
    ).toMatchSnapshot();
  });
  it('poll editor with three options', () => {
    expect(
      render({
        attachment: 'poll',
        pollDuration: 24,
        poll: { question: 'Best?', options: ['a', 'b', 'c'], multiSelect: true },
      }),
    ).toMatchSnapshot();
  });
  it('poll editor at the minimum option count', () => {
    expect(
      render({ attachment: 'poll', poll: { question: '', options: ['', ''], multiSelect: false } }),
    ).toMatchSnapshot();
  });
  it('gif attachment: picker, then chosen', () => {
    expect(render({ attachment: 'gif' })).toMatchSnapshot();
    expect(
      render({ attachment: 'gif', gifUrl: 'https://media.tenor.com/x/y.gif' }),
    ).toMatchSnapshot();
  });
  it('image previews, one and two, with and without alt text', () => {
    expect(render({ imageUrls: ['/a.png'] })).toMatchSnapshot();
    expect(
      render({
        imageUrls: ['/a.png', '/b.png'],
        imageAlts: ['A cat', ''],
        imageError: 'Upload failed',
      }),
    ).toMatchSnapshot();
  });
  it('schedule panel and saved message', () => {
    expect(
      render({
        content: 'later',
        showSchedule: true,
        scheduleAt: '2030-01-01T10:00',
        savedMsg: 'Saved to drafts',
      }),
    ).toMatchSnapshot();
  });
  it('submitting and uploading', () => {
    expect(render({ content: 'go', submitting: true })).toMatchSnapshot();
    expect(render({ content: 'go', uploadingCount: 1 })).toMatchSnapshot();
  });
  it('plus menu open, with content and with a gif attached', () => {
    expect(render({ menuOpen: true })).toMatchSnapshot();
    expect(
      render({
        menuOpen: true,
        content: 'hi',
        attachment: 'gif',
        imageUrls: ['/a.png'],
        isSensitive: true,
        audience: 'CIRCLE',
        replyControl: 'MENTIONED',
      }),
    ).toMatchSnapshot();
  });
  it('maxed images disable add-image in the menu', () => {
    expect(render({ menuOpen: true, imageUrls: ['/1', '/2', '/3', '/4'] })).toMatchSnapshot();
  });
  it('audience picker', () => {
    expect(render({ audienceOpen: true, audience: 'FOLLOWERS' })).toMatchSnapshot();
  });
  it('reply-control picker', () => {
    expect(render({ replyOpen: true, replyControl: 'FOLLOWING' })).toMatchSnapshot();
  });
  it('unlock price dialog', () => {
    expect(render({ showPriceModal: true, unlockPrice: '10' })).toMatchSnapshot();
  });
  it('formatting cheat sheet', () => {
    expect(render({ showCheatSheet: true })).toMatchSnapshot();
  });
  it('alt text editor', () => {
    expect(
      render({ imageUrls: ['/a.png', '/b.png'], imageAlts: ['One'], altEditIndex: 1 }),
    ).toMatchSnapshot();
    expect(
      render({ imageUrls: ['/a.png'], imageAlts: ['One'], altEditIndex: 0 }),
    ).toMatchSnapshot();
  });
  it('unsent draft banner', () => {
    expect(
      render({ pendingDraft: { content: 'lost words', gifUrl: '', savedAt: 1 } }),
    ).toMatchSnapshot();
  });
  it('draft banner hides once there is text', () => {
    expect(
      render({
        content: 'typing',
        pendingDraft: { content: 'lost words', gifUrl: '', savedAt: 1 },
      }),
    ).toMatchSnapshot();
  });
  it('post as thread blocked by attachments / options', () => {
    expect(render({ content: 'z'.repeat(300), imageUrls: ['/a.png'] })).toMatchSnapshot();
    expect(render({ content: 'z'.repeat(300), audience: 'PRIVATE' })).toMatchSnapshot();
  });
  it('is deterministic', () => {
    expect(render({ menuOpen: true })).toBe(render({ menuOpen: true }));
  });
});
