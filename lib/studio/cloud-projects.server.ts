/**
 * Cloud copies of Studio projects (`StudioProject`): one row per member project, at most 25 each.
 *
 * - The cap is a check-then-insert, so it runs in a transaction that first takes the member's advisory lock
 *   (`studio-projects:<userId>`): two tabs creating their 25th and 26th project cannot both pass the count.
 * - A save names the revision it started from. The update is a compare-and-set (`updateMany` where the revision
 *   still matches) that bumps the revision, so of two devices saving the same base only one wins; zero rows
 *   updated is "stale" and the caller gets the current revision to overwrite or reload.
 * - Every read and write is scoped to the caller's `userId`. A project id is the client's own id and a primary key,
 *   so an id that belongs to another member is refused as `id-taken` and never touched or described.
 * - Each replacing save keeps the version it replaces, and trims, in the same transaction
 *   (`project-history.server.ts`).
 * - The list never selects `data`: its size is kept beside it in `sizeBytes`.
 */
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { captureVersion, getVersion, trimVersions } from '@/lib/studio/project-history.server';
import { MAX_CLOUD_PROJECTS, MAX_PROJECT_BYTES } from '@/lib/studio/project-schema';
import type {
  CloudProject,
  CloudProjectSummary,
  CloudSaveRefusal,
  StudioProjectData,
} from '@/lib/studio/projects.contract';

const SUMMARY_SELECT = {
  id: true,
  name: true,
  sizeBytes: true,
  revision: true,
  updatedAt: true,
} as const;

interface SummaryRow {
  id: string;
  name: string;
  sizeBytes: number;
  revision: number;
  updatedAt: Date;
}

function toSummary(row: SummaryRow): CloudProjectSummary {
  return {
    id: row.id,
    name: row.name,
    sizeBytes: row.sizeBytes,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type CloudSaveResult =
  | { ok: true; project: CloudProjectSummary }
  | { ok: false; reason: Exclude<CloudSaveRefusal, 'stale' | 'exists'> }
  | { ok: false; reason: 'stale' | 'exists'; revision: number };

/** The member's projects, newest first, without their JSON. */
export async function listCloudProjects(userId: string): Promise<CloudProjectSummary[]> {
  const rows = await prisma.studioProject.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: SUMMARY_SELECT,
  });
  return rows.map(toSummary);
}

/** One of the member's projects with its JSON, or null (also for another member's id). */
export async function getCloudProject(userId: string, id: string): Promise<CloudProject | null> {
  const row = await prisma.studioProject.findFirst({
    where: { id, userId },
    select: { ...SUMMARY_SELECT, data: true },
  });
  if (!row) return null;
  // The column was written from a validated project, so it is one.
  return { ...toSummary(row), data: row.data as unknown as StudioProjectData };
}

export interface CloudSaveInput {
  id: string;
  name: string;
  data: StudioProjectData;
  /** Absent: create the project. Present: replace it, if it is still at this revision. */
  baseRevision?: number;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002'
  );
}

/** Create (no `baseRevision`) or replace (`baseRevision`) one of the member's projects. */
export async function saveCloudProject(
  userId: string,
  input: CloudSaveInput,
  options: { isRestore?: boolean; restoredVersionId?: string } = {},
): Promise<CloudSaveResult> {
  const json = JSON.stringify(input.data);
  const sizeBytes = Buffer.byteLength(json, 'utf8');
  if (sizeBytes > MAX_PROJECT_BYTES) return { ok: false, reason: 'too-large' };
  // JSON.parse returns `any`, which is what Prisma's Json input wants; the value is the validated project.
  const data = JSON.parse(json);

  if (input.baseRevision === undefined) {
    try {
      return await prisma.$transaction(async (tx) => {
        await lockKey(tx, `studio-projects:${userId}`);
        const existing = await tx.studioProject.findUnique({
          where: { id: input.id },
          select: { userId: true, revision: true },
        });
        if (existing) {
          return existing.userId === userId
            ? ({ ok: false, reason: 'exists', revision: existing.revision } as const)
            : ({ ok: false, reason: 'id-taken' } as const);
        }
        const count = await tx.studioProject.count({ where: { userId } });
        if (count >= MAX_CLOUD_PROJECTS) return { ok: false, reason: 'limit' } as const;
        const row = await tx.studioProject.create({
          data: { id: input.id, userId, name: input.name, data, sizeBytes },
          select: SUMMARY_SELECT,
        });
        return { ok: true, project: toSummary(row) } as const;
      });
    } catch (error) {
      // Two members minting the same id at once: the primary key decides, the loser is refused.
      if (isUniqueViolation(error)) return { ok: false, reason: 'id-taken' };
      throw error;
    }
  }

  // Capture, trim and the compare-and-set save are one transaction under the member's lock (earlier versions:
  // lib/studio/project-history.server.ts).
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `studio-projects:${userId}`);
    const current = await tx.studioProject.findUnique({
      where: { id: input.id },
      select: { userId: true, revision: true, name: true, data: true, sizeBytes: true, updatedAt: true },
    });
    if (!current) return { ok: false, reason: 'not-found' } as const;
    if (current.userId !== userId) return { ok: false, reason: 'id-taken' } as const;
    if (current.revision !== input.baseRevision) {
      return { ok: false, reason: 'stale', revision: current.revision } as const;
    }
    const updated = await tx.studioProject.updateMany({
      where: { id: input.id, userId, revision: input.baseRevision },
      data: { name: input.name, data, sizeBytes, revision: { increment: 1 } },
    });
    if (updated.count !== 1) return { ok: false, reason: 'stale', revision: current.revision } as const;
    const capturedId = await captureVersion(
      tx,
      {
        userId,
        projectId: input.id,
        revision: current.revision,
        name: current.name,
        data: current.data,
        sizeBytes: current.sizeBytes,
        savedAt: current.updatedAt,
      },
      options.isRestore === true,
    );
    const protect = [capturedId, options.restoredVersionId].filter((v): v is string => typeof v === 'string');
    await trimVersions(tx, userId, input.id, options.isRestore === true ? protect : []);
    const row = await tx.studioProject.findFirst({ where: { id: input.id, userId }, select: SUMMARY_SELECT });
    if (!row) return { ok: false, reason: 'not-found' } as const;
    return { ok: true, project: toSummary(row) } as const;
  });
}

/**
 * Write an earlier version back as a new save of the project: the current state becomes a version first (the
 * window is waived), so a restore can itself be undone. `baseRevision` is checked like any save (stale is refused).
 * The version being restored and the state it replaced are exempt from trimming.
 */
export async function restoreVersion(
  userId: string,
  projectId: string,
  versionId: string,
  baseRevision: number,
): Promise<CloudSaveResult> {
  const version = await getVersion(userId, projectId, versionId);
  if (!version) return { ok: false, reason: 'not-found' };
  return saveCloudProject(
    userId,
    {
      id: projectId,
      name: version.name,
      data: { ...version.data, id: projectId, name: version.name },
      baseRevision,
    },
    { isRestore: true, restoredVersionId: versionId },
  );
}

/** Delete one of the member's projects. False when there was none (also for another member's id). */
export async function deleteCloudProject(userId: string, id: string): Promise<boolean> {
  // The project's versions go with it (explicitly as well as by the foreign key's cascade).
  return prisma.$transaction(async (tx) => {
    await tx.studioProjectRevision.deleteMany({ where: { projectId: id, userId } });
    const { count } = await tx.studioProject.deleteMany({ where: { id, userId } });
    return count > 0;
  });
}

export interface StudioProjectExport {
  id: string;
  name: string;
  sizeBytes: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  data: unknown;
}

/** Everything the member has stored here, for the account export (names, sizes and the project JSON). */
export async function exportStudioProjects(userId: string): Promise<StudioProjectExport[]> {
  const rows = await prisma.studioProject.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { ...SUMMARY_SELECT, createdAt: true, data: true },
  });
  return rows.map((row) => ({
    ...toSummary(row),
    createdAt: row.createdAt.toISOString(),
    data: row.data,
  }));
}
