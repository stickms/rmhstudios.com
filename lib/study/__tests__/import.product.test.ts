import { describe, expect, it } from 'vitest';
import { detectSeparator, parseCards } from '@/lib/study/import';

describe('detectSeparator', () => {
  it('detects a tab (Quizlet and Anki exports), even when definitions hold commas', () => {
    const text = 'bonjour\thello, hi\nmerci\tthank you, thanks\nau revoir\tgoodbye';
    expect(detectSeparator(text)).toBe('tab');
  });

  it('detects a comma-separated file', () => {
    expect(detectSeparator('cat,chat\ndog,chien\nbird,oiseau')).toBe('comma');
  });

  it('detects a semicolon file whose definitions hold commas', () => {
    expect(detectSeparator('Paris;capital, France\nRome;capital, Italy')).toBe('semicolon');
  });

  it('detects a spaced dash before commas inside definitions', () => {
    expect(detectSeparator('apple - red, round\nbanana - yellow, long')).toBe('dash');
  });

  it('detects equals', () => {
    expect(detectSeparator('one=uno\ntwo=dos\nthree=tres')).toBe('equals');
  });

  it('detects a colon', () => {
    expect(detectSeparator('one: uno\ntwo: dos\nthree: tres')).toBe('colon');
  });

  it('lets a quoted separator not count', () => {
    expect(detectSeparator('"a;b",c\n"d;e",f')).toBe('comma');
  });

  it('returns null when nothing splits the text', () => {
    expect(detectSeparator('just\nsome\nwords')).toBeNull();
    expect(detectSeparator('')).toBeNull();
  });
});

describe('parseCards', () => {
  it('parses each separator', () => {
    const cases: [string, string][] = [
      ['tab', 'a\tb\nc\td'],
      ['comma', 'a,b\nc,d'],
      ['semicolon', 'a;b\nc;d'],
      ['dash', 'a - b\nc - d'],
      ['equals', 'a=b\nc=d'],
      ['colon', 'a:b\nc:d'],
    ];
    for (const [separator, text] of cases) {
      const r = parseCards(text, { separator: separator as never });
      expect(r.cards, separator).toEqual([
        { front: 'a', back: 'b' },
        { front: 'c', back: 'd' },
      ]);
      expect(r.rejected).toEqual([]);
    }
  });

  it('imports a Quizlet export pasted as-is with no separator chosen', () => {
    const r = parseCards('hola\thello\nadiós\tgoodbye, farewell\n');
    expect(r.separator).toBe('tab');
    expect(r.cards).toEqual([
      { front: 'hola', back: 'hello' },
      { front: 'adiós', back: 'goodbye, farewell' },
    ]);
  });

  it('keeps a quoted comma inside a definition whole', () => {
    const r = parseCards('term,"one, two, three"\nother,plain', { separator: 'comma' });
    expect(r.cards[0]).toEqual({ front: 'term', back: 'one, two, three' });
  });

  it('reads doubled quotes and newlines inside quotes', () => {
    const r = parseCards('"say ""hi""","line one\nline two"\nnext,card', { separator: 'comma' });
    expect(r.cards).toEqual([
      { front: 'say "hi"', back: 'line one\nline two' },
      { front: 'next', back: 'card' },
    ]);
  });

  it('numbers lines physically, across a newline inside quotes', () => {
    const r = parseCards('a,"x\ny"\nb,\nc,d', { separator: 'comma' });
    expect(r.cards).toHaveLength(2);
    expect(r.rejected).toEqual([{ line: 3, reason: 'missing-back' }]);
  });

  it('treats a quote in the middle of a field, or never closed, as text', () => {
    expect(parseCards('5" nail,a nail', { separator: 'comma' }).cards[0].front).toBe('5" nail');
    expect(parseCards('"open,card\nnext,two', { separator: 'comma' }).cards[0].front).toBe('"open');
  });

  it('keeps an unquoted comma in a definition on comma files, but drops extra tab columns', () => {
    expect(parseCards('a,b,c', { separator: 'comma' }).cards[0].back).toBe('b,c');
    expect(parseCards('a\tb\ttag', { separator: 'tab' }).cards[0].back).toBe('b');
  });

  it('skips a header row on request', () => {
    const r = parseCards('Term,Definition\ncat,chat', { separator: 'comma', hasHeader: true });
    expect(r.cards).toEqual([{ front: 'cat', back: 'chat' }]);
  });

  it('swaps the sides', () => {
    const r = parseCards('cat,chat', { separator: 'comma', swap: true });
    expect(r.cards).toEqual([{ front: 'chat', back: 'cat' }]);
  });

  it('trims, skips blank lines and strips a byte order mark and CRLF', () => {
    const r = parseCards('﻿  a \t b \r\n\r\n\t\r\nc\td\r\n');
    expect(r.cards).toEqual([
      { front: 'a', back: 'b' },
      { front: 'c', back: 'd' },
    ]);
    expect(r.rejected).toEqual([]);
  });

  it('rejects a missing back and a missing front with their line numbers', () => {
    const r = parseCards('a\tb\nlonely\n\n\tno front\nc\td', { separator: 'tab' });
    expect(r.cards).toHaveLength(2);
    expect(r.rejected).toEqual([
      { line: 2, reason: 'missing-back' },
      { line: 4, reason: 'missing-front' },
    ]);
  });

  it('rejects over-long sides with their line numbers', () => {
    const long = 'x'.repeat(501);
    const r = parseCards(`ok\tfine\n${long}\tback\nfront\t${long}\n${'y'.repeat(500)}\tok`, {
      separator: 'tab',
    });
    expect(r.cards).toHaveLength(2);
    expect(r.rejected).toEqual([
      { line: 2, reason: 'front-too-long' },
      { line: 3, reason: 'back-too-long' },
    ]);
  });

  it('does not split a hyphenated word on the dash separator', () => {
    const r = parseCards('well-known - famous', { separator: 'dash' });
    expect(r.cards).toEqual([{ front: 'well-known', back: 'famous' }]);
  });

  it('rejects every line when nothing separates the text', () => {
    const r = parseCards('one\ntwo');
    expect(r.separator).toBeNull();
    expect(r.cards).toEqual([]);
    expect(r.rejected).toEqual([
      { line: 1, reason: 'missing-back' },
      { line: 2, reason: 'missing-back' },
    ]);
  });

  it('parses 5,000 lines in well under 100 ms, quotes and all', () => {
    const lines: string[] = [];
    for (let i = 0; i < 5000; i++) lines.push(`"term ${i}, with ""quotes""","definition ${i}"`);
    const text = lines.join('\n');
    const start = performance.now();
    const r = parseCards(text);
    const ms = performance.now() - start;
    expect(r.cards).toHaveLength(5000);
    expect(ms).toBeLessThan(100);
  });

  it('stays linear on many unclosed quotes', () => {
    const text = Array.from({ length: 5000 }, (_, i) => `"a${i},b`).join('\n');
    const start = performance.now();
    parseCards(text, { separator: 'comma' });
    expect(performance.now() - start).toBeLessThan(100);
  });
});
