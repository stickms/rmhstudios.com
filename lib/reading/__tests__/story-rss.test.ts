import { describe, expect, it } from 'vitest';
import { storyFeedXml } from '@/lib/reading/story-rss';

/** The story feed (s13-12): the items, newest first as given, and the escaping every feed has. */

const SITE = 'https://example.test';
const story = {
  slug: 'big-story',
  title: 'The <big> & "bold" story',
  summary: 'What happened \u0000next',
  articles: [
    {
      slug: 'b',
      title: 'Second & final',
      date: '2026-12-20',
      description: 'Later <b>news</b>',
      category: 'World',
      image: '/img/b.jpg',
    },
    { slug: 'a', title: 'First', date: '2026-12-01', description: 'Earlier', category: '', image: null },
  ],
};

describe('storyFeedXml', () => {
  const xml = storyFeedXml(story, SITE);

  it('has a channel pointing at the story and at its own feed', () => {
    expect(xml).toContain('<rss');
    expect(xml).toContain(`<link>${SITE}/news/stories/big-story</link>`);
    expect(xml).toContain(`${SITE}/news/stories/big-story/rss.xml`);
  });

  it('lists each article as an item linking to its news page, in the order given', () => {
    expect(xml).toContain(`<link>${SITE}/news/b</link>`);
    expect(xml).toContain(`<guid isPermaLink="true">${SITE}/news/a</guid>`);
    expect(xml.indexOf('/news/b</link>')).toBeLessThan(xml.indexOf('/news/a</link>'));
    expect(xml.match(/<item>/g)).toHaveLength(2);
    expect(xml).toContain(`${SITE}/img/b.jpg`);
  });

  it('escapes markup in titles and strips characters XML forbids', () => {
    expect(xml).toContain('The &lt;big&gt; &amp; &quot;bold&quot; story');
    expect(xml).toContain('Second &amp; final');
    expect(xml).not.toContain('\u0000');
    expect(xml).not.toMatch(/<title>[^<]*<big>/);
  });

  it('dates items from the article date', () => {
    expect(xml).toContain('<pubDate>Sun, 20 Dec 2026 00:00:00 GMT</pubDate>');
  });

  it('is a valid empty feed for a story with no articles', () => {
    const empty = storyFeedXml({ ...story, articles: [] }, SITE);
    expect(empty).toContain('<channel>');
    expect(empty).not.toContain('<item>');
  });
});
