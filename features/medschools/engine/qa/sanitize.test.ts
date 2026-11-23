import { describe, expect, it } from 'vitest';
import { cleanForPrompt } from './sanitize';

describe('cleanForPrompt', () => {
  it('removes the data tags in any spelling', () => {
    expect(cleanForPrompt('a <user-content> b </user-content> c < /USER-CONTENT > d')).toBe('a b c d');
  });
  it('removes urls and handles', () => {
    expect(cleanForPrompt('see https://x.y/z and www.x.y now')).toBe('see and now');
    expect(cleanForPrompt('ask @someone or u/someone today')).toBe('ask or today');
  });
  it('keeps an email-free word with an at sign inside it', () => {
    expect(cleanForPrompt('a@b stays')).toBe('a@b stays');
  });
  it('removes NUL, control and zero-width characters', () => {
    expect(cleanForPrompt('a\u0000b\u0007c​d﻿e\nf\tg')).toBe('a b c' + 'de f g');
  });
  it('cuts 2,000 characters at 300 on a word boundary', () => {
    const out = cleanForPrompt('word '.repeat(400));
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out.endsWith('word')).toBe(true);
    expect(cleanForPrompt('x'.repeat(2000))).toHaveLength(300);
    expect(cleanForPrompt('abcdef ghij', 8)).toBe('abcdef');
  });
  it('passes Arabic text and an emoji through unchanged', () => {
    expect(cleanForPrompt('ما هو معدل MCAT \u{1F600}')).toBe('ما هو معدل MCAT \u{1F600}');
  });
  it('leaves a JSON blob and a fake ref as inert text', () => {
    expect(cleanForPrompt('{"a":1} [f1] ok')).toBe('{"a":1} [f1] ok');
  });
});
