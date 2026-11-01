import { describe, it, expect } from 'vitest';
import { parseQuery, resolveSearchKinds } from '@/lib/search/parse';
import { SEARCH_KINDS, SEARCH_TAB_KINDS } from '@/lib/search/types';
import { savedSearchCreateSchema } from '@/lib/search/saved';

describe('parseQuery', () => {
  it('extracts free text with no operators', () => {
    expect(parseQuery('hello world')).toMatchObject({ text: 'hello world', operatorCount: 0 });
  });

  it('parses from/has/before/after operators', () => {
    const p = parseQuery('from:@alice has:media before:2026-01-01 after:2025-01-01 game strategy');
    expect(p.from).toBe('alice');
    expect(p.hasMedia).toBe(true);
    expect(p.before).toBe('2026-01-01');
    expect(p.after).toBe('2025-01-01');
    expect(p.text).toBe('game strategy');
    expect(p.operatorCount).toBe(4);
  });

  it('keeps quoted phrases as text and degrades unknown operators', () => {
    const p = parseQuery('"exact phrase" foo:bar rest');
    expect(p.text).toContain('exact phrase');
    expect(p.text).toContain('foo:bar');
    expect(p.text).toContain('rest');
    expect(p.operatorCount).toBe(0);
  });

  it('ignores malformed dates and caps operators at 4', () => {
    expect(parseQuery('before:not-a-date').before).toBeUndefined();
    const many = parseQuery('from:a in:b has:media before:2026-01-01 after:2025-01-01');
    expect(many.operatorCount).toBe(4); // 5th operator ignored
  });

  it('allows an operator-only query (empty text)', () => {
    expect(parseQuery('from:@bob')).toMatchObject({ from: 'bob', text: '' });
  });
});

describe('savedSearchCreateSchema', () => {
  it('validates', () => {
    expect(savedSearchCreateSchema.safeParse({ query: 'from:@x cats' }).success).toBe(true);
    expect(savedSearchCreateSchema.safeParse({ query: '' }).success).toBe(false);
  });
});

describe('type: operator', () => {
  it('selects a corpus, accepting singular, plural and aliases', () => {
    expect(parseQuery('type:post cats').types).toEqual(['post']);
    expect(parseQuery('type:people ada').types).toEqual(['person']);
    expect(parseQuery('type:users ada').types).toEqual(['person']);
    expect(parseQuery('type:Games chess').types).toEqual(['game']);
  });

  it('expands places and unions several type operators in canonical order', () => {
    expect(parseQuery('type:places chess').types).toEqual(['game', 'app', 'page']);
    expect(parseQuery('type:posts type:people ada').types).toEqual(['person', 'post']);
  });

  it('counts as an operator and removes itself from the free text', () => {
    const p = parseQuery('type:post cats');
    expect(p.text).toBe('cats');
    expect(p.operatorCount).toBe(1);
  });

  it('degrades an unknown type to plain text, like any unknown operator', () => {
    const p = parseQuery('type:banana cats');
    expect(p.types).toBeUndefined();
    expect(p.text).toBe('type:banana cats');
    expect(p.operatorCount).toBe(0);
  });
});

describe('resolveSearchKinds', () => {
  const all = () => true;

  it('uses the tab kinds when there is no type operator', () => {
    expect(resolveSearchKinds(SEARCH_TAB_KINDS.people, undefined, all)).toEqual(['person']);
    expect(resolveSearchKinds(SEARCH_KINDS, [], all)).toEqual([...SEARCH_KINDS]);
  });

  it('lets type: override the tab', () => {
    expect(resolveSearchKinds(SEARCH_TAB_KINDS.people, ['post'], all)).toEqual(['post']);
  });

  it('never grants a kind the caller is not allowed to search', () => {
    const anonymous = (k: string) => k === 'game' || k === 'app' || k === 'page';
    expect(resolveSearchKinds(SEARCH_KINDS, ['person', 'game'], anonymous)).toEqual(['game']);
    expect(resolveSearchKinds(SEARCH_KINDS, ['post'], anonymous)).toEqual([]);
  });
});
