/**
 * A6 · Keyword alerts — persistence and the post fan-out. An alert is a Feed of
 * kind 'alert' (`CustomFeed`, `lib/feeds/kinds.ts`) with `notify` on: `query`
 * holds its terms and `anchor` its one indexed required word. The fan-out
 * reads every Feed with `notify` and an anchor, so it is the push half of the
 * same model `/feeds/$id` reads. Matching itself is
 * `lib/search/keyword-alerts.ts` (no member input ever becomes regex syntax).
 */
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import { getMutedWords } from '@/lib/feed/timeline';
import { MAX_ALERTS, alertAnchor, compileAlert, fold, matches } from '@/lib/search/keyword-alerts';

const MAX_CANDIDATES = 5000;
const MAX_RECIPIENTS = 200;

export async function listAlerts(userId: string) {
  const rows = await prisma.customFeed.findMany({
    where: { ownerId: userId, kind: 'alert' },
    orderBy: { createdAt: 'asc' },
    take: MAX_ALERTS,
    select: { id: true, query: true },
  });
  return rows.map((r) => ({ id: r.id, query: r.query ?? '' }));
}

export async function addAlert(userId: string, query: string) {
  const compiled = compileAlert(query);
  const anchor = alertAnchor(query);
  if (!compiled || !anchor) {
    return { ok: false as const, status: 400, error: 'Add at least one word to look for' };
  }
  // Adding the same terms twice is a no-op that returns the existing alert.
  const existing = await prisma.customFeed.findFirst({
    where: { ownerId: userId, kind: 'alert', query: compiled.source },
    select: { id: true },
  });
  if (existing) return { ok: true as const, alert: { id: existing.id, query: compiled.source } };
  if ((await prisma.customFeed.count({ where: { ownerId: userId, kind: 'alert' } })) >= MAX_ALERTS) {
    return { ok: false as const, status: 409, error: `You can have at most ${MAX_ALERTS} alerts` };
  }
  const row = await prisma.customFeed.create({
    data: {
      ownerId: userId,
      kind: 'alert',
      name: compiled.source.slice(0, 60),
      query: compiled.source,
      anchor,
      notify: true,
      tags: [],
      authorIds: [],
      keywords: [],
    },
    select: { id: true },
  });
  return { ok: true as const, alert: { id: row.id, query: compiled.source } };
}

export async function removeAlert(userId: string, id: string) {
  await prisma.customFeed.deleteMany({ where: { id, ownerId: userId, kind: 'alert' } });
}

/** The worker half: match one new post against indexed candidate alerts and notify. */
export async function fanOutKeywordAlerts(post: {
  id: string;
  userId: string;
  content: string;
  handle: string | null;
}): Promise<number> {
  const tokens = [...new Set(fold(post.content).match(/[\p{L}\p{N}]+/gu) ?? [])].slice(0, 400);
  if (!tokens.length) return 0;
  const candidates = await prisma.customFeed.findMany({
    where: { notify: true, anchor: { in: tokens }, ownerId: { not: post.userId } },
    take: MAX_CANDIDATES,
    select: { ownerId: true, query: true },
  });
  const hits = new Map<string, string>();
  for (const c of candidates) {
    if (!c.query || hits.has(c.ownerId) || hits.size >= MAX_RECIPIENTS) continue;
    const compiled = compileAlert(c.query);
    if (compiled && matches(compiled, post.content)) hits.set(c.ownerId, c.query);
  }
  if (!hits.size) return 0;

  const folded = fold(post.content);
  const allowed: string[] = [];
  for (const userId of hits.keys()) {
    const [hidden, muted] = await Promise.all([getHiddenAuthorIds(userId), getMutedWords(userId)]);
    if (hidden.includes(post.userId)) continue;
    if (muted.some((w) => w.trim() && folded.includes(fold(w)))) continue;
    allowed.push(userId);
  }
  if (!allowed.length) return 0;

  // The ledger is the dedupe: only rows actually created get a notification.
  const created = await prisma.keywordAlertHit.createManyAndReturn({
    data: allowed.map((userId) => ({ userId, rmheetId: post.id })),
    skipDuplicates: true,
    select: { userId: true },
  });
  const link = `/u/${post.handle ?? post.userId}/post/${post.id}`;
  const preview = post.content.replace(/\s+/g, ' ').trim().slice(0, 140);
  for (const { userId } of created) {
    await createNotification({
      userId,
      actorId: post.userId,
      type: 'SYSTEM',
      entityType: 'keyword-alert',
      entityId: post.id,
      preview: `"${hits.get(userId)}": ${preview}`,
      link,
    });
  }
  return created.length;
}
