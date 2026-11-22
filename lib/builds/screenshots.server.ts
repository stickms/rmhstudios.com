/**
 * Screenshots of a User Build, the server half (s07-17): the owner's upload through the `build` ingest surface, the
 * ordered save, the read, the clean-up of what a screenshot or cover leaves behind, and the export.
 *
 * Storage. An upload is `ingest(file, 'build', { userId, record: true })`: the picture is stored with every
 * metadata block stripped and a `Media` row in `PENDING`, which the media sweep reclaims when nothing saved it.
 * Saving a screenshot (or an uploaded cover) flips that row to `ATTACHED` with no post and no `attachedAt`, the shape
 * the sweep deliberately skips. Removing one deletes the object and the row.
 */
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { ingest, IngestError } from '@/lib/media/ingest.server';
import { deleteObject } from '@/lib/storage/s3.server';
import {
  screenshotProblem,
  type ScreenshotInput,
  type ScreenshotProblem,
  type ScreenshotView,
} from '@/lib/builds/screenshots';

export type ScreenshotBuild = {
  id: string;
  userId: string;
  visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
};

const buildSelect = {
  id: true,
  userId: true,
  visibility: true,
} as const;
const screenshotSelect = {
  url: true,
  width: true,
  height: true,
  description: true,
} as const;

/** The build a request names, by id or slug (the way the other build endpoints resolve it), or null. */
export async function findScreenshotBuild(idOrSlug: string): Promise<ScreenshotBuild | null> {
  return (
    (await prisma.userBuild.findUnique({
      where: {
        id: idOrSlug,
      },
      select: buildSelect,
    })) ??
    (await prisma.userBuild.findUnique({
      where: {
        slug: idOrSlug,
      },
      select: buildSelect,
    }))
  );
}

/**
 * Whether `viewerId` may see this build's pictures: a private build's are its owner's alone (the same answer as a
 * build that does not exist); a public or unlisted build's go wherever the build page goes.
 */
export function canSeeScreenshots(
  build: Pick<ScreenshotBuild, 'userId' | 'visibility'>,
  viewerId: string | null,
): boolean {
  return build.visibility !== 'PRIVATE' || build.userId === viewerId;
}

/** The screenshots in order, or null when the viewer may not see the build. */
export async function listScreenshots(
  build: ScreenshotBuild | null,
  viewerId: string | null,
): Promise<ScreenshotView[] | null> {
  if (!build || !canSeeScreenshots(build, viewerId)) return null;
  return prisma.buildScreenshot.findMany({
    where: {
      buildId: build.id,
    },
    orderBy: [
      {
        position: 'asc',
      },
      {
        id: 'asc',
      },
    ],
    select: screenshotSelect,
  });
}

export type UploadResult =
  | {
      ok: true;
      url: string;
      width: number;
      height: number;
    }
  | {
      ok: false;
      status: 400 | 403 | 404 | 413 | 415;
      error: string;
    };

/** Store one picture for the build's owner through the `build` surface. Nothing is attached to the build yet. */
export async function uploadBuildImage(
  build: ScreenshotBuild | null,
  userId: string,
  file: File | null,
): Promise<UploadResult> {
  if (!build || (build.userId !== userId && build.visibility === 'PRIVATE')) {
    return {
      ok: false,
      status: 404,
      error: 'Build not found',
    };
  }
  if (build.userId !== userId)
    return {
      ok: false,
      status: 403,
      error: 'Only the build’s owner can add pictures',
    };
  if (!file || file.size === 0)
    return {
      ok: false,
      status: 400,
      error: 'No file provided',
    };
  try {
    const stored = await ingest(file, 'build', {
      userId,
      record: true,
    });
    return {
      ok: true,
      url: stored.url,
      width: stored.width,
      height: stored.height,
    };
  } catch (err) {
    if (err instanceof IngestError) {
      return {
        ok: false,
        status: err.status as 400 | 413 | 415,
        error: err.message,
      };
    }
    throw err;
  }
}

export type SaveResult =
  | {
      ok: true;
      items: ScreenshotView[];
    }
  | {
      ok: false;
      status: 400 | 403 | 404 | 409;
      error: string;
      code?: ScreenshotProblem['code'];
      index?: number;
    };

const PROBLEM_MESSAGE: Record<ScreenshotProblem['code'], string> = {
  TOO_MANY: 'A build has at most 8 screenshots',
  DESCRIPTION_REQUIRED: 'Describe each screenshot',
  DESCRIPTION_TOO_LONG: 'A description is at most 500 characters',
  DUPLICATE: 'A screenshot is listed twice',
};

class SaveRefused extends Error {
  constructor(
    readonly status: 400 | 409,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Replace the build's screenshots with `items`, in order. Owner only. The undescribed screenshot and the ninth are
 * refused here, not only in the form. A picture new to the build must be this member's own upload (a `Media` row
 * still `PENDING`); one the build already has keeps its place. Pictures that leave the list are deleted afterwards.
 */
export async function saveScreenshots(
  build: ScreenshotBuild | null,
  userId: string,
  items: readonly ScreenshotInput[],
): Promise<SaveResult> {
  if (!build || (build.userId !== userId && build.visibility === 'PRIVATE')) {
    return {
      ok: false,
      status: 404,
      error: 'Build not found',
    };
  }
  if (build.userId !== userId)
    return {
      ok: false,
      status: 403,
      error: 'Only the build’s owner can change screenshots',
    };

  const problem = screenshotProblem(items);
  if (problem) {
    return {
      ok: false,
      status: 400,
      error: PROBLEM_MESSAGE[problem.code],
      code: problem.code,
      ...('index' in problem
        ? {
            index: problem.index,
          }
        : {}),
    };
  }

  let removed: string[];
  try {
    removed = await prisma.$transaction(async (tx) => {
      await lockKey(tx, `build-screenshots:${build.id}`);
      const existing = await tx.buildScreenshot.findMany({
        where: {
          buildId: build.id,
        },
        select: {
          id: true,
          url: true,
        },
      });
      const byUrl = new Map(existing.map((row) => [row.url, row.id]));
      const keep = new Set(items.map((i) => i.url));

      for (const row of existing) {
        if (!keep.has(row.url))
          await tx.buildScreenshot.delete({
            where: {
              id: row.id,
            },
          });
      }
      for (let position = 0; position < items.length; position++) {
        const item = items[position]!;
        const description = item.description.trim();
        const id = byUrl.get(item.url);
        if (id) {
          await tx.buildScreenshot.update({
            where: {
              id,
            },
            data: {
              position,
              description,
            },
          });
          continue;
        }
        // New to this build: it must be the owner's own upload, claimed once (compare-and-set on PENDING).
        const claimed = await tx.media.updateMany({
          where: {
            userId,
            url: item.url,
            status: 'PENDING',
          },
          data: {
            status: 'ATTACHED',
          },
        });
        if (claimed.count === 0) throw new SaveRefused(409, 'Upload the picture again');
        await tx.buildScreenshot.create({
          data: {
            buildId: build.id,
            url: item.url,
            width: item.width,
            height: item.height,
            description,
            position,
          },
        });
      }
      return existing.filter((row) => !keep.has(row.url)).map((row) => row.url);
    });
  } catch (err) {
    if (err instanceof SaveRefused)
      return {
        ok: false,
        status: err.status,
        error: err.message,
      };
    throw err;
  }

  // After the commit, and never fatal: a failed delete leaves an object for a later sweep, not a broken save.
  await Promise.all(removed.map((url) => releaseUploadedImage(url, userId).catch(() => {})));
  const saved = await prisma.buildScreenshot.findMany({
    where: {
      buildId: build.id,
    },
    orderBy: [
      {
        position: 'asc',
      },
      {
        id: 'asc',
      },
    ],
    select: screenshotSelect,
  });
  return {
    ok: true,
    items: saved,
  };
}

/**
 * Delete the object and `Media` row behind an image this build used, when it is one of the member's own uploads
 * (attached, no post) and nothing else on the site still shows it. A pasted address has no row and is left alone.
 */
export async function releaseUploadedImage(url: string | null | undefined, userId: string): Promise<void> {
  if (!url) return;
  const [shots, covers] = await Promise.all([
    prisma.buildScreenshot.count({
      where: {
        url,
      },
    }),
    prisma.userBuild.count({
      where: {
        thumbnailUrl: url,
      },
    }),
  ]);
  if (shots + covers > 0) return;
  const rows = await prisma.media.findMany({
    where: {
      userId,
      url,
      status: 'ATTACHED',
      postId: null,
      attachedAt: null,
    },
    select: {
      id: true,
      key: true,
    },
  });
  for (const row of Array.isArray(rows) ? rows : []) {
    await deleteObject(row.key);
    await prisma.media.delete({
      where: {
        id: row.id,
      },
    });
  }
}

/** Mark the member's own pending upload as the build's cover, so the sweep keeps it. A pasted address matches nothing. */
export async function claimCoverUpload(url: string | null | undefined, userId: string): Promise<void> {
  if (!url) return;
  await prisma.media.updateMany({
    where: {
      userId,
      url,
      status: 'PENDING',
    },
    data: {
      status: 'ATTACHED',
    },
  });
}

/** Every uploaded picture a build holds (its cover and screenshots), for clean-up before the build is deleted. */
export async function buildImageUrls(buildId: string): Promise<string[]> {
  const [build, shots] = await Promise.all([
    prisma.userBuild.findUnique({
      where: {
        id: buildId,
      },
      select: {
        thumbnailUrl: true,
      },
    }),
    prisma.buildScreenshot.findMany({
      where: {
        buildId,
      },
      select: {
        url: true,
      },
    }),
  ]);
  return [build?.thumbnailUrl, ...shots.map((s) => s.url)].filter((u): u is string => !!u);
}

/** The member's builds' screenshots, for the account export. */
export async function exportBuildScreenshots(userId: string) {
  const rows = await prisma.buildScreenshot.findMany({
    where: {
      build: {
        userId,
      },
    },
    orderBy: [
      {
        buildId: 'asc',
      },
      {
        position: 'asc',
      },
    ],
    select: {
      url: true,
      description: true,
      position: true,
      build: {
        select: {
          slug: true,
          thumbnailAlt: true,
        },
      },
    },
  });
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    build: r.build.slug,
    position: r.position,
    url: r.url,
    description: r.description,
  }));
}
