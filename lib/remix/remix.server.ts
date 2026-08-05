/**
 * The remix graph (F10) — lineage recording and the ancestry walk.
 *
 * One edge table serves every forkable work (`UserBuild`, `UserTheme`,
 * `Playlist`, `VersecraftWorld`, levels). The alternative — a `parentId` column
 * on each of those models — is what the codebase already has too many of: five
 * near-identical implementations that drift. Here the *shape* of lineage is
 * defined once and each feature only supplies its `kind`.
 *
 * The walk is depth-capped AND cycle-guarded. The `(kind, derivedId)` unique
 * constraint should make cycles impossible (a work has one parent, so a cycle
 * would need someone to be their own ancestor), but "should be impossible"
 * is not a reason to write a loop that never terminates if it happens — a
 * corrupted row would otherwise hang a page render.
 */
import { prisma } from '@/lib/prisma.server';
import {
  MAX_ANCESTRY_DEPTH,
  type Ancestry,
  type AncestorRef,
  type RemixKind,
  type RemixShare,
  remixShares,
} from '@/lib/remix/remix';

/**
 * Record that `derivedId` was forked from `sourceId`.
 *
 * Idempotent by construction: `(kind, derivedId)` is unique, so a repeated call
 * for the same derivative is a no-op rather than a second parent. Lineage is
 * immutable — re-parenting a work would rewrite who is owed revenue share on
 * every past sale, so the upsert deliberately updates nothing.
 */
export async function recordRemix(opts: {
  kind: RemixKind;
  sourceId: string;
  derivedId: string;
  authorId: string;
}): Promise<void> {
  const { kind, sourceId, derivedId, authorId } = opts;
  // A work cannot be its own parent; that is the one cycle a caller can create.
  if (sourceId === derivedId) return;

  await prisma.remixEdge.upsert({
    where: { kind_derivedId: { kind, derivedId } },
    create: { kind, sourceId, derivedId, authorId },
    update: {},
    select: { id: true },
  });
}

/**
 * Walk up the lineage from `derivedId`, nearest parent first.
 *
 * One query per level. That is acceptable at a cap of 20 and simpler than a
 * recursive CTE through Prisma's raw escape hatch; if a hot path ever needs the
 * full chain per row, this is the function to replace with one.
 */
export async function getAncestry(
  kind: RemixKind,
  derivedId: string,
  maxDepth: number = MAX_ANCESTRY_DEPTH,
): Promise<Ancestry> {
  const ancestors: AncestorRef[] = [];
  const seen = new Set<string>([derivedId]);
  let cursor = derivedId;
  let truncated = false;

  for (let depth = 0; depth < maxDepth; depth++) {
    const edge = await prisma.remixEdge.findUnique({
      where: { kind_derivedId: { kind, derivedId: cursor } },
      select: { sourceId: true },
    });
    if (!edge) return { ancestors, truncated: false };

    // A repeat means the data has a cycle. Stop and report truncation rather
    // than looping until the depth cap and returning a bogus chain.
    if (seen.has(edge.sourceId)) return { ancestors, truncated: true };
    seen.add(edge.sourceId);

    const author = await resolveAuthor(kind, edge.sourceId);
    ancestors.push({ id: edge.sourceId, authorId: author ?? '' });
    cursor = edge.sourceId;

    // If the parent itself has a parent we would keep going; the loop bound
    // decides. Mark truncation only when we stop with more chain remaining.
    if (depth === maxDepth - 1) {
      const more = await prisma.remixEdge.findUnique({
        where: { kind_derivedId: { kind, derivedId: cursor } },
        select: { id: true },
      });
      truncated = more !== null;
    }
  }

  return { ancestors, truncated };
}

/**
 * Who authored a source work. The `RemixEdge.authorId` records who made the
 * DERIVATIVE, so the parent's author has to come from the parent's own table —
 * which is why this switch exists and why `kind` is a closed set.
 */
async function resolveAuthor(kind: RemixKind, id: string): Promise<string | null> {
  switch (kind) {
    case 'theme': {
      const row = await prisma.userTheme.findUnique({ where: { id }, select: { authorId: true } });
      return row?.authorId ?? null;
    }
    case 'build': {
      // UserBuild names its owner `userId` (UserTheme uses `authorId`) — the
      // two models disagree, which is exactly why this lookup is centralised.
      const row = await prisma.userBuild.findUnique({ where: { id }, select: { userId: true } });
      return row?.userId ?? null;
    }
    default: {
      // Playlists, worlds and levels are forkable but their sale paths are not
      // wired to commerce yet. The edge is still recorded (attribution works);
      // only the revenue share needs an author, and it degrades to "no share"
      // rather than guessing.
      const edge = await prisma.remixEdge.findFirst({
        where: { kind, derivedId: id },
        select: { authorId: true },
      });
      return edge?.authorId ?? null;
    }
  }
}

/**
 * Ancestry rendered as a breadcrumb — the attribution UI's data source.
 * Ancestors with no resolvable author are still shown (credit is the point);
 * only the revenue share needs a payee.
 */
export async function getAncestryBreadcrumb(kind: RemixKind, derivedId: string): Promise<Ancestry> {
  return getAncestry(kind, derivedId);
}

/** Works derived directly from `sourceId` — the "remixes of this" rail. */
export async function getDerivatives(
  kind: RemixKind,
  sourceId: string,
  limit = 30,
): Promise<{ derivedId: string; authorId: string; createdAt: Date }[]> {
  return prisma.remixEdge.findMany({
    where: { kind, sourceId },
    select: { derivedId: true, authorId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * The revenue-share hook C6's `purchase()` calls: given a work being sold, how
 * much of the price is owed upstream and to whom.
 *
 * Returns an empty list for an original work, which is the common case — so the
 * caller pays one query for the "no lineage" answer and nothing else.
 */
export async function getRemixShares(
  kind: RemixKind,
  derivedId: string,
  price: number,
  sellerId: string,
): Promise<RemixShare[]> {
  const { ancestors } = await getAncestry(kind, derivedId, 3);
  if (ancestors.length === 0) return [];
  return remixShares(
    price,
    ancestors.filter((a) => a.authorId !== ''),
    sellerId,
  );
}
