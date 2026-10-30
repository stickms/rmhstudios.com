import { describe, expect, it } from 'vitest';
import {
  MAX_POST,
  MAX_THREAD_BODY,
  MAX_TITLE,
  cleanText,
  snippet,
  validatePost,
  validateThread,
} from '../hub-rules';

describe('cleanText', () => {
  it('trims, strips control characters and collapses long blank runs', () => {
    expect(cleanText('  hi\u0000 there\u0007  ')).toBe('hi there');
    expect(cleanText('a\n\n\n\n\nb')).toBe('a\n\nb');
    expect(cleanText('a\r\nb')).toBe('a\nb');
  });

  it('keeps ordinary newlines, tabs and unicode', () => {
    expect(cleanText('line1\nline2\tx ✓ é')).toBe('line1\nline2\tx ✓ é');
  });

  it('does not treat markup as special: it is stored as typed', () => {
    expect(cleanText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
  });
});

describe('validateThread', () => {
  it('accepts a normal thread and returns the cleaned text', () => {
    const r = validateThread({ title: '  Best build?  ', body: 'Tell me\n\n\n\nmore' });
    expect(r).toEqual({ ok: true, title: 'Best build?', body: 'Tell me\n\nmore' });
  });

  it('enforces title and body bounds on the cleaned text', () => {
    expect(validateThread({ title: 'ab', body: 'x' })).toEqual({ ok: false, reason: 'title' });
    expect(validateThread({ title: 'a'.repeat(MAX_TITLE + 1), body: 'x' })).toEqual({ ok: false, reason: 'title' });
    expect(validateThread({ title: 'okay', body: '   ' })).toEqual({ ok: false, reason: 'body' });
    expect(validateThread({ title: 'okay', body: 'x'.repeat(MAX_THREAD_BODY + 1) })).toEqual({ ok: false, reason: 'body' });
  });

  it('a title is one line', () => {
    expect(validateThread({ title: 'two\nlines', body: 'x' })).toEqual({
      ok: true,
      title: 'two lines',
      body: 'x',
    });
  });
});

describe('validatePost', () => {
  it('accepts and rejects on the cleaned length', () => {
    expect(validatePost('  hello ')).toEqual({ ok: true, body: 'hello' });
    expect(validatePost('\u0000  ')).toEqual({ ok: false, reason: 'body' });
    expect(validatePost('x'.repeat(MAX_POST + 1))).toEqual({ ok: false, reason: 'body' });
  });
});

describe('snippet', () => {
  it('shortens on a word and marks the cut', () => {
    expect(snippet('one two three four five', 12)).toBe('one two…');
    expect(snippet('short', 12)).toBe('short');
    expect(snippet('a\n\nb', 12)).toBe('a b');
  });
});
