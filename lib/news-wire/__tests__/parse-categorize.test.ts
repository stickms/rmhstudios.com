/**
 * RMH News ingest: what reaches the page from a feed. A wrong link, a tracking pixel as the picture or HTML in a
 * headline is user-visible on every ingest, so the shapes the real feeds publish are pinned here.
 */
import { describe, expect, it } from 'vitest';
import { categorize, matchedKeywords } from '../categorize';
import { cleanUrl, parseFeedItem, pickImage, stripHtml, wireSlug } from '../parse';
import { NEWS_SOURCES } from '../sources';

const bbc = NEWS_SOURCES.find((s) => s.id === 'bbc-top');

describe('parseFeedItem', () => {
  it('takes the widest media:content, cleans the link and the excerpt', () => {
    const c = parseFeedItem({
      title: 'Ukraine &amp; Russia talks resume',
      link: 'https://www.theguardian.com/world/2026/nov/23/talks?utm_source=rss&CMP=feed#comments',
      isoDate: '2026-11-23T08:00:00.000Z',
      contentSnippet: '<p>Officials met in Geneva.</p>',
      categories: ['World news', { _: 'Ukraine' }],
      mediaContent: [
        { $: { url: 'https://i.guim.co.uk/a.jpg?width=140', width: '140' } },
        { $: { url: 'https://i.guim.co.uk/a.jpg?width=700', width: '700' } },
      ],
    });
    expect(c).toMatchObject({
      title: 'Ukraine & Russia talks resume',
      url: 'https://www.theguardian.com/world/2026/nov/23/talks',
      description: 'Officials met in Geneva.',
      imageUrl: 'https://i.guim.co.uk/a.jpg?width=700',
      tags: ['World news', 'Ukraine'],
    });
    expect(c?.publishedAt.toISOString()).toBe('2026-11-23T08:00:00.000Z');
  });

  it('upgrades a BBC thumbnail and falls back to an inline <img>, an enclosure, then nothing', () => {
    expect(
      pickImage(
        { mediaThumbnail: [{ $: { url: 'https://ichef.bbci.co.uk/ace/standard/240/x/y.jpg', width: '240' } }] },
        bbc,
      ),
    ).toBe('https://ichef.bbci.co.uk/ace/standard/976/x/y.jpg');
    expect(pickImage({ content: '<p><img alt="" src="http://cdn.example.com/p.jpg?a=1&amp;b=2"></p>' })).toBe(
      'https://cdn.example.com/p.jpg?a=1&b=2',
    );
    expect(pickImage({ enclosure: { url: 'https://e.example.com/x.jpg', type: 'image/jpeg' } })).toBe(
      'https://e.example.com/x.jpg',
    );
    expect(pickImage({ enclosure: { url: 'https://e.example.com/x.mp3', type: 'audio/mpeg' } })).toBeNull();
    expect(pickImage({ content: '<img src="https://t.example.com/pixel.gif">' })).toBeNull();
  });

  it('refuses items without a headline or an http(s) link, and clamps future dates', () => {
    expect(parseFeedItem({ title: '', link: 'https://x.example.com' })).toBeNull();
    expect(parseFeedItem({ title: 'A', link: 'javascript:alert(1)' })).toBeNull();
    const now = new Date('2026-11-23T12:00:00Z');
    const c = parseFeedItem(
      { title: 'A', link: 'https://x.example.com/a', isoDate: '2027-01-01T00:00:00Z' },
      undefined,
      now,
    );
    expect(c?.publishedAt).toEqual(now);
  });

  it('strips scripts and markup from HTML excerpts', () => {
    expect(stripHtml('<p>Hi<script>alert(1)</script> <b>there</b>&#8217;s</p>')).toBe('Hi there’s');
    expect(cleanUrl('ftp://x.example.com')).toBeNull();
  });
});

describe('categorize', () => {
  it('lets the headline outweigh the feed hint', () => {
    expect(categorize({ title: "UK to host 2035 Women's World Cup, Fifa confirms", hint: 'World' })).toBe('Sports');
    expect(categorize({ title: 'OpenAI ships a new chatbot for schools', hint: 'Business' })).toBe('AI');
    expect(categorize({ title: 'NASA telescope spots a distant galaxy', hint: 'Science' })).toBe('Space');
  });

  it('keeps the hint when nothing matches, and never matches inside a word', () => {
    expect(categorize({ title: 'A quiet Sunday', hint: 'Entertainment' })).toBe('Entertainment');
    // "said" contains "ai", "despaced" contains "space": neither is a match.
    expect(categorize({ title: 'Officials said nothing despaced', hint: 'World' })).toBe('World');
    expect(matchedKeywords('Nvidia chips and AI')).toEqual(['nvidia', 'chips', 'ai']);
  });
});

describe('wireSlug', () => {
  it('is stable, ASCII and keeps two links with one headline apart', () => {
    const a = wireSlug('Café owners rally — again!', 'https://a.example.com/1');
    expect(a).toMatch(/^cafe-owners-rally-again-[0-9a-z]{7}$/);
    expect(wireSlug('Café owners rally — again!', 'https://a.example.com/1')).toBe(a);
    expect(wireSlug('Café owners rally — again!', 'https://a.example.com/2')).not.toBe(a);
    expect(wireSlug('x'.repeat(10) + ' ' + 'y'.repeat(100), 'u').length).toBeLessThan(90);
  });
});
