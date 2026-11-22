/**
 * Releases of a User Build (s04-04): create, delete, list and the notification. A release is a `BuildVersion` row;
 * the pure rules (version, commit link, order) are in `releases.ts`. Which caller may do what is decided here, so the
 * two endpoint modules only identify the caller and translate the outcome.
 */
import { refusalBody } from '@/lib/errors/codes';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { emitBuildReleased } from '@/lib/webhooks/activity-emit.server';
import { watchBuildRelease } from '@/lib/discovery/watch.server';
import { RELEASES_PAGE, releasePreview, type ReleaseView } from '@/lib/builds/releases';
import type { CreateReleaseInput } from '@/lib/builds/releases-schema';

type Row = {
  id: string;
  version: string;
  changelog: string | null;
  commitHash: string | null;
  createdAt: Date;
};

const releaseSelect = { id: true, version: true, changelog: true, commitHash: true, createdAt: true } as const;

function view(row: Row): ReleaseView {
  return {
    id: row.id,
    version: row.version,
    changelog: row.changelog,
    commitHash: row.commitHash,
    createdAt: row.createdAt.toISOString(),
  };
}

export type ReleaseBuild = {
  id: string;
  userId: string;
  slug: string;
  title: string;
  visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
};

/** The build a request names, by id or slug (the way the other build endpoints resolve it), or null. */
export async function findReleaseBuild(idOrSlug: string): Promise<ReleaseBuild | null> {
  const select = { id: true, userId: true, slug: true, title: true, visibility: true } as const;
  return (
    (await prisma.userBuild.findUnique({ where: { id: idOrSlug }, select })) ??
    (await prisma.userBuild.findUnique({ where: { slug: idOrSlug }, select }))
  );
}

/**
 * The latest releases of a build, newest first, with their dates. A private build's releases are its owner's alone:
 * anyone else gets null, the same answer as a build that does not exist. An unlisted build answers whoever asks
 * for it by id, because the build page itself does.
 */
export async function listReleases(
  buildId: string,
  viewerId: string | null,
  take: number = RELEASES_PAGE,
): Promise<ReleaseView[] | null> {
  const build = await prisma.userBuild.findUnique({
    where: { id: buildId },
    select: { userId: true, visibility: true },
  });
  if (!build) return null;
  if (build.visibility === 'PRIVATE' && build.userId !== viewerId) return null;
  const rows = await prisma.buildVersion.findMany({
    where: { buildId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    select: releaseSelect,
  });
  return rows.map(view);
}

export type CreateReleaseResult =
  { ok: true; release: ReleaseView } | { ok: false; status: 403 | 404 | 409; error: string };

/** Publish a release. Owner only; a version the build already has is a conflict. Does not notify: see `notifyRelease`. */
export async function createRelease(
  build: ReleaseBuild | null,
  userId: string,
  input: CreateReleaseInput,
): Promise<CreateReleaseResult> {
  if (!build) return { ok: false, status: 404, ...refusalBody('BUILD_NOT_FOUND') };
  if (build.userId !== userId) {
    return build.visibility === 'PRIVATE'
      ? { ok: false, status: 404, ...refusalBody('BUILD_NOT_FOUND') }
      : { ok: false, status: 403, ...refusalBody('BUILD_RELEASE_OWNER_ONLY') };
  }
  let release: ReleaseView;
  let released: Date;
  try {
    const row = await prisma.buildVersion.create({
      data: {
        buildId: build.id,
        version: input.version,
        changelog: input.changelog?.trim() ? input.changelog : null,
        commitHash: input.commitHash ? input.commitHash.toLowerCase() : null,
      },
      select: releaseSelect,
    });
    release = view(row);
    released = row.createdAt;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, status: 409, ...refusalBody('BUILD_VERSION_EXISTS') };
    }
    throw e;
  }
  // After the row exists; a failed webhook never fails the release.
  await emitBuildReleased(userId, {
    buildSlug: build.slug,
    version: release.version,
    title: build.title,
    releasedAt: released,
  });
  return { ok: true, release };
}

export type DeleteReleaseResult = { ok: true } | { ok: false; status: 403 | 404; error: string };

/** Delete a release (a typo). Owner only; it belongs to the build in the path. Nobody is notified. */
export async function deleteRelease(
  build: ReleaseBuild | null,
  releaseId: string,
  userId: string,
): Promise<DeleteReleaseResult> {
  if (!build) return { ok: false, status: 404, ...refusalBody('BUILD_NOT_FOUND') };
  if (build.userId !== userId) {
    return build.visibility === 'PRIVATE'
      ? { ok: false, status: 404, ...refusalBody('BUILD_NOT_FOUND') }
      : { ok: false, status: 403, ...refusalBody('BUILD_RELEASE_DELETE_OWNER_ONLY') };
  }
  const { count } = await prisma.buildVersion.deleteMany({ where: { id: releaseId, buildId: build.id } });
  return count > 0 ? { ok: true } : { ok: false, status: 404, ...refusalBody('BUILD_RELEASE_NOT_FOUND') };
}

/**
 * Tell the build's watchers and unlockers about a new release: "{title} {version} is out". Only a PUBLIC build
 * notifies; an unlisted or private one keeps its history silently. Returns how many members were told. Called after
 * the write, the way `watchBuildComment` is, so a failure here never fails the publish.
 */
export async function notifyRelease(build: ReleaseBuild, release: Pick<ReleaseView, 'version'>): Promise<number> {
  if (build.visibility !== 'PUBLIC') return 0;
  return watchBuildRelease(build.id, build.userId, releasePreview(build.title, release.version));
}
