/**
 * ConversationView characterization (A6). The DM thread is split into
 * `conversation/*` hooks and sub-components; this suite pins the
 * server-rendered markup of every visible state so the split is
 * provably markup-neutral.
 *
 * renderToString runs no effects, so non-default states are reached by seeding
 * `useState` by call ordinal (see `S`). The ordinals are the order in which the
 * thread's state hooks are called; `S` is the only part of this file that
 * depends on how the component is factored.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';

process.env.TZ = 'UTC';

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
    data: ctl.signedIn ? { user: { id: 'me', name: 'Me Myself', image: '/me.png' } } : null,
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
  Link: ({ children, to, className }: { children: unknown; to: unknown; className?: string }) => (
    <a href={String(to)} className={className}>
      {children as never}
    </a>
  ),
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
// Providers-backed chat extras: theme, pins, ticks. Their rendering is covered
// by their own modules; here they only need to answer deterministically.
vi.mock('@/components/chat-plus/hooks', () => ({
  useChatTheme: () => ({
    rootStyle: { '--chat-accent': 'teal' },
    wallpaper: { background: 'none' },
  }),
  useChatMeta: () => ({ data: { pins: [{ messageId: 'm2' }] } }),
  useChatUpdates: () => undefined,
  useExpiring: (messages: unknown) => messages,
}));
// Children that need a QueryClient / socket / WebRTC: stubbed to a marker that
// records the props the thread hands them.
function marker(name: string) {
  return (props: Record<string, unknown>) => (
    <div
      data-stub={name}
      data-props={JSON.stringify(props, (_k, v) => (typeof v === 'function' ? '[fn]' : v))}
    />
  );
}
vi.mock('@/components/call/CallButton', () => ({ CallButton: marker('CallButton') }));
vi.mock('@/components/groupcall/GroupCallButton', () => ({
  GroupCallButton: marker('GroupCallButton'),
}));
vi.mock('@/components/chat-plus/ChatHeaderPlus', () => ({
  ChatHeaderPlus: marker('ChatHeaderPlus'),
}));
vi.mock('@/components/chat-plus/ChatPinnedBar', () => ({
  ChatPinnedBar: marker('ChatPinnedBar'),
}));
vi.mock('@/components/chat-plus/ChatPlusHost', () => ({ ChatPlusHost: marker('ChatPlusHost') }));
vi.mock('@/components/chat-plus/ChatRichBody', () => ({ ChatRichBody: marker('ChatRichBody') }));
vi.mock('@/components/chat-plus/ChecklistComposer', () => ({
  ChecklistComposer: marker('ChecklistComposer'),
}));
vi.mock('@/components/chat-plus/MessagePlusItems', () => ({
  MessagePlusItems: marker('MessagePlusItems'),
}));
vi.mock('@/components/shared/ReactionMenu', () => ({ ReactionMenu: marker('ReactionMenu') }));
vi.mock('@/components/voice/VoiceComposer', () => ({ VoiceComposer: marker('VoiceComposer') }));
vi.mock('./SmartReplies', () => ({ SmartReplies: marker('SmartReplies') }));
vi.mock('../SmartReplies', () => ({ SmartReplies: marker('SmartReplies') }));
vi.mock('@/lib/useMessageSuggestion', () => ({
  useMessageSuggestion: () => ({ suggestion: '', clear: () => undefined }),
}));

import { ConversationView } from '../ConversationView';

// useState ordinals in the thread's render (see file header).
const S = {
  otherTyping: 0,
  messages: 1,
  loading: 2,
  olderCursor: 3,
  hasOlder: 4,
  loadingOlder: 5,
  otherUser: 6,
  notFound: 7,
  reactionMenu: 8,
  editingId: 9,
  savingEdit: 10,
  input: 11,
  sending: 12,
  error: 13,
  showGifPicker: 14,
  attachOpen: 15,
  gifUrl: 16,
  imageUrls: 17,
  uploading: 18,
  voiceActive: 19,
} as const;

const OTHER = { id: 'ana', name: 'Ana', image: '/ana.png', username: 'ana_k' };

type Msg = Record<string, unknown>;
const m = (id: string, senderId: string, createdAt: string, extra: Msg = {}): Msg => ({
  id,
  content: `text ${id}`,
  senderId,
  read: false,
  createdAt,
  ...extra,
});

const THREAD: Msg[] = [
  m('m1', 'ana', '2024-03-03T09:05:00Z'),
  m('m2', 'ana', '2024-03-03T09:06:00Z', {
    reactions: [
      { emoji: '👍', userId: 'me' },
      { emoji: '👍', userId: 'ana' },
    ],
  }),
  m('m3', 'me', '2024-03-04T10:00:00Z', { read: true, editedAt: '2024-03-04T10:02:00Z' }),
  m('m4', 'me', '2024-03-04T10:01:00Z', {
    gifUrl: 'https://media.tenor.com/g.gif',
    imageUrls: ['/i1.png', '/i2.png'],
    content: 'look https://example.com/x.png',
  }),
  m('m5', 'ana', '2024-03-05T11:00:00Z', {
    content: '',
    audioUrl: '/v.webm',
    audioDurationMs: 4000,
    audioPeaks: [1, 2],
  }),
  m('m6', 'ana', '2024-03-05T11:30:00Z', {
    content: '',
    deletedAt: '2024-03-05T11:31:00Z',
    deletedBy: 'sender',
  }),
  m('m7', 'ana', '2024-03-05T11:40:00Z', { content: '', kind: 'dice', meta: { value: 4 } }),
  m('m8', 'me', '2024-03-05T11:50:00Z', { content: 'Timer set', kind: 'system', meta: {} }),
  m('temp-9', 'me', '2024-03-05T11:55:00Z', { content: 'sending…' }),
];

function render(seed: Partial<Record<keyof typeof S, unknown>> = {}, props: object = {}) {
  ctl.n = 0;
  ctl.seeds = new Map(Object.entries(seed).map(([k, v]) => [S[k as keyof typeof S], v]));
  // The lazy local-time chip cannot load under SSR, so React embeds the abort
  // reason (with the component stack and absolute paths) in a template; that
  // is not markup under test.
  return renderToString(
    <ConversationView conversationId="c1" initialOtherUser={OTHER} {...props} />,
  )
    .replace(/<template data-msg="[^"]*"/g, '<template data-msg="<ssr-abort>"')
    .replace(/ data-c?stck="[^"]*"/g, '');
}

beforeEach(() => {
  ctl.signedIn = true;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2024-03-05T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('ConversationView characterization', () => {
  it('signed out', () => {
    ctl.signedIn = false;
    expect(render()).toMatchSnapshot();
  });
  it('conversation not found', () => {
    expect(render({ notFound: true })).toMatchSnapshot();
  });
  it('loading', () => {
    expect(render()).toMatchSnapshot();
  });
  it('empty thread', () => {
    expect(render({ loading: false })).toMatchSnapshot();
  });
  it('empty thread without a prefetched participant', () => {
    expect(
      render({ loading: false, otherUser: null }, { initialOtherUser: null }),
    ).toMatchSnapshot();
  });
  it('full thread: grouping, dates, media, voice, tombstone, card, system line, reactions', () => {
    expect(render({ loading: false, messages: THREAD, otherUser: OTHER })).toMatchSnapshot();
  });
  it('older history available / loading', () => {
    expect(
      render({ loading: false, messages: THREAD.slice(0, 2), hasOlder: true, olderCursor: 'c' }),
    ).toMatchSnapshot();
    expect(
      render({
        loading: false,
        messages: THREAD.slice(0, 2),
        hasOlder: true,
        loadingOlder: true,
      }),
    ).toMatchSnapshot();
  });
  it('other participant typing', () => {
    expect(
      render({ loading: false, messages: THREAD.slice(0, 2), otherTyping: true }),
    ).toMatchSnapshot();
  });
  it('bot participant and saved-messages chat', () => {
    expect(
      render(
        { loading: false, messages: THREAD.slice(0, 3), otherUser: { ...OTHER, isBot: true } },
        { initialOtherUser: { ...OTHER, isBot: true } },
      ),
    ).toMatchSnapshot();
    expect(
      render(
        { loading: false, messages: THREAD.slice(2, 4), otherUser: { ...OTHER, id: 'me' } },
        { initialOtherUser: { ...OTHER, id: 'me' } },
      ),
    ).toMatchSnapshot();
  });
  it('a message being edited', () => {
    expect(
      render({ loading: false, messages: THREAD.slice(0, 4), editingId: 'm3', savingEdit: true }),
    ).toMatchSnapshot();
  });
  it('error banner', () => {
    expect(render({ loading: false, error: 'Failed to send message' })).toMatchSnapshot();
  });
  it('composer with a draft, pending media and the GIF picker', () => {
    expect(
      render({
        loading: false,
        input: 'hello there',
        gifUrl: 'https://media.tenor.com/p.gif',
        imageUrls: ['/p1.png', '/p2.png'],
        showGifPicker: true,
      }),
    ).toMatchSnapshot();
  });
  it('sending and uploading disable the controls', () => {
    expect(render({ loading: false, input: 'x', sending: true })).toMatchSnapshot();
    expect(render({ loading: false, input: 'x', uploading: true })).toMatchSnapshot();
  });
  it('attach menu open, with the image slots full', () => {
    expect(render({ loading: false, attachOpen: true })).toMatchSnapshot();
    expect(
      render({ loading: false, attachOpen: true, imageUrls: ['/1', '/2', '/3', '/4'] }),
    ).toMatchSnapshot();
  });
  it('voice composer takes over the composer row', () => {
    expect(
      render({
        loading: false,
        voiceActive: true,
        input: 'x',
        gifUrl: 'https://g/x.gif',
        showGifPicker: true,
      }),
    ).toMatchSnapshot();
  });
  it('reaction menu', () => {
    expect(
      render({
        loading: false,
        messages: THREAD.slice(0, 2),
        reactionMenu: { x: 10, y: 20, messageId: 'm1' },
      }),
    ).toMatchSnapshot();
  });
  it('is deterministic', () => {
    expect(render({ loading: false, messages: THREAD })).toBe(
      render({ loading: false, messages: THREAD }),
    );
  });
});
