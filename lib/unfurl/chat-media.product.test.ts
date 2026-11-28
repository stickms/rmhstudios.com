import { describe, expect, it } from 'vitest';
import { extractMediaEmbeds, textWithoutMedia } from './chat-media';

describe('chat media URLs', () => {
  it('preserves ordinary links and strips all occurrences of each embed', () => {
    const image = 'https://example.org/banner.AVIF?size=2';
    const link = 'https://example.org/';
    const content = [image, link, image].join(' ');
    const embeds = extractMediaEmbeds(content);
    expect(embeds).toEqual([{ originalUrl: image, directUrl: image, type: 'image' }]);
    expect(textWithoutMedia(content, embeds)).toBe(link);
    expect(textWithoutMedia('  plain  text  ', [])).toBe('  plain  text  ');
  });

  it('resolves Giphy share URLs locally and leaves Tenor shares pending', () => {
    const giphy = 'https://giphy.com/gifs/cat-AbCd';
    const tenor = 'https://tenor.com/view/cat-gif-12';
    expect(extractMediaEmbeds(giphy + ' ' + tenor)).toEqual([
      { originalUrl: giphy, directUrl: 'https://media1.giphy.com/media/AbCd/giphy.gif', type: 'giphy' },
      { originalUrl: tenor, directUrl: null, type: 'tenor-pending' },
    ]);
  });
});
