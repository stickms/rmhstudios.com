import { describe, expect, it } from 'vitest';
import { formatDuration, textStats, topWords, wordsOf } from '@/lib/toolbox/text-stats';

describe('textStats', () => {
  it('is all zeros for empty text', () => {
    const s = textStats('');
    expect(s.words).toBe(0);
    expect(s.characters).toBe(0);
    expect(s.sentences).toBe(0);
    expect(s.paragraphs).toBe(0);
    expect(s.lines).toBe(0);
    expect(s.averageWordLength).toBe(0);
  });

  it('counts words, sentences, paragraphs and lines', () => {
    const text = 'The cat sat. The dog ran!\n\nA second paragraph?\nYes.';
    const s = textStats(text);
    expect(s.words).toBe(10);
    expect(s.sentences).toBe(4);
    expect(s.paragraphs).toBe(2);
    expect(s.lines).toBe(4);
    expect(s.longestWord).toBe('paragraph');
  });

  it('counts an emoji with a modifier as one character but several code units and bytes', () => {
    const s = textStats('hi 👍🏽');
    expect(s.characters).toBe(4);
    expect(s.charactersNoSpaces).toBe(3);
    expect(s.codeUnits).toBe(7);
    expect(s.bytes).toBe(11);
  });

  it('segments languages without spaces', () => {
    expect(wordsOf('日本語の文章です。', 'ja').length).toBeGreaterThan(1);
  });

  it('estimates reading and speaking time from the word count', () => {
    const text = Array.from({ length: 238 }, () => 'word').join(' ');
    const s = textStats(text);
    expect(s.readingSeconds).toBe(60);
    expect(s.speakingSeconds).toBe(96);
  });
});

describe('topWords', () => {
  it('ranks case-folded words, skipping short words and numbers', () => {
    const top = topWords('Apple apple APPLE pear pear the the the 2024 2024 2024 2024');
    expect(top).toEqual([
      { word: 'apple', count: 3 },
      { word: 'pear', count: 2 },
    ]);
  });

  it('breaks ties alphabetically and honours the limit', () => {
    expect(topWords('zebra alpha mango', { limit: 2 }).map((w) => w.word)).toEqual(['alpha', 'mango']);
  });
});

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});
