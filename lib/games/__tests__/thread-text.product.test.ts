import { describe, expect, it } from 'vitest';
import {
  MAX_MENTION_NOTICES,
  MAX_PAGE_HANDLES,
  mentionedHandles,
  mentionedHandlesIn,
  tokenizeMentions,
  type ThreadTextPart,
} from '@/lib/games/thread-text';

const all = () => true;
const joined = (parts: ThreadTextPart[]) => parts.map((p) => (p.type === 'text' ? p.text : p.raw)).join('');

describe('mentionedHandles', () => {
  it('reads a handle at the start, after a space, a newline and punctuation', () => {
    expect(mentionedHandles('@sam can you check this')).toEqual(['sam']);
    expect(mentionedHandles('ask @sam')).toEqual(['sam']);
    expect(mentionedHandles('hi\n@sam')).toEqual(['sam']);
    expect(mentionedHandles('(@sam), @lee; "@kit"')).toEqual(['sam', 'lee', 'kit']);
  });

  it('ends a handle at the first character that is not a word character', () => {
    expect(mentionedHandles('thanks @sam.')).toEqual(['sam']);
    expect(mentionedHandles('thanks @sam_99!')).toEqual(['sam_99']);
    expect(mentionedHandles('@sam-lee')).toEqual(['sam']);
  });

  it('does not take an e-mail address for a mention', () => {
    expect(mentionedHandles('write to sam@example.com')).toEqual([]);
    expect(mentionedHandles('a.b@c.d and x@y')).toEqual([]);
  });

  it('does not take @@ for a mention', () => {
    expect(mentionedHandles('@@sam')).toEqual([]);
    expect(mentionedHandles('hello @@sam and @@@lee')).toEqual([]);
    // A real mention after the doubled one still counts.
    expect(mentionedHandles('@@sam @lee')).toEqual(['lee']);
  });

  it('ignores a lone @ and an @ before a non-word character', () => {
    expect(mentionedHandles('@')).toEqual([]);
    expect(mentionedHandles('look @ this @ that')).toEqual([]);
    expect(mentionedHandles('@ sam')).toEqual([]);
  });

  it('keeps the first of a handle written twice, ignoring case, and the casing as first written', () => {
    expect(mentionedHandles('@Sam and @sam and @SAM')).toEqual(['Sam']);
  });

  it('stops at the limit, keeping the first handles', () => {
    const text = '@a @b @c @d @e @f @g';
    expect(mentionedHandles(text)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(mentionedHandles(text)).toHaveLength(MAX_MENTION_NOTICES);
    expect(mentionedHandles(text, 2)).toEqual(['a', 'b']);
  });

  it('counts a repeat once toward the limit', () => {
    expect(mentionedHandles('@a @a @a @b @c @d @e @f')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('reads at most 30 word characters of a handle', () => {
    const long = 'x'.repeat(40);
    expect(mentionedHandles(`@${long}`)).toEqual(['x'.repeat(30)]);
  });

  it('is empty for text with no mention', () => {
    expect(mentionedHandles('')).toEqual([]);
    expect(mentionedHandles('nothing to see')).toEqual([]);
  });
});

describe('mentionedHandlesIn', () => {
  it('gathers unique handles across texts in order', () => {
    expect(mentionedHandlesIn(['@a and @b', 'no one', '@B @c'])).toEqual(['a', 'b', 'c']);
  });

  it('stops at its own limit', () => {
    const texts = Array.from({ length: 150 }, (_, i) => `@m${i}`);
    expect(mentionedHandlesIn(texts)).toHaveLength(MAX_PAGE_HANDLES);
    expect(mentionedHandlesIn(texts, 3)).toEqual(['m0', 'm1', 'm2']);
  });
});

describe('tokenizeMentions', () => {
  it('splits a body into text and a mention', () => {
    expect(tokenizeMentions('@sam can you check this', all)).toEqual([
      { type: 'mention', raw: '@sam', handle: 'sam' },
      { type: 'text', text: ' can you check this' },
    ]);
    expect(tokenizeMentions('ping @sam, please', all)).toEqual([
      { type: 'text', text: 'ping ' },
      { type: 'mention', raw: '@sam', handle: 'sam' },
      { type: 'text', text: ', please' },
    ]);
  });

  it('keeps an unknown handle as plain text, merged into its neighbours', () => {
    expect(tokenizeMentions('hi @ghost and @sam', (h) => h === 'sam')).toEqual([
      { type: 'text', text: 'hi @ghost and ' },
      { type: 'mention', raw: '@sam', handle: 'sam' },
    ]);
    expect(tokenizeMentions('hi @ghost', () => false)).toEqual([{ type: 'text', text: 'hi @ghost' }]);
  });

  it('keeps the handle as written and hands that to the lookup', () => {
    const seen: string[] = [];
    const parts = tokenizeMentions('@SaM', (h) => (seen.push(h), true));
    expect(seen).toEqual(['SaM']);
    expect(parts).toEqual([{ type: 'mention', raw: '@SaM', handle: 'SaM' }]);
  });

  it('links every occurrence, not only the first', () => {
    const parts = tokenizeMentions('@sam @sam', all);
    expect(parts.filter((p) => p.type === 'mention')).toHaveLength(2);
  });

  it('leaves e-mail addresses and @@ alone', () => {
    expect(tokenizeMentions('mail sam@example.com', all)).toEqual([{ type: 'text', text: 'mail sam@example.com' }]);
    expect(tokenizeMentions('@@sam', all)).toEqual([{ type: 'text', text: '@@sam' }]);
  });

  it('is empty for empty text and one text part for text without mentions', () => {
    expect(tokenizeMentions('', all)).toEqual([]);
    expect(tokenizeMentions('plain words', all)).toEqual([{ type: 'text', text: 'plain words' }]);
  });

  it('never changes the writer text: the parts always join back to it', () => {
    for (const text of ['@a', 'x @a y @b z', '@@a @b', 'a@b.c @d', '😀 @sam 😀', 'مرحبا @sam']) {
      expect(joined(tokenizeMentions(text, all))).toBe(text);
      expect(joined(tokenizeMentions(text, (h) => h === 'b'))).toBe(text);
    }
  });
});
