import { describe, expect, it } from 'vitest';
import {
  conversationRootId,
  firstLine,
  isIndefiniteMute,
  muteFieldsFor,
  orderReplies,
} from '@/lib/feed/conversation-controls';

const r = (
  id: string,
  over: {
    hidden?: boolean;
    deletedAt?: string | null;
  } = {},
) => ({
  id,
  ...over,
});

describe('orderReplies', () => {
  const replies = [
    r('a'),
    r('b'),
    r('c'),
    r('h', {
      hidden: true,
    }),
  ];

  it('puts the pinned reply first and keeps the rest in order', () => {
    const { visible, pinned } = orderReplies(replies, 'c');
    expect(visible.map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(pinned?.id).toBe('c');
  });

  it('leaves the order alone with no pin, or a pin that is not in the list', () => {
    expect(orderReplies(replies, null).visible.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(orderReplies(replies, undefined).pinned).toBeNull();
    expect(orderReplies(replies, 'zzz').visible.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('still sends hidden replies to the disclosure, in order', () => {
    expect(
      orderReplies(
        [
          r('x', {
            hidden: true,
          }),
          ...replies,
        ],
        'a',
      ).hidden.map((x) => x.id),
    ).toEqual(['x', 'h']);
  });

  it('does not pin a hidden or deleted reply', () => {
    expect(orderReplies(replies, 'h').pinned).toBeNull();
    expect(orderReplies(replies, 'h').hidden.map((x) => x.id)).toEqual(['h']);
    const withDeleted = [
      r('a'),
      r('d', {
        deletedAt: '2026-11-20T00:00:00Z',
      }),
    ];
    expect(orderReplies(withDeleted, 'd').visible.map((x) => x.id)).toEqual(['a', 'd']);
    expect(orderReplies(withDeleted, 'd').pinned).toBeNull();
  });

  it('handles an empty list', () => {
    expect(orderReplies([], 'a')).toEqual({
      visible: [],
      hidden: [],
      pinned: null,
    });
  });
});

describe('conversationRootId', () => {
  it('is the thread root, or the post itself', () => {
    expect(
      conversationRootId({
        id: 'seg2',
        threadRootId: 'root',
      }),
    ).toBe('root');
    expect(
      conversationRootId({
        id: 'solo',
        threadRootId: null,
      }),
    ).toBe('solo');
  });
});

describe('muteFieldsFor', () => {
  const now = new Date('2026-11-21T12:00:00Z');

  it('24 hours and 7 days end on schedule', () => {
    expect(muteFieldsFor('24h', now).muteUntil?.toISOString()).toBe('2026-11-22T12:00:00.000Z');
    expect(muteFieldsFor('7d', now).muteUntil?.toISOString()).toBe('2026-11-28T12:00:00.000Z');
    expect(muteFieldsFor('7d', now).mentionsOnly).toBe(false);
  });

  it('Mentions only has no end date; open-ended is far in the future', () => {
    expect(muteFieldsFor('mentions', now)).toEqual({
      muteUntil: null,
      mentionsOnly: true,
    });
    const forever = muteFieldsFor('forever', now);
    expect(isIndefiniteMute(forever.muteUntil)).toBe(true);
    expect(isIndefiniteMute(muteFieldsFor('7d', now).muteUntil)).toBe(false);
    expect(isIndefiniteMute(null)).toBe(false);
  });
});

describe('firstLine', () => {
  it('takes the first non-empty line and trims long ones', () => {
    expect(firstLine('\n\n  hello world \nsecond')).toBe('hello world');
    expect(firstLine('x'.repeat(200), 20)).toHaveLength(20);
    expect(firstLine('x'.repeat(200), 20).endsWith('…')).toBe(true);
    expect(firstLine(null)).toBe('');
  });
});
