/**
 * Share representations (plan B18).
 *
 * "Share" means different things depending on where the link is going: a chat
 * wants a bare URL, a README wants markdown, a blog post wants an iframe, and a
 * quote-tweet-style repost wants the text carried along with the link. Today
 * `ShareModal` hard-codes exactly two of those (the URL, and an iframe snippet
 * for posts) with the embed markup written inline, so nothing else on the site
 * can offer them and the post URL is rebuilt by hand at each call site.
 *
 * This module is the one place that turns *(kind, entity)* into every form the
 * thing can be pasted as. It is pure, dependency-free and client-safe, so a
 * share sheet, the command palette, a keyboard shortcut and a test can all
 * agree on what a link to a post looks like.
 *
 * URLs are absolute and built from `SITE_URL`, never from `window.location`:
 * these strings are copied into someone *else's* document, where a relative
 * path resolves against their origin, and a preview/staging origin would leak
 * an unreachable host into a permanent artefact.
 */

import { SITE_URL } from '@/lib/seo';

export type ShareKind =
  'post' | 'profile' | 'blog' | 'news' | 'library' | 'game' | 'app' | 'replay';

export interface ShareEntity {
  /** Id or slug, whichever the canonical route takes. */
  id: string;
  /** Human title — markdown link text, quote attribution, iframe `title`. */
  title?: string;
  /** Author handle. Required for posts: the canonical route is `/u/{handle}/post/{id}`. */
  handle?: string;
  /** Body text; when present a `quote` representation is offered. */
  text?: string;
  /**
   * Canonical site-relative path, overriding the derived one. Needed for apps
   * (each owns a bespoke top-level route — see `lib/apps.ts`) and useful for
   * anything whose URL the caller already knows.
   */
  path?: string;
}

export interface ShareRepresentation {
  id: 'link' | 'markdown' | 'embed' | 'quote';
  /** English label. Render as `t(labelKey, { defaultValue: label })`. */
  label: string;
  /** i18n key for `label`, in the `feed` namespace alongside the other share copy. */
  labelKey: string;
  /** The text to copy. */
  value: string;
}

/**
 * The two kinds with a chrome-free embed route (`app/routes/embed.*.tsx`).
 * Anything else has no iframe to point at, so it gets no embed option rather
 * than a snippet that renders the full site chrome inside a 320px box.
 */
const EMBEDS: Partial<Record<ShareKind, { path: (id: string) => string; height: number }>> = {
  post: { path: (id) => `/embed/post/${encodeURIComponent(id)}`, height: 320 },
  replay: { path: (id) => `/embed/replay/${encodeURIComponent(id)}`, height: 420 },
};

/** Longest quote we paste before trimming — roughly a post's worth of text. */
const QUOTE_MAX = 240;

const enc = encodeURIComponent;

/** Canonical site-relative path for an entity. */
export function sharePath(kind: ShareKind, entity: ShareEntity): string {
  if (entity.path) return entity.path;
  switch (kind) {
    case 'post':
      // `_` is the established placeholder when the author handle is unknown
      // (see NotificationsColumn) — the route resolves the post by id anyway.
      return `/u/${enc(entity.handle ?? '_')}/post/${enc(entity.id)}`;
    case 'profile':
      return `/u/${enc(entity.handle ?? entity.id)}`;
    case 'blog':
      return `/blog/${enc(entity.id)}`;
    case 'news':
      return `/news/${enc(entity.id)}`;
    case 'library':
      return `/library/${enc(entity.id)}`;
    case 'game':
      return `/games/${enc(entity.id)}`;
    case 'replay':
      return `/replays/${enc(entity.id)}`;
    case 'app':
      // Apps have no `/apps/{id}` detail route; the caller passes `path`.
      return `/apps`;
  }
}

/** Absolute canonical URL for an entity. */
export function shareUrl(kind: ShareKind, entity: ShareEntity): string {
  return `${SITE_URL}${sharePath(kind, entity)}`;
}

/** Collapse whitespace and trim to `QUOTE_MAX`, ending on a word where possible. */
function condense(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= QUOTE_MAX) return flat;
  const cut = flat.slice(0, QUOTE_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > QUOTE_MAX * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Escape the characters that would break out of a markdown link label. */
function mdEscape(text: string): string {
  return text.replace(/([[\]])/g, '\\$1');
}

/** Escape for an HTML double-quoted attribute value. */
function attr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Every way this entity can be pasted, in the order a share sheet should offer
 * them. `embed` appears only for embeddable kinds and `quote` only when there
 * is text to quote — the list is meant to be rendered as-is, not filtered again
 * by the caller.
 */
export function representations(kind: ShareKind, entity: ShareEntity): ShareRepresentation[] {
  const url = shareUrl(kind, entity);
  const title = entity.title?.trim();
  const out: ShareRepresentation[] = [
    { id: 'link', label: 'Link', labelKey: 'share-rep-link', value: url },
    {
      id: 'markdown',
      label: 'Markdown',
      labelKey: 'share-rep-markdown',
      value: `[${mdEscape(title || url)}](${url})`,
    },
  ];

  const embed = EMBEDS[kind];
  if (embed) {
    // The snippet is styled with literal CSS on purpose. It is pasted into a
    // third-party document where `--site-*` does not exist, so a token would
    // resolve to nothing and the frame would inherit that page's borders.
    const label = title || 'RMH Studios';
    out.push({
      id: 'embed',
      label: 'Embed',
      labelKey: 'share-rep-embed',
      value:
        `<iframe src="${attr(`${SITE_URL}${embed.path(entity.id)}`)}" ` +
        `width="100%" height="${embed.height}" loading="lazy" ` +
        `style="border:0;border-radius:16px;max-width:560px" ` +
        `title="${attr(label)}"></iframe>`,
    });
  }

  const text = entity.text?.trim();
  if (text) {
    const attribution = entity.handle ? `@${entity.handle}` : title;
    out.push({
      id: 'quote',
      label: 'Quote',
      labelKey: 'share-rep-quote',
      value: `“${condense(text)}”${attribution ? ` — ${attribution}` : ''}\n${url}`,
    });
  }

  return out;
}
