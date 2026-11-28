const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

const IMAGE_EXT_REGEX = /\.(gif|png|jpe?g|webp|avif)(\?[^\s]*)?$/i;

export type MediaEmbedInfo = {
  originalUrl: string;
  directUrl: string | null; // null = needs async resolution (Tenor share)
  type: 'image' | 'giphy' | 'tenor' | 'tenor-pending';
};

/**
 * Strip embedded media URLs from message text.
 * Returns the content with those URLs removed (and trimmed).
 */
export function textWithoutMedia(content: string, embeds: MediaEmbedInfo[]): string {
  if (embeds.length === 0) return content;
  const embedUrls = new Set(embeds.map((e) => e.originalUrl));
  return content
    .replace(URL_REGEX, (match) => (embedUrls.has(match) ? '' : match))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Extract embeddable media from message content.
 * Returns an array of media info objects.
 */
export function extractMediaEmbeds(content: string): MediaEmbedInfo[] {
  const urls = content.match(URL_REGEX);
  if (!urls) return [];

  const embeds: MediaEmbedInfo[] = [];
  const seen = new Set<string>();

  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);

    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '');

      // Direct image URL (any host)
      if (IMAGE_EXT_REGEX.test(parsed.pathname)) {
        embeds.push({
          originalUrl: url,
          directUrl: url,
          type: 'image',
        });
        continue;
      }

      // Giphy share URL: giphy.com/gifs/[optional-slug-]ID
      if (host === 'giphy.com' && parsed.pathname.startsWith('/gifs/')) {
        const pathParts = parsed.pathname.split('/').pop() ?? '';
        const gifId = pathParts.includes('-') ? pathParts.split('-').pop() : pathParts;
        if (gifId) {
          embeds.push({
            originalUrl: url,
            directUrl: `https://media1.giphy.com/media/${gifId}/giphy.gif`,
            type: 'giphy',
          });
        }
        continue;
      }

      // Giphy media URL (already direct)
      if (
        (host.match(/^media\d*\.giphy\.com$/) || host === 'i.giphy.com') &&
        /\.(gif|mp4|webp)(\?|$)/i.test(parsed.pathname)
      ) {
        embeds.push({
          originalUrl: url,
          directUrl: url,
          type: 'giphy',
        });
        continue;
      }

      // Tenor media URL (already direct)
      if (host.match(/^media\d*\.tenor\.com$/) && /\.(gif|mp4|webp|png)(\?|$)/i.test(parsed.pathname)) {
        embeds.push({
          originalUrl: url,
          directUrl: url,
          type: 'tenor',
        });
        continue;
      }

      // Tenor share URL: tenor.com/view/[slug]-gif-[id]
      if (host === 'tenor.com' && parsed.pathname.startsWith('/view/')) {
        embeds.push({
          originalUrl: url,
          directUrl: null,
          type: 'tenor-pending',
        });
        continue;
      }
    } catch {
      // Invalid URL — skip
    }
  }

  return embeds;
}
