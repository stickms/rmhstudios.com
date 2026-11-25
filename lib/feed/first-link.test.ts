import { describe, expect, it } from 'vitest';
import { extractFirstUrl, postLinkPreviewUrl, textWithoutPreviewedLink } from './first-link';

describe('first link of a post', () => {
  it('drops sentence punctuation but keeps a bracket the URL opened', () => {
    expect(extractFirstUrl('see https://a.test/x. and https://b.test')).toBe('https://a.test/x');
    expect(extractFirstUrl('(https://a.test/x)')).toBe('https://a.test/x');
    expect(extractFirstUrl('https://en.wikipedia.org/wiki/Go_(game)')).toBe('https://en.wikipedia.org/wiki/Go_(game)');
  });

  it('unfurls nothing for a post with its own media', () => {
    expect(postLinkPreviewUrl({ content: 'https://a.test', imageUrls: ['x'] })).toBeNull();
    expect(postLinkPreviewUrl({ content: 'https://a.test', gifUrl: 'g' })).toBeNull();
    expect(postLinkPreviewUrl({ content: 'hi https://a.test' })).toBe('https://a.test');
  });
});

describe('textWithoutPreviewedLink', () => {
  const url = 'https://example.com/a';
  it('drops a lone trailing link', () => {
    expect(textWithoutPreviewedLink(`big news\n${url}`, url)).toBe('big news');
    expect(textWithoutPreviewedLink(url, url)).toBe('');
  });
  it('keeps a link in the middle, several links, or no preview', () => {
    expect(textWithoutPreviewedLink(`see ${url} now`, url)).toBe(`see ${url} now`);
    expect(textWithoutPreviewedLink(`https://b.com ${url}`, url)).toBe(`https://b.com ${url}`);
    expect(textWithoutPreviewedLink(`hi ${url}`, null)).toBe(`hi ${url}`);
  });
});
