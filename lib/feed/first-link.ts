/**
 * Which link a post unfurls (client-safe, pure). One rule for the feed row, the
 * card and the post page: the FIRST http(s) link of a post that carries no poll,
 * GIF or image of its own, the way X and Bluesky pick theirs.
 */

const URL_RE = /https?:\/\/[^\s<>"']+/i;

/**
 * The first http(s) URL in `text`, without the punctuation a sentence leaves on
 * it ("see https://a.com/x." or "(https://a.com/x)"). A closing bracket stays when
 * the URL opened one itself, as Wikipedia paths do.
 */
export function extractFirstUrl(text: string): string | null {
  const match = text.match(URL_RE);
  if (!match) return null;
  let url = match[0];
  for (;;) {
    const last = url.at(-1);
    if (!last) break;
    if ('.,;:!?\'"'.includes(last)) {
      url = url.slice(0, -1);
      continue;
    }
    const pair = last === ')' ? '(' : last === ']' ? '[' : null;
    if (pair && url.split(pair).length <= url.split(last).length - 1) {
      url = url.slice(0, -1);
      continue;
    }
    break;
  }
  return url.length > 'https://'.length ? url : null;
}

interface LinkablePost {
  content?: string | null;
  poll?: unknown;
  gifUrl?: string | null;
  imageUrls?: readonly string[] | null;
}

/** The URL to unfurl under a post, or null when it has media of its own or no link. */
export function postLinkPreviewUrl(post: LinkablePost | null | undefined): string | null {
  if (!post || post.poll || post.gifUrl || (post.imageUrls && post.imageUrls.length > 0) || !post.content) {
    return null;
  }
  return extractFirstUrl(post.content);
}
