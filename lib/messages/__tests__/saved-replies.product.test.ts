import { describe, expect, it } from 'vitest';
import {
  byRecency,
  firstLine,
  insertReplyText,
  parseIdList,
  rankReplies,
  slashTrigger,
  substituteVariables,
  type SavedReplyRow,
} from '@/lib/messages/saved-replies';

const row = (id: string, title: string, over: Partial<SavedReplyRow> = {}): SavedReplyRow => ({
  id,
  title,
  body: `${title} body`,
  position: 0,
  useCount: 0,
  lastUsedAt: null,
  ...over,
});

describe('slashTrigger', () => {
  it('reads a leading slash and a word', () => {
    expect(slashTrigger('/where')).toBe('where');
    expect(slashTrigger('/Où-est')).toBe('Où-est');
    expect(slashTrigger('/build2')).toBe('build2');
  });

  it('is not a trigger anywhere but the start', () => {
    expect(slashTrigger('see /where')).toBeNull();
    expect(slashTrigger(' /where')).toBeNull();
    expect(slashTrigger('https://example.com/where')).toBeNull();
    expect(slashTrigger('example.com/where')).toBeNull();
  });

  it('needs a letter first and nothing but word characters after', () => {
    expect(slashTrigger('/')).toBeNull();
    expect(slashTrigger('/1')).toBeNull();
    expect(slashTrigger('/usr/bin')).toBeNull();
    expect(slashTrigger('/where to')).toBeNull();
    expect(slashTrigger('/where\n')).toBeNull();
  });
});

describe('ranking', () => {
  it('orders by recency, then use count, then the member’s order, without mutating', () => {
    const rows = [
      row('a', 'A', { position: 0 }),
      row('b', 'B', { position: 1, useCount: 5 }),
      row('c', 'C', { position: 2, lastUsedAt: '2026-01-02T00:00:00.000Z' }),
      row('d', 'D', { position: 3, lastUsedAt: '2026-01-03T00:00:00.000Z' }),
    ];
    expect(byRecency(rows).map((r) => r.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps everything for an empty query', () => {
    expect(rankReplies([row('a', 'Alpha'), row('b', 'Beta')], '  ')).toHaveLength(2);
  });

  it('puts a title prefix before a word prefix before a substring, recency inside a tier', () => {
    const rows = [
      row('sub', 'Somewhere else'),
      row('word', 'Tell me where', { lastUsedAt: '2026-01-01T00:00:00.000Z' }),
      row('pre2', 'Where old'),
      row('pre1', 'Where new', { lastUsedAt: '2026-02-01T00:00:00.000Z' }),
      row('none', 'Download'),
    ];
    expect(rankReplies(rows, 'where').map((r) => r.id)).toEqual(['pre1', 'pre2', 'word', 'sub']);
  });

  it('matches case-insensitively', () => {
    expect(rankReplies([row('a', 'Build LINK')], 'link').map((r) => r.id)).toEqual(['a']);
  });
});

describe('substituteVariables', () => {
  it('fills {{name}} in a direct conversation, every occurrence', () => {
    expect(substituteVariables('Hi {{name}}, thanks {{name}}', 'Sam')).toBe('Hi Sam, thanks Sam');
  });

  it('leaves it as written in a group or with no name', () => {
    expect(substituteVariables('Hi {{name}}', null)).toBe('Hi {{name}}');
    expect(substituteVariables('Hi {{name}}', '  ')).toBe('Hi {{name}}');
  });

  it('treats the name as text, not a replacement pattern', () => {
    expect(substituteVariables('Hi {{name}}', '$& $1')).toBe('Hi $& $1');
  });

  it('leaves other variables alone', () => {
    expect(substituteVariables('{{date}} {{name}}', 'Sam')).toBe('{{date}} Sam');
  });
});

describe('insertReplyText', () => {
  it('inserts at the caret and puts it after the text', () => {
    expect(insertReplyText('hello world', 5, 5, ' there', 2000)).toEqual({ value: 'hello there world', caret: 11 });
  });

  it('replaces a selection', () => {
    expect(insertReplyText('hello world', 6, 11, 'sam', 2000)).toEqual({ value: 'hello sam', caret: 9 });
  });

  it('replaces the whole draft when the selection is all of it (the slash trigger)', () => {
    expect(insertReplyText('/where', 0, 6, 'Download it here.', 2000)).toEqual({
      value: 'Download it here.',
      caret: 17,
    });
  });

  it('clamps a caret outside the text', () => {
    expect(insertReplyText('ab', 9, 9, 'c', 2000)).toEqual({ value: 'abc', caret: 3 });
  });

  it('refuses rather than cut a reply short', () => {
    expect(insertReplyText('x'.repeat(1990), 1990, 1990, 'y'.repeat(11), 2000)).toBeNull();
    expect(insertReplyText('x'.repeat(1990), 1990, 1990, 'y'.repeat(10), 2000)?.value).toHaveLength(2000);
  });
});

describe('helpers', () => {
  it('shows the first non-empty line', () => {
    expect(firstLine('\n  \n  Hello there \nsecond')).toBe('Hello there');
    expect(firstLine('')).toBe('');
  });

  it('parses an id list', () => {
    expect(parseIdList('a,b')).toEqual(['a', 'b']);
    expect(parseIdList('a,a')).toBeNull();
    expect(parseIdList('a,')).toBeNull();
    expect(parseIdList(Array.from({ length: 51 }, (_, i) => `i${i}`).join(','))).toBeNull();
  });
});
