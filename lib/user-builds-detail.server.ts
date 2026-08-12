/**
 * Shared read + projection for a single user build.
 *
 * Both `/builds/$slug` and `/user-builds/$slug` used to resolve their build by
 * doing `fetch('${VITE_BETTER_AUTH_URL}/api/user-builds/<slug>')` from inside
 * their own SSR loader — the server calling its own public origin. That put a
 * full network round trip (DNS/TLS to the public name, the CDN hop, Apache, then
 * a SECOND complete Nitro request cycle with its own session resolution and its
 * own Prisma queries) in front of the first byte of HTML on both routes.
 *
 * These helpers let a loader do the same read in-process. The API route uses
 * them too, so the wire shape cannot drift between the two paths — which is the
 * failure mode that makes this kind of de-looping risky.
 *
 * THE ANONYMOUS PROJECTION IS A CONTRACT, NOT AN ACCIDENT. A loopback `fetch`
 * carries no cookies, so SSR always resolved these pages as a signed-out viewer:
 * a paid build always arrived `locked`, and `components/user-builds/BuildDetail`
 * re-fetches with `credentials: 'include'` after hydration to reveal it for a
 * viewer who owns it. Loaders therefore call this with NO viewer — passing the
 * real session here would change what the marketplace gate emits into cacheable
 * HTML, which is a different (and much more delicate) change than removing a
 * round trip. See `BuildDetail.tsx`.
 */
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

const buildInclude = {
  user: { select: userDisplaySelect },
  category: { select: { id: true, name: true, slug: true, color: true, iconName: true } },
  tags: { select: { name: true } },
  versions: { orderBy: { createdAt: 'desc' as const }, take: 10 },
};

/** Resolve a build by id, then by slug — the order the API route has always used. */
export async function findBuild(idOrSlug: string) {
  const byId = await prisma.userBuild.findUnique({
    where: { id: idOrSlug },
    include: buildInclude,
  });
  if (byId) return byId;

  return prisma.userBuild.findUnique({
    where: { slug: idOrSlug },
    include: buildInclude,
  });
}

export type BuildRecord = NonNullable<Awaited<ReturnType<typeof findBuild>>>;

/**
 * `technologies` is a Prisma `Json` column, so it is typed `JsonValue` and can be
 * null or any shape. Every consumer (`BuildDetail`, the build cards) treats it as
 * `string[]`. That mismatch was invisible while the loaders received it through
 * `res.json()` as `any`; reading in-process made the compiler surface it. Coerce
 * once, here, so a legacy row holding null or an object renders as "no
 * technologies" instead of throwing on `.map` in the component.
 */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Serialize a build for the wire, applying the marketplace gate.
 *
 * `locked` hides readme/repo/demo for a paid build the viewer has not unlocked.
 * With the default (anonymous) viewer options, every paid build is locked.
 */
export function projectBuildDetail(
  build: BuildRecord,
  { isOwner = false, liked = false, unlocked: unlockedInput }: {
    isOwner?: boolean;
    liked?: boolean;
    unlocked?: boolean;
  } = {},
) {
  const price = build.price ?? 0;
  const unlocked = unlockedInput ?? (isOwner || price <= 0);
  const locked = price > 0 && !unlocked;

  return {
    id: build.id,
    slug: build.slug,
    title: build.title,
    description: build.description,
    readme: locked ? null : build.readme,
    thumbnailUrl: build.thumbnailUrl,
    repoUrl: locked ? null : build.repoUrl,
    demoUrl: locked ? null : build.demoUrl,
    price,
    locked,
    unlocked,
    visibility: build.visibility,
    featured: build.featured,
    isCurated: build.isCurated,
    technologies: toStringArray(build.technologies),
    likeCount: build.likeCount,
    commentCount: build.commentCount,
    viewCount: build.viewCount,
    createdAt: build.createdAt.toISOString(),
    updatedAt: build.updatedAt.toISOString(),
    publishedAt: build.publishedAt?.toISOString() ?? null,
    user: resolveUser(build.user),
    category: build.category,
    tags: build.tags.map((t: { name: string }) => t.name),
    versions: build.versions.map((v: BuildRecord['versions'][number]) => ({
      id: v.id,
      version: v.version,
      changelog: v.changelog,
      commitHash: v.commitHash,
      createdAt: v.createdAt.toISOString(),
    })),
    liked,
    isOwner,
  };
}

/**
 * The exact payload the old loopback `fetch` produced for an SSR loader: the
 * build as an anonymous viewer sees it, or `null` when it does not exist or is
 * private (which the loopback surfaced as a 404).
 */
export async function getPublicBuildDetail(idOrSlug: string) {
  const build = await findBuild(idOrSlug);
  if (!build) return null;
  // An anonymous viewer is never the owner, so PRIVATE is not visible — the API
  // route answers 404 for this case and the loaders turn that into notFound().
  if (build.visibility === 'PRIVATE') return null;
  return projectBuildDetail(build);
}
