import { describe, expect, it } from 'vitest';
import {
  MAX_NOTIFIED_MENTIONS,
  insertMention,
  mentionHandles,
  mentionTargets,
  mentionTrigger,
  rankMembers,
  splitMentions,
} from '@/lib/group-chat/mentions';

const members = [
  {
    id: 'u1',
    handle: 'ann',
  },
  {
    id: 'u2',
    handle: 'Bob_2',
  },
  {
    id: 'u3',
    handle: 'cy',
  },
  {
    id: 'u4',
    handle: null,
  },
];

describe('mentionHandles', () => {
  it('reads handles after start, space and punctuation', () => {
    expect(mentionHandles('@ann hi (@bob), "@cy"!')).toEqual(['ann', 'bob', 'cy']);
  });
  it('dedupes case-insensitively keeping the first casing', () => {
    expect(mentionHandles('@Ann @ann @ANN')).toEqual(['Ann']);
  });
  it('ignores emails, doubled @ and handles inside URLs', () => {
    expect(mentionHandles('mail me@ann.com or @@ann')).toEqual([]);
    expect(mentionHandles('see https://example.com/@ann and www.x.com/@bob')).toEqual([]);
    expect(mentionHandles('https://example.com/@ann then @bob')).toEqual(['bob']);
  });
});

describe('mentionTargets', () => {
  it('matches members case-insensitively and skips non-members and the sender', () => {
    const r = mentionTargets('@ANN @bob_2 @ghost @cy', members, 'u3');
    expect(r.mentioned).toEqual(['u1', 'u2']);
  });
  it('notifies a duplicate handle once', () => {
    expect(mentionTargets('@ann @Ann', members, 'zz').notify).toEqual(['u1']);
  });
  it('caps notified members at ten but still stores the rest', () => {
    const many = Array.from(
      {
        length: 14,
      },
      (_, i) => ({
        id: `m${i}`,
        handle: `h${i}`,
      }),
    );
    const text = many.map((m) => `@${m.handle}`).join(' ');
    const r = mentionTargets(text, many, 'zz');
    expect(MAX_NOTIFIED_MENTIONS).toBe(10);
    expect(r.notify).toHaveLength(10);
    expect(r.mentioned).toHaveLength(14);
    expect(r.notify).toEqual(r.mentioned.slice(0, 10));
  });
  it('counts only members toward the cap (non-member handles do not use it up)', () => {
    const text =
      Array.from(
        {
          length: 12,
        },
        (_, i) => `@nobody${i}`,
      ).join(' ') + ' @ann';
    expect(mentionTargets(text, members, 'zz').notify).toEqual(['u1']);
  });
});

describe('splitMentions', () => {
  it('marks member mentions, flags the viewer and leaves others as text', () => {
    const segs = splitMentions('hi @ann and @ghost, @Bob_2!', members, 'u1');
    expect(segs.map((s) => s.text).join('')).toBe('hi @ann and @ghost, @Bob_2!');
    const marked = segs.filter((s) => s.kind === 'mention');
    expect(marked.map((s) => s.kind === 'mention' && [s.userId, s.me])).toEqual([
      ['u1', true],
      ['u2', false],
    ]);
  });
  it('does not split a URL', () => {
    const segs = splitMentions('https://x.com/@ann', members, 'u2');
    expect(segs).toEqual([
      {
        kind: 'text',
        text: 'https://x.com/@ann',
      },
    ]);
  });
});

describe('picker helpers', () => {
  it('finds the trigger before the caret', () => {
    expect(mentionTrigger('hello @an', 9)).toEqual({
      query: 'an',
      start: 6,
    });
    expect(mentionTrigger('@', 1)).toEqual({
      query: '',
      start: 0,
    });
    expect(mentionTrigger('mail me@an', 10)).toBeNull();
    expect(mentionTrigger('hello @an there', 15)).toBeNull();
  });
  it('ranks handle prefixes first and leaves out the viewer and handle-less members', () => {
    const list = [
      {
        id: 'a',
        name: 'Zed',
        handle: 'xann',
        image: null,
      },
      {
        id: 'b',
        name: 'B',
        handle: 'annie',
        image: null,
      },
      {
        id: 'c',
        name: 'Ann Lee',
        handle: 'lee',
        image: null,
      },
      {
        id: 'd',
        name: 'Ann',
        handle: null,
        image: null,
      },
      {
        id: 'me',
        name: 'Ann Me',
        handle: 'annme',
        image: null,
      },
    ];
    expect(rankMembers(list, 'ann', 'me').map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });
  it('inserts the handle with a trailing space, or refuses when it does not fit', () => {
    const t = {
      query: 'an',
      start: 6,
    };
    expect(insertMention('hello @an', t, 'ann', 100)).toEqual({
      value: 'hello @ann ',
      caret: 11,
    });
    expect(insertMention('hello @an', t, 'ann', 9)).toBeNull();
  });
});
