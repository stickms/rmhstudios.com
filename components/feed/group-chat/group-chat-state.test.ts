import { describe, expect, it } from 'vitest';
import {
  appendUnique,
  applyOptimisticVote,
  buildPollPayload,
  isNearBottom,
  memberDisplayName,
  memberSuggestions,
  toggleReactionRow,
  type Msg,
  type Sender,
} from './group-chat-state';

const ana: Sender = { id: 'ana', name: 'Ana', handle: 'ana_k', image: '/a.png' };
const zed: Sender = { id: 'zed', name: null, handle: 'zed_h', image: null };
const ghost: Sender = { id: 'g', name: null, handle: null, image: null };

const msg = (id: string, extra: Partial<Msg> = {}): Msg => ({
  id,
  content: id,
  createdAt: '2024-03-05T11:00:00Z',
  sender: ana,
  ...extra,
});

describe('appendUnique', () => {
  it('appends only unseen ids and keeps order', () => {
    const prev = [msg('a'), msg('b')];
    expect(appendUnique(prev, [msg('b'), msg('c')]).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
  it('returns the same array when nothing is new', () => {
    const prev = [msg('a')];
    expect(appendUnique(prev, [msg('a')])).toBe(prev);
  });
});

describe('toggleReactionRow', () => {
  it('adds, then removes, the viewer reaction (its own inverse)', () => {
    const start = [msg('a', { reactions: [{ emoji: '👍', userId: 'ana' }] }), msg('b')];
    const added = toggleReactionRow(start, 'a', '👍', 'me');
    expect(added[0].reactions).toEqual([
      { emoji: '👍', userId: 'ana' },
      { emoji: '👍', userId: 'me' },
    ]);
    expect(toggleReactionRow(added, 'a', '👍', 'me')[0].reactions).toEqual(start[0].reactions);
    expect(added[1]).toBe(start[1]);
  });
});

describe('applyOptimisticVote', () => {
  const poll = {
    question: 'q',
    options: [
      { text: 'a', votes: 2 },
      { text: 'b', votes: 1 },
    ],
    totalVotes: 3,
    myVote: null as number | null,
  };
  it('counts a first vote', () => {
    const [m] = applyOptimisticVote([msg('p', { poll })], 'p', 1);
    expect(m.poll).toMatchObject({ totalVotes: 4, myVote: 1 });
    expect(m.poll?.options.map((o) => o.votes)).toEqual([2, 2]);
  });
  it('moves a vote without changing the total', () => {
    const [m] = applyOptimisticVote([msg('p', { poll: { ...poll, myVote: 0 } })], 'p', 1);
    expect(m.poll).toMatchObject({ totalVotes: 3, myVote: 1 });
    expect(m.poll?.options.map((o) => o.votes)).toEqual([1, 2]);
  });
  it('ignores a repeat vote and non-poll messages', () => {
    const voted = msg('p', { poll: { ...poll, myVote: 1 } });
    expect(applyOptimisticVote([voted], 'p', 1)[0]).toBe(voted);
    const plain = msg('x');
    expect(applyOptimisticVote([plain], 'x', 0)[0]).toBe(plain);
  });
});

describe('buildPollPayload', () => {
  it('needs a question and two real options, and trims', () => {
    expect(buildPollPayload(null)).toBeNull();
    expect(buildPollPayload({ question: ' ', options: ['a', 'b'] })).toBeNull();
    expect(buildPollPayload({ question: 'q', options: ['a', ' '] })).toBeNull();
    expect(buildPollPayload({ question: ' q ', options: [' a ', '', 'b '] })).toEqual({
      question: 'q',
      options: ['a', 'b'],
    });
  });
});

describe('members', () => {
  it('maps suggestions with the handle as username', () => {
    expect(memberSuggestions([ana])).toEqual([
      { id: 'ana', name: 'Ana', image: '/a.png', handle: 'ana_k', username: 'ana_k' },
    ]);
  });
  it('names a member by name, then handle, else null', () => {
    const members = [ana, zed, ghost];
    expect(memberDisplayName(members, 'ana')).toBe('Ana');
    expect(memberDisplayName(members, 'zed')).toBe('zed_h');
    expect(memberDisplayName(members, 'g')).toBeNull();
    expect(memberDisplayName(members, 'nobody')).toBeNull();
  });
});

describe('isNearBottom', () => {
  it('follows within 120px of the bottom only', () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 500, clientHeight: 400 })).toBe(true);
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 400, clientHeight: 400 })).toBe(false);
  });
});
