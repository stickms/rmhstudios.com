/**
 * Reading subscriptions (follow the Logs, a Log tag, a News category or a story): pure logic.
 *
 * Client-safe: no Prisma, no server imports. Target validation, which subscriptions an item matches, the
 * per-subscriber item selection the daily email uses, and the email's own markup. The server half is
 * `subscriptions.server.ts`; the strings a member reads in the app are translated by the components.
 */
import { ALL_CATEGORIES } from '@/lib/news-categories';

export const SUBSCRIPTION_KINDS = ['blog', 'blog_tag', 'news_category', 'news_story'] as const;
export type SubscriptionKind = (typeof SUBSCRIPTION_KINDS)[number];

/** A member keeps at most this many subscriptions. */
export const MAX_SUBSCRIPTIONS = 100;
/** `reading_subscription.target` is a VarChar(80). */
export const TARGET_MAX = 80;
/** One email carries at most this many items. */
export const EMAIL_MAX_ITEMS = 20;

export function isSubscriptionKind(value: unknown): value is SubscriptionKind {
  return typeof value === 'string' && (SUBSCRIPTION_KINDS as readonly string[]).includes(value);
}

export type TargetCheck =
  | {
      ok: true;
      target: string;
    }
  | {
      ok: false;
      reason: 'invalid-target' | 'target-not-allowed' | 'target-required' | 'target-too-long' | 'unknown-category';
    };

const STORY_SLUG = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Whether `target` is well formed for `kind`, and its normal form. The checks that need a database (the tag has a
 * post, the story exists) are the server's; the shape and the category list are decided here.
 */
export function validateTarget(kind: SubscriptionKind, target: string): TargetCheck {
  const value = target.trim();
  switch (kind) {
    case 'blog':
      return value === ''
        ? {
            ok: true,
            target: '',
          }
        : {
            ok: false,
            reason: 'target-not-allowed',
          };
    case 'news_category':
      return ALL_CATEGORIES.includes(value)
        ? {
            ok: true,
            target: value,
          }
        : {
            ok: false,
            reason: 'unknown-category',
          };
    case 'blog_tag':
    case 'news_story':
      if (value === '')
        return {
          ok: false,
          reason: 'target-required',
        };
      if (value.length > TARGET_MAX)
        return {
          ok: false,
          reason: 'target-too-long',
        };
      return kind === 'news_story' && !STORY_SLUG.test(value)
        ? {
            ok: false,
            reason: 'invalid-target',
          }
        : {
            ok: true,
            target: value,
          };
  }
}

/** The part of a subscription that decides what it matches. */
export interface SubscriptionKey {
  userId: string;
  kind: SubscriptionKind;
  target: string;
}

/** A new Log or published News article, as the matcher and the email see it. */
export interface ReadingItem {
  source: 'blog' | 'news';
  id: string;
  slug: string;
  title: string;
  description: string;
  createdAt: Date;
  tags: readonly string[];
  /** News only. */
  category?: string;
  /** News only: the slug of the story the article belongs to, when it belongs to one. */
  storySlug?: string | null;
}

export function matchesSubscription(item: ReadingItem, sub: Pick<SubscriptionKey, 'kind' | 'target'>): boolean {
  switch (sub.kind) {
    case 'blog':
      return item.source === 'blog';
    case 'blog_tag':
      return item.source === 'blog' && item.tags.includes(sub.target);
    case 'news_category':
      return item.source === 'news' && item.category === sub.target;
    case 'news_story':
      return item.source === 'news' && !!item.storySlug && item.storySlug === sub.target;
  }
}

/**
 * The members to notify about `item`: each once, however many of their subscriptions match it (the Logs and one
 * of its tags; a category and a story that contain the same article).
 */
export function matchingSubscribers(item: ReadingItem, subs: readonly SubscriptionKey[]): string[] {
  const users = new Set<string>();
  for (const sub of subs) if (matchesSubscription(item, sub)) users.add(sub.userId);
  return [...users];
}

export function itemPath(item: Pick<ReadingItem, 'source' | 'slug'>): string {
  return `/${item.source === 'blog' ? 'blog' : 'news'}/${item.slug}`;
}

/** The `Notification.entityType` an item's notification carries. */
export function itemEntityType(item: Pick<ReadingItem, 'source'>): 'blog_post' | 'news_article' {
  return item.source === 'blog' ? 'blog_post' : 'news_article';
}

/** A subscription with the moment its member was last emailed (or followed), for the daily batch. */
export interface EmailSubscription extends SubscriptionKey {
  /** `lastEmailedAt`, or `createdAt` when nothing has been sent yet: items older than this are not news to them. */
  since: Date;
}

/**
 * The items one member's email carries: newest first, at most {@link EMAIL_MAX_ITEMS}, each at most once, and only
 * items newer than the `since` of a subscription that matches them (so following a tag today never mails last
 * week's posts under the tag).
 */
export function itemsForEmail(items: readonly ReadingItem[], subs: readonly EmailSubscription[]): ReadingItem[] {
  return items
    .filter((item) => subs.some((s) => item.createdAt > s.since && matchesSubscription(item, s)))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, EMAIL_MAX_ITEMS);
}

function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] ?? c,
  );
}

function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export interface SubscriptionEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * The daily email: a title, a line of description and a link per item, and one line saying how to stop. Inline
 * styles only (mail clients ignore stylesheets and tokens). English: the email templates carry no locale yet.
 */
export function renderSubscriptionEmail(
  items: readonly ReadingItem[],
  opts: {
    siteUrl: string;
    unsubscribeUrl: string;
    settingsUrl: string;
  },
): SubscriptionEmail {
  const abs = (item: ReadingItem) => `${opts.siteUrl}${itemPath(item)}`;
  const subject =
    items.length === 1 && items[0]
      ? `New on RMH Studios: ${clip(items[0].title, 80)}`
      : `${items.length} new items from the Logs and News you follow`;

  const rows = items
    .map(
      (item) =>
        `<tr><td style="padding:14px 0;border-bottom:1px solid #e5e5e5">` +
        `<a href="${esc(abs(item))}" style="font-size:16px;font-weight:600;color:#111;text-decoration:none">${esc(item.title)}</a>` +
        `<div style="font-size:12px;color:#666;margin-top:2px">${item.source === 'blog' ? 'Logs' : 'News'}</div>` +
        `<p style="font-size:14px;line-height:1.5;color:#333;margin:6px 0 0">${esc(clip(item.description, 200))}</p>` +
        `</td></tr>`,
    )
    .join('');

  const html =
    `<!doctype html><html lang="en"><body style="margin:0;background:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px">` +
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px">` +
    `<tr><td style="font-size:20px;font-weight:600;color:#111;padding-bottom:8px">New from the Logs and News you follow</td></tr>` +
    rows +
    `<tr><td style="padding-top:20px;font-size:12px;line-height:1.5;color:#666">` +
    `You get this once a day, only when something new matches what you follow. ` +
    `<a href="${esc(opts.settingsUrl)}" style="color:#666">Change what you follow</a> or ` +
    `<a href="${esc(opts.unsubscribeUrl)}" style="color:#666">turn these emails off</a>.` +
    `</td></tr></table></td></tr></table></body></html>`;

  const text =
    `New from the Logs and News you follow\n\n` +
    items.map((item) => `${item.title}\n${clip(item.description, 200)}\n${abs(item)}`).join('\n\n') +
    `\n\nChange what you follow: ${opts.settingsUrl}\nTurn these emails off: ${opts.unsubscribeUrl}\n`;

  return {
    subject,
    html,
    text,
  };
}
