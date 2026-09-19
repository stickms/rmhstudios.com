/**
 * Keeping the embedding index current (M1).
 *
 * ## Why a cursored sweep and not an on-write hook
 *
 * Embedding on write is the obvious design and the wrong one here. A post must
 * not wait on a third-party model call to appear in the feed, and wrapping the
 * call in a try/catch so it cannot block just means the index silently misses
 * everything written during an outage — with nothing that would ever notice.
 *
 * A sweep has neither problem. It is idempotent, it costs the diff rather than
 * the corpus (the content hash skips anything unchanged), and an outage means
 * the next run catches up rather than a permanent hole. The cost is latency:
 * something written now is searchable semantically within a few minutes rather
 * than immediately, which for a retrieval index nobody is watching is not a
 * cost at all.
 *
 * `BackfillCheckpoint` carries the cursor, so a run that dies mid-corpus
 * resumes where it stopped instead of starting over.
 */

import { prisma } from '@/lib/prisma.server';
import { isEmbeddingAvailable, upsertEmbedding, type EmbeddableKind } from '@/lib/search/embeddings.server';

/** Rows per run, per kind. Bounded so one sweep cannot become an all-night job. */
const BATCH = 200;

export interface IndexResult {
  kind: EmbeddableKind;
  scanned: number;
  written: number;
  unchanged: number;
  /** True when this run reached the end of the corpus and reset the cursor. */
  completed: boolean;
}

function checkpointName(kind: EmbeddableKind): string {
  return `embedding:${kind}`;
}

/**
 * One batch of one kind.
 *
 * Ordered by id rather than by `updatedAt`: a cursor over a mutable ordering
 * skips rows that move behind it, which for an index means a post edited
 * during a sweep is the one that never gets re-embedded. Ids do not move.
 */
export async function indexBatch(kind: EmbeddableKind): Promise<IndexResult> {
  const empty: IndexResult = { kind, scanned: 0, written: 0, unchanged: 0, completed: false };
  if (!isEmbeddingAvailable()) return empty;

  const name = checkpointName(kind);
  const checkpoint = await prisma.backfillCheckpoint.findUnique({
    where: { name },
    select: { cursor: true, processed: true },
  });
  const after = checkpoint?.cursor ?? undefined;

  const rows = await loadBatch(kind, after);
  if (rows.length === 0) {
    // End of the corpus: clear the cursor so the next run starts again from the
    // top and picks up everything edited since. The hash check makes that
    // cheap — a full pass over an unchanged corpus writes nothing.
    await prisma.backfillCheckpoint.upsert({
      where: { name },
      create: { name, cursor: null, processed: 0, doneAt: new Date() },
      update: { cursor: null, doneAt: new Date() },
    });
    return { ...empty, completed: true };
  }

  let written = 0;
  let unchanged = 0;
  for (const row of rows) {
    const result = await upsertEmbedding(kind, row.id, row.text);
    if (result === 'written') written++;
    else if (result === 'unchanged') unchanged++;
  }

  await prisma.backfillCheckpoint.upsert({
    where: { name },
    create: { name, cursor: rows.at(-1)!.id, processed: rows.length },
    update: { cursor: rows.at(-1)!.id, processed: { increment: rows.length }, doneAt: null },
  });

  return { kind, scanned: rows.length, written, unchanged, completed: false };
}

/**
 * The text that represents each kind.
 *
 * One query per kind rather than a generic abstraction: the kinds have nothing
 * in common but an id and a string, and a table-driven version of this would be
 * a layer of indirection over six one-line selects.
 */
async function loadBatch(
  kind: EmbeddableKind,
  after: string | undefined,
): Promise<{ id: string; text: string }[]> {
  const cursor = after ? { id: { gt: after } } : {};
  const page = { take: BATCH, orderBy: { id: 'asc' } } as const;

  switch (kind) {
    case 'rmhark': {
      const rows = await prisma.rMHark.findMany({
        where: { ...cursor, deletedAt: null, audience: 'PUBLIC' },
        select: { id: true, content: true },
        ...page,
      });
      return rows.map((r) => ({ id: r.id, text: r.content }));
    }
    case 'library': {
      const rows = await prisma.libraryDocument.findMany({
        where: cursor,
        select: { id: true, title: true, description: true },
        ...page,
      });
      return rows.map((r) => ({ id: r.id, text: `${r.title}\n${r.description ?? ''}` }));
    }
    case 'news': {
      const rows = await prisma.newsArticle.findMany({
        where: cursor,
        select: { id: true, title: true, summary: true },
        ...page,
      });
      return rows.map((r) => ({ id: r.id, text: `${r.title}\n${r.summary ?? ''}` }));
    }
    case 'blog': {
      const rows = await prisma.blogPost.findMany({
        where: cursor,
        select: { id: true, title: true, excerpt: true },
        ...page,
      });
      return rows.map((r) => ({ id: r.id, text: `${r.title}\n${r.excerpt ?? ''}` }));
    }
    case 'build': {
      const rows = await prisma.userBuild.findMany({
        where: cursor,
        select: { id: true, title: true, description: true },
        ...page,
      });
      return rows.map((r) => ({ id: r.id, text: `${r.title}\n${r.description ?? ''}` }));
    }
    // Games and apps are a static catalog, not rows. They are embedded by
    // `indexCatalog` below, which has no cursor because the whole thing fits in
    // one pass.
    case 'game':
    case 'app':
      return [];
  }
}

/**
 * Embed the games and apps catalogs.
 *
 * Separate from `indexBatch` because a catalog is 35 entries in a TypeScript
 * file, not a table: there is nothing to page through and no cursor to keep.
 */
export async function indexCatalog(): Promise<{ written: number; unchanged: number }> {
  if (!isEmbeddingAvailable()) return { written: 0, unchanged: 0 };

  const { games } = await import('@/lib/games');
  const { apps } = await import('@/lib/apps');

  let written = 0;
  let unchanged = 0;
  const entries: [EmbeddableKind, { id: string; text: string }][] = [
    ...games.map((g) => ['game', { id: g.id, text: `${g.title}\n${g.description ?? ''}` }] as [EmbeddableKind, { id: string; text: string }]),
    ...apps.map((a) => ['app', { id: a.id, text: `${a.title}\n${a.description ?? ''}` }] as [EmbeddableKind, { id: string; text: string }]),
  ];

  for (const [kind, entry] of entries) {
    const result = await upsertEmbedding(kind, entry.id, entry.text);
    if (result === 'written') written++;
    else if (result === 'unchanged') unchanged++;
  }
  return { written, unchanged };
}

/** Every kind with a table behind it, in sweep order. */
export const SWEEPABLE_KINDS: EmbeddableKind[] = ['rmhark', 'library', 'news', 'blog', 'build'];

/** One pass over every kind. What the cron calls. */
export async function runIndexSweep(): Promise<IndexResult[]> {
  const out: IndexResult[] = [];
  for (const kind of SWEEPABLE_KINDS) out.push(await indexBatch(kind));
  await indexCatalog();
  return out;
}
