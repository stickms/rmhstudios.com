/**
 * GroupChatView characterization (A6, batch 2). The group thread is split into
 * `group-chat/*` state, hooks and sub-components; this suite pins the
 * server-rendered markup of every visible state so the split is provably
 * markup-neutral.
 *
 * renderToString runs no effects, so non-default states are reached by seeding
 * `useState` by call ordinal (see `S`). The ordinals are the order in which the
 * thread's state hooks are called; `S` is the only part of this file that
 * depends on how the component is factored.
 */
import { forwardRef } from 'react';
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
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => async () => true }));
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
vi.mock('@/components/chat-plus/hooks', () => ({
  useChatTheme: () => ({
    rootStyle: { '--chat-accent': 'teal' },
    wallpaper: { background: 'none' },
  }),
  useChatMeta: () => ({ data: { pins: [{ messageId: 'g2' }] } }),
  useChatUpdates: () => undefined,
  useExpiring: (messages: unknown) => messages,
}));
vi.mock('@/components/chat-plus/useSlashCommands', () => ({
  useSlashCommands: () => ({
    popover: <div data-stub="slash-popover" />,
    onKeyDown: () => false,
    tryRun: async () => false,
  }),
}));
// Children that need a QueryClient / socket / editor: stubbed to a marker that
// records the props the thread hands them.
function marker(name: string) {
  return (props: Record<string, unknown>) => (
    <div
      data-stub={name}
      data-props={JSON.stringify(props, (_k, v) => (typeof v === 'function' ? '[fn]' : v))}
    />
  );
}
vi.mock('@/components/chat-plus/ChatHeaderPlus', () => ({
  ChatHeaderPlus: marker('ChatHeaderPlus'),
}));
vi.mock('@/components/chat-plus/ChatPinnedBar', () => ({
  ChatPinnedBar: marker('ChatPinnedBar'),
}));
vi.mock('@/components/chat-plus/ChatPlusHost', () => ({ ChatPlusHost: marker('ChatPlusHost') }));
vi.mock('@/components/chat-plus/ChatSystemLine', () => ({
  ChatSystemLine: marker('ChatSystemLine'),
}));
vi.mock('@/components/chat-plus/ChatRichBody', () => ({ ChatRichBody: marker('ChatRichBody') }));
vi.mock('@/components/chat-plus/ChecklistComposer', () => ({
  ChecklistComposer: marker('ChecklistComposer'),
}));
vi.mock('@/components/chat-plus/MessageBadges', () => ({
  MessageBadges: marker('MessageBadges'),
  ThreadChip: marker('ThreadChip'),
}));
vi.mock('@/components/chat-plus/MessagePlusItems', () => ({
  GroupMessageMenu: marker('GroupMessageMenu'),
}));
vi.mock('@/components/calendar/FindATimeLink', () => ({ FindATimeLink: marker('FindATimeLink') }));
vi.mock('@/components/shared/ReactionMenu', () => ({ ReactionMenu: marker('ReactionMenu') }));
vi.mock('@/components/shared/EmojiPickerButton', () => ({
  EmojiPickerButton: marker('EmojiPickerButton'),
}));
vi.mock('../GifPicker', () => ({ GifPicker: marker('GifPicker') }));
vi.mock('../UserAvatar', () => ({ UserAvatar: marker('UserAvatar') }));
vi.mock('../MentionTextarea', () => ({
  MentionTextarea: forwardRef<HTMLTextAreaElement, Record<string, unknown>>(
    function MentionTextarea(props, _ref) {
      return (
        <div
          data-stub="MentionTextarea"
          data-props={JSON.stringify(props, (_k, v) => (typeof v === 'function' ? '[fn]' : v))}
        />
      );
    },
  ),
}));

import { GroupChatView } from '../GroupChatView';

// useState ordinals in the thread's render (see file header).
const S = {
  group: 0,
  messages: 1,
  loading: 2,
  notFound: 3,
  input: 4,
  sending: 5,
  gifUrl: 6,
  imageUrls: 7,
  uploading: 8,
  showGifPicker: 9,
  pollDraft: 10,
  attachOpen: 11,
  reactionMenu: 12,
} as const;

const ana = { id: 'ana', name: 'Ana', handle: 'ana_k', image: '/ana.png' };
const me = { id: 'me', name: 'Me Myself', handle: 'me_m', image: '/me.png' };
const noName = { id: 'zed', name: null, handle: null, image: null };

const GROUP = { id: 'g1', name: 'Crew', isOwner: true, members: [me, ana, noName], messages: [] };

type Msg = Record<string, unknown>;
const m = (id: string, sender: unknown, extra: Msg = {}): Msg => ({
  id,
  content: `text ${id}`,
  createdAt: '2024-03-05T11:00:00Z',
  sender,
  ...extra,
});

const THREAD: Msg[] = [
  m('g1', ana),
  m('g2', ana, {
    reactions: [
      { emoji: '👍', userId: 'me' },
      { emoji: '👍', userId: 'ana' },
    ],
    forwardCount: 2,
    replyCount: 3,
  }),
  m('g3', me, { gifUrl: 'https://media.tenor.com/g.gif', imageUrls: ['/i1.png', '/i2.png'] }),
  m('g4', noName, { content: '' }),
  m('g5', noName),
  m('g6', ana, {
    content: '',
    poll: {
      question: 'Pizza?',
      options: [
        { text: 'Yes', votes: 3 },
        { text: 'No', votes: 1 },
      ],
      totalVotes: 4,
      myVote: 0,
    },
  }),
  m('g7', ana, {
    content: '',
    poll: { question: 'Fresh?', options: [{ text: 'A', votes: 0 }], totalVotes: 0, myVote: null },
  }),
  m('g8', ana, { content: '', kind: 'dice', meta: { value: 4 } }),
  m('g9', me, { content: 'Timer set', kind: 'timer', meta: {} }),
];

function render(seed: Partial<Record<keyof typeof S, unknown>> = {}) {
  ctl.n = 0;
  ctl.seeds = new Map(Object.entries(seed).map(([k, v]) => [S[k as keyof typeof S], v]));
  return renderToString(<GroupChatView id="g1" currentUserId="me" />);
}

const ready = { group: GROUP, loading: false };

describe('GroupChatView characterization', () => {
  it('loading', () => {
    expect(render()).toMatchSnapshot();
  });
  it('group not found', () => {
    expect(render({ notFound: true, loading: false })).toMatchSnapshot();
    expect(render({ loading: false })).toMatchSnapshot();
  });
  it('empty thread', () => {
    expect(render(ready)).toMatchSnapshot();
  });
  it('full thread: senders, media, polls, cards, system line, reactions, pins', () => {
    expect(render({ ...ready, messages: THREAD })).toMatchSnapshot();
  });
  it('composer with a draft, pending media and the GIF picker', () => {
    expect(
      render({
        ...ready,
        input: 'hello there',
        gifUrl: 'https://media.tenor.com/p.gif',
        imageUrls: ['/p1.png', '/p2.png'],
        showGifPicker: true,
      }),
    ).toMatchSnapshot();
  });
  it('sending and uploading disable the controls', () => {
    expect(render({ ...ready, input: 'x', sending: true })).toMatchSnapshot();
    expect(render({ ...ready, input: 'x', uploading: true })).toMatchSnapshot();
  });
  it('poll composer with few and many options', () => {
    expect(
      render({ ...ready, pollDraft: { question: 'Lunch?', options: ['', ''] } }),
    ).toMatchSnapshot();
    expect(
      render({
        ...ready,
        pollDraft: { question: 'Lunch?', options: ['a', 'b', 'c', 'd', 'e', 'f'] },
      }),
    ).toMatchSnapshot();
  });
  it('attach menu open, with the image slots full', () => {
    expect(render({ ...ready, attachOpen: true })).toMatchSnapshot();
    expect(
      render({ ...ready, attachOpen: true, imageUrls: ['/1', '/2', '/3', '/4'] }),
    ).toMatchSnapshot();
  });
  it('a poll draft alone enables sending', () => {
    expect(render({ ...ready, pollDraft: { question: '', options: ['', ''] } })).toMatchSnapshot();
  });
  it('reaction menu', () => {
    expect(
      render({
        ...ready,
        messages: THREAD.slice(0, 2),
        reactionMenu: { x: 10, y: 20, messageId: 'g1' },
      }),
    ).toMatchSnapshot();
  });
  it('is deterministic', () => {
    expect(render({ ...ready, messages: THREAD })).toBe(render({ ...ready, messages: THREAD }));
  });
});
