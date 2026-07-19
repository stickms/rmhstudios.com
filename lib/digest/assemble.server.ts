/**
 * Weekly Digest assembly (§10).
 *
 * Gathers a single user's "what you missed" payload — top posts from the people
 * they follow, one editorial pick (news or blog), a quest/streak snapshot, and
 * any upcoming events they RSVP'd to — and renders it into a hand-rolled HTML
 * email (INLINE styles only; email clients strip <style> and ignore our design
 * tokens). Returns `null` when there's nothing worth sending or the user is
 * ineligible (no email, or active within the last 48h — the digest is a
 * re-engagement nudge, not a notification for people already on-site).
 *
 * Server-only: touches Prisma and reads server helpers.
 */

import { prisma } from '@/lib/prisma.server';
import { SITE_URL } from '@/lib/seo';
import { signUnsubToken } from '@/lib/email/unsubscribe';
import { getStreak } from '@/lib/streak.server';
import { getActiveQuests } from '@/lib/quests/engine.server';

const DAY_MS = 86_400_000;

/** Bounds a query window so a long-dormant user doesn't scan months of posts. */
const MAX_LOOKBACK_MS = 30 * DAY_MS;
/** Skip users seen within this window — they don't need a catch-up email. */
const ACTIVE_SKIP_MS = 48 * 60 * 60 * 1000;

export interface AssembledDigest {
  subject: string;
  html: string;
  text: string;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
  ));
}

/** Absolute URL for an in-app path. */
function abs(path: string): string {
  return path.startsWith('http') ? path : `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

interface DigestPost {
  id: string;
  href: string;
  author: string;
  content: string;
  likeCount: number;
  commentCount: number;
}

interface Editorial {
  kind: 'news' | 'blog';
  title: string;
  description: string;
  href: string;
}

interface UpcomingEvent {
  title: string;
  startsAt: Date;
}

/** Engagement score used to rank followed-user posts for the digest. */
function score(p: { likeCount: number; commentCount: number; repostCount: number; viewCount: number }): number {
  return p.likeCount * 3 + p.commentCount * 2 + p.repostCount * 4 + p.viewCount * 0.05;
}

async function topPostsFromFollows(userId: string, since: Date): Promise<DigestPost[]> {
  const follows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
    take: 5000,
  });
  const followingIds = follows.map((f) => f.followingId);
  if (followingIds.length === 0) return [];

  const posts = await prisma.rMHark.findMany({
    where: {
      userId: { in: followingIds },
      createdAt: { gte: since },
      deletedAt: null,
      audience: 'PUBLIC',
      originalId: null, // skip bare reposts; surface original authored posts
    },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: {
      id: true,
      content: true,
      likeCount: true,
      commentCount: true,
      repostCount: true,
      viewCount: true,
      user: { select: { name: true, handle: true, username: true } },
    },
  });

  return posts
    .sort((a, b) => score(b) - score(a))
    .slice(0, 3)
    .map((p) => {
      // The post permalink resolves by postId; the `$userid` segment is the
      // author's handle (decorative — any value loads the post).
      const seg = p.user.handle || p.user.username || 'u';
      return {
        id: p.id,
        href: `/u/${encodeURIComponent(seg)}/post/${p.id}`,
        author: p.user.name || (p.user.handle ? `@${p.user.handle}` : p.user.username) || 'Someone',
        content: truncate(p.content || '', 200),
        likeCount: p.likeCount,
        commentCount: p.commentCount,
      };
    });
}

async function latestEditorial(): Promise<Editorial | null> {
  const [news, blog] = await Promise.all([
    prisma.newsArticle
      .findFirst({ where: { status: 'PUBLISHED' }, orderBy: { date: 'desc' }, select: { slug: true, title: true, description: true, date: true } })
      .catch(() => null),
    prisma.blogPost
      .findFirst({ orderBy: { date: 'desc' }, select: { slug: true, title: true, description: true, date: true } })
      .catch(() => null),
  ]);

  const candidates: (Editorial & { sort: number })[] = [];
  if (news) candidates.push({ kind: 'news', title: news.title, description: news.description, href: `/news/${news.slug}`, sort: Date.parse(news.date) || 0 });
  if (blog) candidates.push({ kind: 'blog', title: blog.title, description: blog.description, href: `/blog/${blog.slug}`, sort: Date.parse(blog.date) || 0 });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.sort - a.sort);
  const pick = candidates[0];
  return { kind: pick.kind, title: pick.title, description: truncate(pick.description, 180), href: pick.href };
}

/** Best-effort quest/streak snapshot. Any failure degrades to nulls. */
async function progressSnapshot(userId: string): Promise<{ streak: number | null; claimableQuests: number | null }> {
  const [streak, quests] = await Promise.all([
    getStreak(userId).then((s) => s.current).catch(() => null),
    getActiveQuests(userId).then((qs) => qs.filter((q) => q.completed && !q.claimed).length).catch(() => null),
  ]);
  return { streak, claimableQuests: quests };
}

/** Best-effort upcoming RSVP'd events. The events models may not be populated. */
async function upcomingEvents(userId: string): Promise<UpcomingEvent[]> {
  try {
    const rsvps = await prisma.eventRsvp.findMany({
      where: {
        userId,
        status: 'going',
        event: { startsAt: { gte: new Date() }, canceledAt: null },
      },
      orderBy: { event: { startsAt: 'asc' } },
      take: 3,
      select: { event: { select: { title: true, startsAt: true } } },
    });
    return rsvps.map((r) => ({ title: r.event.title, startsAt: r.event.startsAt }));
  } catch {
    return [];
  }
}

function formatDate(value: Date): string {
  try {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(value);
  } catch {
    return value.toISOString();
  }
}

/**
 * Build the digest for a single user. Returns `null` when the user is
 * ineligible or there is not enough fresh content to justify an email.
 */
export async function assembleDigest(userId: string): Promise<AssembledDigest | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, handle: true, lastSeenAt: true, createdAt: true },
  });
  if (!user || !user.email) return null;

  const now = Date.now();

  // Skip rule: someone active in the last 48h doesn't need a catch-up email.
  if (user.lastSeenAt && now - user.lastSeenAt.getTime() < ACTIVE_SKIP_MS) return null;

  // "Since you were last here" window, floored so a long-dormant account still
  // gets a bounded, relevant scan (fallback: last 7 days when never seen).
  const sinceBase = user.lastSeenAt ? user.lastSeenAt.getTime() : now - 7 * DAY_MS;
  const since = new Date(Math.max(sinceBase, now - MAX_LOOKBACK_MS));

  const [posts, editorial, snapshot, events] = await Promise.all([
    topPostsFromFollows(user.id, since),
    latestEditorial(),
    progressSnapshot(user.id),
    upcomingEvents(user.id),
  ]);

  // Nothing worth sending: no posts, no editorial, no events, no claimable
  // quests, no active streak → skip rather than send an empty shell.
  const hasContent =
    posts.length > 0 ||
    Boolean(editorial) ||
    events.length > 0 ||
    (snapshot.claimableQuests ?? 0) > 0 ||
    (snapshot.streak ?? 0) > 0;
  if (!hasContent) return null;

  const firstName = (user.name || (user.handle ? `@${user.handle}` : '') || 'there').split(' ')[0];
  const token = signUnsubToken(user.id);
  const unsubUrl = `${SITE_URL}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;

  const { html, text, subject } = renderDigest({ firstName, posts, editorial, snapshot, events, unsubUrl });
  return { subject, html, text };
}

interface RenderInput {
  firstName: string;
  posts: DigestPost[];
  editorial: Editorial | null;
  snapshot: { streak: number | null; claimableQuests: number | null };
  events: UpcomingEvent[];
  unsubUrl: string;
}

function renderDigest(input: RenderInput): { html: string; text: string; subject: string } {
  const { firstName, posts, editorial, snapshot, events, unsubUrl } = input;
  const subject = posts.length
    ? `Your weekly RMH digest — ${posts.length} post${posts.length === 1 ? '' : 's'} you missed`
    : 'Your weekly RMH digest';

  const bg = '#0b0b12';
  const card = '#15151f';
  const border = '#26263a';
  const textCol = '#e7e7f0';
  const muted = '#a1a1b5';
  const accent = '#8b5cf6';

  const sections: string[] = [];

  if (posts.length > 0) {
    const items = posts
      .map(
        (p) => `
        <tr><td style="padding:0 0 14px 0;">
          <a href="${esc(abs(p.href))}" style="display:block;text-decoration:none;color:${textCol};background:${card};border:1px solid ${border};border-radius:12px;padding:16px;">
            <div style="font-size:13px;color:${muted};margin-bottom:6px;">${esc(p.author)}</div>
            <div style="font-size:15px;line-height:1.45;color:${textCol};">${esc(p.content) || '<em style="color:' + muted + '">[media post]</em>'}</div>
            <div style="font-size:12px;color:${muted};margin-top:10px;">♥ ${p.likeCount} · 💬 ${p.commentCount}</div>
          </a>
        </td></tr>`,
      )
      .join('');
    sections.push(`
      <tr><td style="padding:8px 0 4px 0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${muted};">Top posts from people you follow</td></tr>
      <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table></td></tr>`);
  }

  if (editorial) {
    sections.push(`
      <tr><td style="padding:8px 0 4px 0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${muted};">${editorial.kind === 'news' ? 'From the newsroom' : 'From the blog'}</td></tr>
      <tr><td style="padding:0 0 14px 0;">
        <a href="${esc(abs(editorial.href))}" style="display:block;text-decoration:none;background:${card};border:1px solid ${border};border-radius:12px;padding:16px;">
          <div style="font-size:16px;font-weight:600;color:${textCol};">${esc(editorial.title)}</div>
          <div style="font-size:14px;line-height:1.45;color:${muted};margin-top:6px;">${esc(editorial.description)}</div>
        </a>
      </td></tr>`);
  }

  if (events.length > 0) {
    const rows = events
      .map(
        (e) => `<div style="font-size:14px;color:${textCol};margin-bottom:6px;">📅 <strong>${esc(e.title)}</strong> <span style="color:${muted};">— ${esc(formatDate(e.startsAt))}</span></div>`,
      )
      .join('');
    sections.push(`
      <tr><td style="padding:8px 0 4px 0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${muted};">Your upcoming events</td></tr>
      <tr><td style="padding:0 0 14px 0;background:${card};border:1px solid ${border};border-radius:12px;">
        <div style="padding:16px;">${rows}</div>
      </td></tr>`);
  }

  const snapBits: string[] = [];
  if ((snapshot.streak ?? 0) > 0) snapBits.push(`🔥 <strong>${snapshot.streak}-day</strong> streak going`);
  if ((snapshot.claimableQuests ?? 0) > 0) snapBits.push(`🎯 <strong>${snapshot.claimableQuests}</strong> quest reward${snapshot.claimableQuests === 1 ? '' : 's'} ready to claim`);
  if (snapBits.length > 0) {
    sections.push(`
      <tr><td style="padding:0 0 14px 0;">
        <div style="background:${card};border:1px solid ${border};border-radius:12px;padding:16px;font-size:14px;color:${textCol};line-height:1.7;">
          ${snapBits.join('<br/>')}
        </div>
      </td></tr>`);
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${bg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="padding:8px 0 20px 0;">
          <div style="font-size:22px;font-weight:700;color:${textCol};">RMH Studios</div>
          <div style="font-size:15px;color:${muted};margin-top:4px;">Hey ${esc(firstName)}, here's what you missed this week.</div>
        </td></tr>
        ${sections.join('\n')}
        <tr><td style="padding:12px 0 4px 0;" align="center">
          <a href="${esc(SITE_URL)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px;">Open RMH Studios</a>
        </td></tr>
        <tr><td style="padding:24px 0 8px 0;border-top:1px solid ${border};margin-top:16px;">
          <div style="font-size:12px;color:${muted};line-height:1.6;">
            You're receiving this because you enabled the weekly digest.
            <a href="${esc(unsubUrl)}" style="color:${muted};text-decoration:underline;">Unsubscribe</a> ·
            <a href="${esc(SITE_URL)}/settings" style="color:${muted};text-decoration:underline;">Notification settings</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const textLines: string[] = [`Hey ${firstName}, here's what you missed this week.`, ''];
  if (posts.length) {
    textLines.push('TOP POSTS');
    for (const p of posts) textLines.push(`- ${p.author}: ${p.content} (${abs(p.href)})`);
    textLines.push('');
  }
  if (editorial) {
    textLines.push(editorial.kind === 'news' ? 'FROM THE NEWSROOM' : 'FROM THE BLOG');
    textLines.push(`- ${editorial.title} — ${abs(editorial.href)}`);
    textLines.push('');
  }
  if (events.length) {
    textLines.push('UPCOMING EVENTS');
    for (const e of events) textLines.push(`- ${e.title} — ${formatDate(e.startsAt)}`);
    textLines.push('');
  }
  if (snapBits.length) {
    if ((snapshot.streak ?? 0) > 0) textLines.push(`Streak: ${snapshot.streak} days`);
    if ((snapshot.claimableQuests ?? 0) > 0) textLines.push(`Quest rewards ready: ${snapshot.claimableQuests}`);
    textLines.push('');
  }
  textLines.push(`Open RMH Studios: ${SITE_URL}`);
  textLines.push(`Unsubscribe: ${unsubUrl}`);

  return { html, text: textLines.join('\n'), subject };
}
