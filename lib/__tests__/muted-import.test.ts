import { describe, it, expect } from 'vitest';
import { MAX_MUTED_WORDS, mergeImportedWords, serializeMutedWords } from '@/lib/feed/muted-import';

describe('muted word import/export', () => {
  it('exports one word per line and round-trips', () => {
    const text = serializeMutedWords(['spoiler', 'election']);
    expect(text).toBe('spoiler\nelection\n');
    expect(mergeImportedWords([], text)).toEqual({ words: ['spoiler', 'election'], added: 2 });
    expect(serializeMutedWords([])).toBe('');
  });

  it('accepts commas, semicolons and CRLF', () => {
    expect(mergeImportedWords([], 'a, b;c\r\nd').words).toEqual(['a', 'b', 'c', 'd']);
  });

  it('accepts a JSON array and ignores non-strings', () => {
    expect(mergeImportedWords([], '["Foo", 3, "bar", null]').words).toEqual(['foo', 'bar']);
  });

  it('falls back to plain text when the brackets are not JSON', () => {
    expect(mergeImportedWords([], '[not json, still words').words).toEqual(['[not json', 'still words']);
  });

  it('normalizes, de-duplicates and keeps existing words first', () => {
    const r = mergeImportedWords(['keep'], ' KEEP \nNew\nnew\n\n  ');
    expect(r).toEqual({ words: ['keep', 'new'], added: 1 });
  });

  it('truncates long entries to 50 characters', () => {
    const r = mergeImportedWords([], 'x'.repeat(80));
    expect(r.words[0]).toHaveLength(50);
  });

  it('stops at the list limit', () => {
    const many = Array.from({ length: 150 }, (_, i) => `w${i}`).join('\n');
    const r = mergeImportedWords([], many);
    expect(r.words).toHaveLength(MAX_MUTED_WORDS);
    expect(r.added).toBe(MAX_MUTED_WORDS);
  });
});
