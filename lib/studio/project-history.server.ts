/**
 * Earlier versions of a cloud Studio project (`StudioProjectRevision`).
 *
 * - Capture and trimming run inside `saveCloudProject`'s transaction, under the member's `studio-projects:<userId>`
 *   lock, so a save, the version it keeps and the trim are one unit.
 * - The byte cap is summed from stored `sizeBytes` (never by reading a blob) and trims oldest first across projects.
 * - The list selects metadata only; one version's JSON is read only to restore it or open it as a copy.
 * - Every read is scoped by `userId` (a plain column on the version), so another member's version id is a miss.
 * - This module is a leaf: `cloud-projects.server.ts` imports it (the save captures and trims), never the reverse, so
 *   `restoreVersion` (which saves) lives there.
 * - Worst case a member stores `MAX_VERSION_BYTES_PER_MEMBER` (20 MB) of versions.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { overflowByBytes, MAX_VERSIONS_PER_PROJECT, shouldCapture, trackCountOf } from '@/lib/studio/project-history';
import type { ProjectVersion, ProjectVersionSummary } from '@/lib/studio/project-history.contract';
import type { StudioProjectData } from '@/lib/studio/projects.contract';

const SUMMARY_SELECT = {
  id: true,
  revision: true,
  name: true,
  savedAt: true,
  sizeBytes: true,
  trackCount: true,
} as const;

interface SummaryRow {
  id: string;
  revision: number;
  name: string;
  savedAt: Date;
  sizeBytes: number;
  trackCount: number;
}

function toSummary(row: SummaryRow): ProjectVersionSummary {
  return {
    id: row.id,
    revision: row.revision,
    name: row.name,
    savedAt: row.savedAt.toISOString(),
    sizeBytes: row.sizeBytes,
    trackCount: row.trackCount,
  };
}

export interface ReplacedVersion {
  userId: string;
  projectId: string;
  /** The revision the replaced data had. */
  revision: number;
  name: string;
  data: unknown;
  sizeBytes: number;
  /** When the replaced data was saved. */
  savedAt: Date;
}

/** Keep the version a save is replacing, unless the 10-minute window says it is too close to the last kept one. */
export async function captureVersion(
  tx: Prisma.TransactionClient,
  replaced: ReplacedVersion,
  isRestore: boolean,
): Promise<string | null> {
  const newest = await tx.studioProjectRevision.findFirst({
    where: { projectId: replaced.projectId },
    orderBy: { savedAt: 'desc' },
    select: { savedAt: true },
  });
  if (!shouldCapture(replaced.savedAt, newest ? newest.savedAt : null, isRestore)) return null;
  const created = await tx.studioProjectRevision.create({
    data: {
      projectId: replaced.projectId,
      userId: replaced.userId,
      revision: replaced.revision,
      name: replaced.name,
      data: replaced.data as Prisma.InputJsonValue,
      sizeBytes: replaced.sizeBytes,
      trackCount: trackCountOf(replaced.data),
      savedAt: replaced.savedAt,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Enforce the per-project count (20) and then the per-member byte cap (20 MB), oldest first. `protectIds` are never
 * deleted (a restore protects the version it restores and the state it replaced, so it can always be undone or
 * repeated); the caps are then enforced on the rest.
 */
export async function trimVersions(
  tx: Prisma.TransactionClient,
  userId: string,
  projectId: string,
  protectIds: readonly string[] = [],
): Promise<void> {
  const protectedIds = new Set(protectIds);
  const ofProject = await tx.studioProjectRevision.findMany({
    where: { projectId },
    orderBy: { revision: 'desc' },
    select: { id: true, revision: true },
  });
  // `ofProject` is newest first, so the last unprotected entries are the oldest.
  const excess = Math.max(0, ofProject.length - MAX_VERSIONS_PER_PROJECT);
  const unprotected = ofProject.filter((v) => !protectedIds.has(v.id));
  const overCount = excess > 0 ? unprotected.slice(-excess).map((v) => v.id) : [];
  if (overCount.length > 0) {
    await tx.studioProjectRevision.deleteMany({ where: { userId, id: { in: overCount } } });
  }
  const gone = new Set(overCount);
  const ofMember = await tx.studioProjectRevision.findMany({
    where: { userId },
    orderBy: [{ savedAt: 'asc' }, { id: 'asc' }],
    select: { id: true, sizeBytes: true, savedAt: true },
  });
  const overBytes = overflowByBytes(
    ofMember.filter((v) => !gone.has(v.id)),
    undefined,
    protectedIds,
  );
  if (overBytes.length > 0) {
    await tx.studioProjectRevision.deleteMany({ where: { userId, id: { in: overBytes } } });
  }
}

/** The project's versions, newest first, without their JSON; null when the member has no such project. */
export async function listVersions(userId: string, projectId: string): Promise<ProjectVersionSummary[] | null> {
  const project = await prisma.studioProject.findFirst({ where: { id: projectId, userId }, select: { id: true } });
  if (!project) return null;
  const rows = await prisma.studioProjectRevision.findMany({
    where: { projectId, userId },
    orderBy: { revision: 'desc' },
    select: SUMMARY_SELECT,
  });
  return rows.map(toSummary);
}

/** One version with its JSON, or null (also for another member's version or project). */
export async function getVersion(userId: string, projectId: string, versionId: string): Promise<ProjectVersion | null> {
  const row = await prisma.studioProjectRevision.findFirst({
    where: { id: versionId, projectId, userId },
    select: { ...SUMMARY_SELECT, data: true },
  });
  if (!row) return null;
  // The column was written from a validated project, so it is one.
  return { ...toSummary(row), data: row.data as unknown as StudioProjectData };
}

/** Erasure: every version the member has (the cascade from project deletion never fires on an anonymised account). */
export function studioHistoryErasureOps(userId: string) {
  return [prisma.studioProjectRevision.deleteMany({ where: { userId } })];
}

export interface StudioHistoryExport {
  projectId: string;
  revision: number;
  savedAt: string;
  sizeBytes: number;
}

/** Account export: each project's versions as metadata only (the current data is already exported). */
export async function exportStudioHistory(userId: string): Promise<StudioHistoryExport[]> {
  const rows = await prisma.studioProjectRevision.findMany({
    where: { userId },
    orderBy: [{ projectId: 'asc' }, { revision: 'asc' }],
    select: { projectId: true, revision: true, savedAt: true, sizeBytes: true },
  });
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    projectId: row.projectId,
    revision: row.revision,
    savedAt: row.savedAt.toISOString(),
    sizeBytes: row.sizeBytes,
  }));
}
