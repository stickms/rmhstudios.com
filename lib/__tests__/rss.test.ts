import { describe, it, expect } from 'vitest';
import { renderRssFeed } from '@/lib/rss';

const base = {
  title: 'RMH Studios — Blog',
  link: 'https://rmhstudios.com/blog',
  feedUrl: 'https://rmhstudios.com/blog/rss.xml',
  description: 'Dev logs & updates',
};

describe('renderRssFeed', () => {
  it('emits a valid RSS 2.0 skeleton with a self atom:link', () => {
    const xml = renderRssFeed({ ...base, items: [] });
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('rel="self" type="application/rss+xml"');
    // The channel description is XML-escaped.
    expect(xml).toContain('Dev logs &amp; updates');
  });

  it('escapes titles and CDATA-wraps descriptions, defusing ]]>', () => {
    const xml = renderRssFeed({
      ...base,
      items: [
        {
          title: 'Hello & <world>',
          link: 'https://rmhstudios.com/blog/a',
          guid: 'https://rmhstudios.com/blog/a',
          description: 'has <b>html</b> and a ]]> break-out attempt',
          pubDate: new Date('2026-07-14T00:00:00Z'),
        },
      ],
    });
    expect(xml).toContain('<title>Hello &amp; &lt;world&gt;</title>');
    // The ]]> is split so it can't terminate the CDATA early.
    expect(xml).toContain(']]]]><![CDATA[>');
    expect(xml).not.toContain('html</b> and a ]]> break');
    expect(xml).toContain('<pubDate>Tue, 14 Jul 2026 00:00:00 GMT</pubDate>');
  });

  it('omits pubDate for invalid dates', () => {
    const xml = renderRssFeed({
      ...base,
      items: [
        {
          title: 'No date',
          link: 'https://rmhstudios.com/blog/n',
          guid: 'https://rmhstudios.com/blog/n',
          description: 'x',
          pubDate: new Date('not a date'),
        },
      ],
    });
    expect(xml).not.toContain('<pubDate>');
  });

  it('renders categories and an enclosure', () => {
    const xml = renderRssFeed({
      ...base,
      items: [
        {
          title: 't',
          link: 'https://rmhstudios.com/blog/c',
          guid: 'https://rmhstudios.com/blog/c',
          description: 'd',
          categories: ['tech', 'ai'],
          imageUrl: 'https://rmhstudios.com/cover.jpg',
        },
      ],
    });
    expect(xml).toContain('<category>tech</category>');
    expect(xml).toContain('<category>ai</category>');
    expect(xml).toContain('<enclosure url="https://rmhstudios.com/cover.jpg"');
  });
});
