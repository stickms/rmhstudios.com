import { describe, it, expect } from 'vitest';
import { readingTimeMinutes } from '@/lib/reading-time';

const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');

describe('readingTimeMinutes', () => {
  it('is 0 for empty or markup-only text', () => {
    expect(readingTimeMinutes('')).toBe(0);
    expect(readingTimeMinutes('   \n\n ')).toBe(0);
    expect(readingTimeMinutes('```ts\nconst a = 1;\n```')).toBe(0);
  });

  it('is at least one minute for any real text', () => {
    expect(readingTimeMinutes('hello world')).toBe(1);
  });

  it('rounds up at 230 words per minute', () => {
    expect(readingTimeMinutes(words(230))).toBe(1);
    expect(readingTimeMinutes(words(231))).toBe(2);
    expect(readingTimeMinutes(words(1150))).toBe(5);
  });

  it('ignores code blocks, link targets, images and tags', () => {
    const md = [
      words(230),
      '```js\n' + words(5000) + '\n```',
      '[read this](https://example.com/' + 'x'.repeat(200) + ')',
      '![alt](https://example.com/a.png)',
      '<Chart data="' + words(400) + '" />',
    ].join('\n\n');
    // 230 prose words + the two link words ("read this") = 232 → 2 minutes.
    expect(readingTimeMinutes(md)).toBe(2);
  });

  it('counts CJK characters separately from spaced words', () => {
    expect(readingTimeMinutes('字'.repeat(400))).toBe(1);
    expect(readingTimeMinutes('字'.repeat(401))).toBe(2);
    expect(readingTimeMinutes(words(230) + ' ' + '字'.repeat(400))).toBe(2);
  });
});
