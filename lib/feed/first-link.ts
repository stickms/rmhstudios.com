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

/**
 * The text to show when the post's link is drawn as a card beneath it (the way X drops the
 * link). Only a lone link that ends the text (or is the whole text) is removed; a link in the
 * middle of a sentence, or one of several, stays where the author put it. Display only: the
 * stored content is untouched, so the card is still found from it.
 */
export function textWithoutPreviewedLink(text: string, previewUrl: string | null): string {
  if (!previewUrl) return text;
  const trimmed = text.trimEnd();
  if (!trimmed.endsWith(previewUrl)) return text;
  const head = trimmed.slice(0, trimmed.length - previewUrl.length);
  if (URL_RE.test(head)) return text;
  return head.trimEnd();
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
