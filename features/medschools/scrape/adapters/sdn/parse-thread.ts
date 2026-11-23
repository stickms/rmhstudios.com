/**
 * Thread page parser. This is the anonymization boundary for forum posts: quotes are removed first, the text is
 * link-unfurl cards are dropped, the text is redacted with the page's own author handles, and the raw post id leaves only through `hashPostId`.
 * data-author and the member id are read only to key events (inside a closure); usernames, avatars, profile links, signatures and edit notes are never read into the result.
 */
import { parse } from 'node-html-parser';
import type { MedEventType } from '../../../engine/types';
import { containsHandle, redactForModel } from '../../../engine/sdn-rules';
import { SdnPageError } from './guard';

export interface SdnPost {
  postHash: string;
  postedAt: Date;
  /** Quote-stripped, plain, redacted. */
  text: string;
  /**
   * Keys an event without the caller holding the post id or the author. With a member id on the post it is
   * hashPostId(`author:${member}:${scope}:${type}`): one member counts once per event type per scope (the caller
   * passes school and cycle), whatever the post or day. Without one it is hashPostId(`${id}:${type}:${day}`).
   */
  eventKey(type: MedEventType, scope: string, day: string): string;
}

export interface ParsedThreadPage {
  posts: SdnPost[];
  lastPage: number;
  /** True when `text` contains a handle that appeared on this page (an author or a quoted member). */
  containsHandle(text: string): boolean;
}

function toDate(datetime: string | undefined, timestamp: string | undefined): Date | null {
  if (datetime) {
    const d = new Date(datetime.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    if (!Number.isNaN(d.getTime())) return d;
  }
  const n = Number(timestamp);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
}

function lastPageOf(root: ReturnType<typeof parse>): number {
  let max = 1;
  const take = (v: string | undefined) => {
    const n = Number(v);
    if (Number.isInteger(n) && n > max) max = n;
  };
  for (const a of root.querySelectorAll('li.pageNav-page a')) take(a.text.trim());
  take(root.querySelector('input.js-pageJumpPage')?.getAttribute('max'));
  const of = /(\d+)\s+of\s+(\d+)/.exec(
    root.querySelector('.pageNavSimple-el--current')?.text.replace(/\s+/g, ' ') ?? '',
  );
  take(of?.[2]);
  return max;
}

function bodyText(wrapperHtml: string): string {
  const withBreaks = wrapperHtml.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|li)>/gi, '\n');
  const plain = parse(`<x>${withBreaks}</x>`).text;
  return plain
    .split('\n')
    .map((l) => l.replace(/[\s\u00a0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export function parseThreadPage(html: string, hashPostId: (postId: string) => string): ParsedThreadPage {
  const root = parse(html);
  const articles = root.querySelectorAll('article.message--post');
  if (articles.length === 0) throw new SdnPageError('thread: no posts on page');

  // Handles seen on the page: authors, quoted members and @mention link text. Kept in memory only.
  const handles = new Set<string>();
  const addHandle = (h: string | undefined) => {
    const t = (h ?? '').trim().replace(/^@/, '');
    if (t) handles.add(t);
  };
  for (const el of root.querySelectorAll('[data-author]')) addHandle(el.getAttribute('data-author'));
  for (const el of root.querySelectorAll('[data-quote]')) addHandle(el.getAttribute('data-quote'));
  for (const el of root.querySelectorAll('div.bbWrapper a.username')) addHandle(el.text);

  const posts: Array<{
    id: string;
    postedAt: Date;
    text: string;
    /** Numeric member id (else lower-cased handle). In memory only: it appears solely inside eventKey's closure. */
    author: string | null;
  }> = [];
  for (const art of articles) {
    const id =
      /^post-(\d+)$/.exec(art.getAttribute('data-content') ?? '')?.[1] ??
      /^js-post-(\d+)$/.exec(art.getAttribute('id') ?? '')?.[1];
    // The attribution time, not a dateModified time inside an edit note.
    const time = art.querySelector('.message-attribution-main time.u-dt') ?? art.querySelector('time.u-dt');
    const postedAt = toDate(time?.getAttribute('datetime'), time?.getAttribute('data-timestamp'));
    const wrapper = art.querySelector('div.bbWrapper');
    if (!id || !postedAt || !wrapper) continue;
    // Quotes first, so quoted words (and nested quotes) never reach the text.
    for (const q of wrapper.querySelectorAll('blockquote')) q.remove();
    // A link unfurl is the linked page's own title and snippet (a member page carries a handle), not the poster's words.
    for (const u of wrapper.querySelectorAll('.bbCodeBlock--unfurl, .js-unfurl, [data-unfurl]')) u.remove();
    // The member's own link in the post header (never a mention inside the body, which is a different member).
    const uid = art
      .querySelector('.message-user [data-user-id], .message-name [data-user-id]')
      ?.getAttribute('data-user-id')
      ?.trim();
    const handle = art.getAttribute('data-author')?.trim().toLowerCase();
    posts.push({
      id,
      postedAt,
      author: uid && /^\d+$/.test(uid) ? `u${uid}` : handle ? `h${handle}` : null,
      text: bodyText(wrapper.innerHTML),
    });
  }
  if (posts.length === 0) throw new SdnPageError('thread: posts present but none parsed');

  return {
    posts: posts.map((p) => ({
      postHash: hashPostId(p.id),
      postedAt: p.postedAt,
      text: redactForModel(p.text, handles),
      eventKey: (type, scope, day) =>
        hashPostId(p.author ? `author:${p.author}:${scope}:${type}` : `${p.id}:${type}:${day}`),
    })),
    lastPage: lastPageOf(root),
    containsHandle: (text) => containsHandle(text, handles),
  };
}
