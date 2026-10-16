/**
 * A6 · Keyword alerts — persistence and the post fan-out. Matching itself is
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
  return prisma.keywordAlert.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    take: MAX_ALERTS,
    select: { id: true, query: true },
  });
}

export async function addAlert(userId: string, query: string) {
  const compiled = compileAlert(query);
  const anchor = alertAnchor(query);
  if (!compiled || !anchor) {
    return { ok: false as const, status: 400, error: 'Add at least one word to look for' };
  }
  if ((await prisma.keywordAlert.count({ where: { userId } })) >= MAX_ALERTS) {
    return { ok: false as const, status: 409, error: `You can have at most ${MAX_ALERTS} alerts` };
  }
  const row = await prisma.keywordAlert.upsert({
    where: { userId_query: { userId, query: compiled.source } },
    create: { userId, query: compiled.source, anchor },
    update: {},
    select: { id: true, query: true },
  });
  return { ok: true as const, alert: row };
}

export async function removeAlert(userId: string, id: string) {
  await prisma.keywordAlert.deleteMany({ where: { id, userId } });
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
  const candidates = await prisma.keywordAlert.findMany({
    where: { anchor: { in: tokens }, userId: { not: post.userId } },
    take: MAX_CANDIDATES,
    select: { userId: true, query: true },
  });
  const hits = new Map<string, string>();
  for (const c of candidates) {
    if (hits.has(c.userId) || hits.size >= MAX_RECIPIENTS) continue;
    const compiled = compileAlert(c.query);
    if (compiled && matches(compiled, post.content)) hits.set(c.userId, c.query);
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
