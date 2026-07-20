/**
 * History & resume — server logic (§5). Records throttled visit heartbeats
 * (honoring the per-user pause), lists/clears history, and hydrates entries to
 * display shapes. Resume-position reads piggyback on the entity payload or the
 * dedicated getter.
 */
import { prisma } from '@/lib/prisma.server';
import { games } from '@/lib/games';
import type { HistoryEntityType } from '@/lib/history/constants';

export interface HistoryView {
  id: string;
  entityType: HistoryEntityType;
  entityId: string;
  position: number | null;
  duration: number | null;
  updatedAt: string;
  title: string;
  subtitle: string | null;
  href: string | null;
  thumbnail: string | null;
}

/** Record/refresh a visit. No-ops silently when the user paused history. */
export async function recordBeat(
  userId: string,
  input: { entityType: HistoryEntityType; entityId: string; position?: number; duration?: number },
): Promise<void> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { historyPaused: true },
  });
  if (profile?.historyPaused) return;

  const data = {
    position: input.position ?? null,
    duration: input.duration ?? null,
  };
  await prisma.historyEntry.upsert({
    where: {
      userId_entityType_entityId: {
        userId,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    },
    create: { userId, entityType: input.entityType, entityId: input.entityId, ...data },
    update: data,
  });
}

export async function getPosition(
  userId: string,
  entityType: HistoryEntityType,
  entityId: string,
): Promise<{ position: number | null; duration: number | null } | null> {
  const row = await prisma.historyEntry.findUnique({
    where: { userId_entityType_entityId: { userId, entityType, entityId } },
    select: { position: true, duration: true },
  });
  return row ?? null;
}

export async function clearHistory(userId: string): Promise<void> {
  await prisma.historyEntry.deleteMany({ where: { userId } });
}

export async function removeEntry(userId: string, id: string): Promise<void> {
  await prisma.historyEntry.deleteMany({ where: { id, userId } });
}

const PAGE = 40;

export interface ListHistoryResult {
  items: HistoryView[];
  nextCursor: string | null;
}

export async function listHistory(
  userId: string,
  opts: { type?: HistoryEntityType; cursor?: string } = {},
): Promise<ListHistoryResult> {
  const rows = await prisma.historyEntry.findMany({
    where: { userId, ...(opts.type ? { entityType: opts.type } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: PAGE + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      entityType: true,
      entityId: true,
      position: true,
      duration: true,
      updatedAt: true,
    },
  });
  const hasMore = rows.length > PAGE;
  const page = hasMore ? rows.slice(0, PAGE) : rows;
  const items = await hydrateHistory(page);
  return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
}

type HistoryRow = {
  id: string;
  entityType: string;
  entityId: string;
  position: number | null;
  duration: number | null;
  updatedAt: Date;
};

async function hydrateHistory(rows: HistoryRow[]): Promise<HistoryView[]> {
  const songIds = rows.filter((r) => r.entityType === 'song').map((r) => r.entityId);
  const songMap = new Map<string, { title: string; artist: string; coverUrl: string | null }>();
  if (songIds.length) {
    const songs = await prisma.song.findMany({
      where: { id: { in: songIds } },
      select: { id: true, title: true, artist: true, coverUrl: true },
    });
    for (const s of songs) songMap.set(s.id, { title: s.title, artist: s.artist, coverUrl: s.coverUrl });
  }

  return rows.map((r): HistoryView => {
    const base = {
      id: r.id,
      entityType: r.entityType as HistoryEntityType,
      entityId: r.entityId,
      position: r.position,
      duration: r.duration,
      updatedAt: r.updatedAt.toISOString(),
    };
    if (r.entityType === 'song') {
      const s = songMap.get(r.entityId);
      return {
        ...base,
        title: s?.title ?? '(song)',
        subtitle: s?.artist ?? null,
        href: null,
        thumbnail: s?.coverUrl ?? null,
      };
    }
    if (r.entityType === 'game') {
      const g = games.find((game) => game.id === r.entityId);
      return {
        ...base,
        title: g?.title ?? r.entityId,
        subtitle: null,
        href: g?.href ?? null,
        thumbnail: g?.imagePath ?? null,
      };
    }
    return { ...base, title: r.entityId, subtitle: null, href: null, thumbnail: null };
  });
}
