import { describe, it, expect } from 'vitest';
import { parseQuery } from '@/lib/search/parse';
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
