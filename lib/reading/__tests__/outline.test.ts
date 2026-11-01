import { describe, expect, it } from 'vitest';
import { extractOutline, plainHeadingText, slugifyHeading } from '../outline';

describe('article outline', () => {
  it('slugifies across scripts and strips accents', () => {
    expect(slugifyHeading('Café Society!')).toBe('cafe-society');
    expect(slugifyHeading('日本語 の 見出し')).toBe('日本語-の-見出し');
    expect(slugifyHeading('???')).toBe('section');
  });

  it('unwraps inline markdown', () => {
    expect(plainHeadingText('The **bold** [link](http://x.y) and `code`')).toBe(
      'The bold link and code',
    );
  });

  it('collects h2/h3 in order, with unique ids', () => {
    const md = ['# Title', '## Intro', 'text', '### Detail ##', '## Intro', '#### skip'].join('\n');
    expect(extractOutline(md)).toEqual([
      { id: 'intro', text: 'Intro', level: 2 },
      { id: 'detail', text: 'Detail', level: 3 },
      { id: 'intro-2', text: 'Intro', level: 2 },
    ]);
  });

  it('ignores headings inside fenced code', () => {
    const md = [
      '## Real',
      '```md',
      '## Fake',
      '```',
      '~~~',
      '### Also fake',
      '~~~',
      '## After',
    ].join('\n');
    expect(extractOutline(md).map((i) => i.text)).toEqual(['Real', 'After']);
  });
});
