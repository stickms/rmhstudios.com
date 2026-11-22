import { describe, expect, it } from 'vitest';
import { extractFirstUrl, postLinkPreviewUrl } from './first-link';

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
