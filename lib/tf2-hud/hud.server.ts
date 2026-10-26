/**
 * Server-side persistence for the TF2 HUD Editor: HUD rows, immutable versions
 * (a manifest each), content-addressed file blobs, forks, likes and share links.
 *
 * Trust model, because this is where user-supplied files enter the database:
 *  - a manifest may only reference blobs its author uploaded (or forked from a
 *    HUD they can read) — a hash alone never grants access to someone's file;
 *  - paths are re-validated here, not trusted from the client;
 *  - sizes come from the stored blob, never from the request;
 *  - served files get a content type from the (allow-listed) extension and a
 *    sandboxing CSP, so nothing a user uploads can run as a page.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { contentTypeForFilename } from '@/lib/storage/keys';
import { getObject, putObject } from '@/lib/storage/s3.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import {
  HUD_LIMITS,
  type HudAuthor,
  type HudDetail,
  type HudSummary,
  type ManifestEntry,
  type VersionSummary,
  type Visibility,
} from './api-types';
import { ALLOWED_HUD_EXTENSIONS, HUD_ROOT_FOLDERS, extOf, sanitizePath } from './project/paths';
import { slugify } from './zip/export';

export class HudError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 413 | 429,
  ) {
    super(message);
    this.name = 'HudError';
  }
}

const AUTOSAVE_WINDOW_MS = 15 * 60_000;
const MAX_USER_BLOBS = 20_000;
const BLOB_PREFIX = 'tf2-hud/blobs/';

const hudInclude = {
  owner: { select: userDisplaySelect },
  forkOf: { select: { id: true, slug: true, title: true, visibility: true } },
} satisfies Prisma.Tf2HudInclude;

type HudRow = Prisma.Tf2HudGetPayload<{ include: typeof hudInclude }>;

/* ───────────────────────────── helpers ───────────────────────────── */

function author(row: HudRow): HudAuthor | null {
  const u = resolveUser(row.owner);
  return { id: u.id, name: u.name ?? 'Unknown', handle: u.handle, image: u.image };
}

function summary(row: HudRow, liked: boolean): HudSummary {
  const origin = row.forkOf && row.forkOf.visibility !== 'PRIVATE' ? row.forkOf : null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    tags: row.tags,
    visibility: row.visibility,
    author: author(row),
    likeCount: row.likeCount,
    forkCount: row.forkCount,
    downloadCount: row.downloadCount,
    fileCount: row.fileCount,
    totalBytes: row.totalBytes,
    latestVersion: row.latestVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    forkOf: origin ? { id: origin.id, slug: origin.slug, title: origin.title } : null,
    liked,
  };
}

export function canRead(
  row: { visibility: Visibility; ownerId: string },
  userId: string | null,
): boolean {
  return row.visibility !== 'PRIVATE' || row.ownerId === userId;
}

async function likedSet(userId: string | null, ids: string[]): Promise<Set<string>> {
  if (!userId || ids.length === 0) return new Set();
  const rows = await prisma.tf2HudLike.findMany({
    where: { userId, hudId: { in: ids } },
    select: { hudId: true },
  });
  return new Set(rows.map((r) => r.hudId));
}

function sha1Of(bytes: Uint8Array): string {
  return createHash('sha1').update(bytes).digest('hex');
}

async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title).replace(/_/g, '-').slice(0, 40) || 'hud';
  for (let i = 0; i < 5; i++) {
    const slug = `${base}-${randomBytes(3).toString('hex')}`;
    if (!(await prisma.tf2Hud.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${base}-${randomBytes(6).toString('hex')}`;
}

function parseManifest(json: Prisma.JsonValue): ManifestEntry[] {
  return Array.isArray(json) ? (json as unknown as ManifestEntry[]) : [];
}

/* ───────────────────────────── manifests ───────────────────────────── */

interface CheckedManifest {
  entries: ManifestEntry[];
  fileCount: number;
  totalBytes: number;
}

/**
 * Validate a client manifest against the rules above and return it normalised,
 * with sizes taken from the stored blobs.
 */
async function checkManifest(userId: string, manifest: ManifestEntry[]): Promise<CheckedManifest> {
  if (manifest.length > HUD_LIMITS.maxFiles) throw new HudError('Too many files', 413);

  const seen = new Set<string>();
  const clean: ManifestEntry[] = [];
  for (const e of manifest) {
    const path = sanitizePath(e.path);
    if (!path || path !== e.path) throw new HudError(`Invalid path: ${e.path}`, 400);
    const first = path.split('/')[0].toLowerCase();
    if (!(HUD_ROOT_FOLDERS as readonly string[]).includes(first)) {
      throw new HudError(
        `Files must live under resource/, scripts/, materials/ or sound/: ${path}`,
        400,
      );
    }
    if (!ALLOWED_HUD_EXTENSIONS.has(extOf(path)))
      throw new HudError(`Unsupported file type: ${path}`, 400);
    const key = path.toLowerCase();
    if (seen.has(key)) throw new HudError(`Duplicate path: ${path}`, 400);
    seen.add(key);
    clean.push(e.deleted ? { path, deleted: true } : { path, sha1: e.sha1 });
  }

  const hashes = [...new Set(clean.flatMap((e) => (e.sha1 ? [e.sha1] : [])))];
  const owned = hashes.length
    ? await prisma.tf2HudUserBlob.findMany({
        where: { userId, sha1: { in: hashes } },
        select: { blob: { select: { sha1: true, size: true } } },
      })
    : [];
  const sizes = new Map(owned.map((o) => [o.blob.sha1, o.blob.size]));

  let totalBytes = 0;
  let fileCount = 0;
  const entries = clean.map((e) => {
    if (e.deleted) return e;
    const size = sizes.get(e.sha1!);
    if (size === undefined)
      throw new HudError(`File contents for ${e.path} have not been uploaded`, 400);
    totalBytes += size;
    fileCount++;
    return { path: e.path, sha1: e.sha1, size };
  });
  if (totalBytes > HUD_LIMITS.maxTotalBytes)
    throw new HudError('This HUD is larger than 150 MB', 413);
  return { entries, fileCount, totalBytes };
}

/* ───────────────────────────── blobs ───────────────────────────── */

export async function missingBlobs(userId: string, hashes: string[]): Promise<string[]> {
  const have = await prisma.tf2HudUserBlob.findMany({
    where: { userId, sha1: { in: hashes } },
    select: { sha1: true },
  });
  const set = new Set(have.map((h) => h.sha1));
  return hashes.filter((h) => !set.has(h));
}

/** Store the bytes (once, globally) and record that `userId` supplied them. */
export async function storeBlob(userId: string, sha1: string, bytes: Uint8Array): Promise<void> {
  if (bytes.length === 0 || bytes.length > HUD_LIMITS.maxBlobBytes) {
    throw new HudError('File size is not allowed', 413);
  }
  if (sha1Of(bytes) !== sha1) throw new HudError('Hash does not match the uploaded bytes', 400);

  const owned = await prisma.tf2HudUserBlob.count({ where: { userId } });
  if (owned >= MAX_USER_BLOBS) throw new HudError('Storage limit reached', 429);

  const existing = await prisma.tf2HudBlob.findUnique({ where: { sha1 }, select: { sha1: true } });
  if (!existing) {
    const storageKey = `${BLOB_PREFIX}${sha1.slice(0, 2)}/${sha1}`;
    await putObject(storageKey, Buffer.from(bytes), 'application/octet-stream');
    await prisma.tf2HudBlob.upsert({
      where: { sha1 },
      create: { sha1, size: bytes.length, storageKey },
      update: {},
    });
  }
  await prisma.tf2HudUserBlob.upsert({
    where: { userId_sha1: { userId, sha1 } },
    create: { userId, sha1 },
    update: {},
  });
}

/* ───────────────────────────── reads ───────────────────────────── */

export interface ListArgs {
  userId: string | null;
  q?: string;
  sort: 'new' | 'top' | 'forks';
  tag?: string;
  cursor?: string;
  mine?: boolean;
  limit: number;
}

export async function listHuds(
  args: ListArgs,
): Promise<{ items: HudSummary[]; nextCursor: string | null }> {
  if (args.mine && !args.userId) throw new HudError('Sign in to see your HUDs', 403);
  const where: Prisma.Tf2HudWhereInput = args.mine
    ? { ownerId: args.userId! }
    : { visibility: 'PUBLIC', latestVersion: { gt: 0 } };
  const and: Prisma.Tf2HudWhereInput[] = [];
  if (args.q) {
    and.push({
      OR: [
        { title: { contains: args.q, mode: 'insensitive' } },
        { description: { contains: args.q, mode: 'insensitive' } },
        { tags: { has: args.q.toLowerCase() } },
      ],
    });
  }
  if (args.tag) and.push({ tags: { has: args.tag } });
  if (and.length) where.AND = and;

  const orderBy: Prisma.Tf2HudOrderByWithRelationInput[] =
    args.sort === 'new'
      ? [{ updatedAt: 'desc' }, { id: 'desc' }]
      : args.sort === 'forks'
        ? [{ forkCount: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }]
        : [{ likeCount: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }];

  const rows = await prisma.tf2Hud.findMany({
    where,
    orderBy,
    take: args.limit + 1,
    ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
    include: hudInclude,
  });
  const page = rows.slice(0, args.limit);
  const liked = await likedSet(
    args.userId,
    page.map((r) => r.id),
  );
  return {
    items: page.map((r) => summary(r, liked.has(r.id))),
    nextCursor: rows.length > args.limit ? page[page.length - 1].id : null,
  };
}

async function findRow(idOrSlug: string): Promise<HudRow | null> {
  return prisma.tf2Hud.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: hudInclude,
  });
}

async function latestManifest(hudId: string, version?: number): Promise<ManifestEntry[]> {
  const row = await prisma.tf2HudVersion.findFirst({
    where: { hudId, ...(version ? { number: version } : {}) },
    orderBy: { number: 'desc' },
    select: { manifest: true },
  });
  return row ? parseManifest(row.manifest) : [];
}

async function detail(row: HudRow, userId: string | null, viaShare: boolean): Promise<HudDetail> {
  const isOwner = row.ownerId === userId;
  const [manifest, liked, share] = await Promise.all([
    latestManifest(row.id),
    likedSet(userId, [row.id]),
    isOwner
      ? prisma.tf2HudShare.findFirst({ where: { hudId: row.id }, select: { token: true } })
      : null,
  ]);
  return {
    ...summary(row, liked.has(row.id)),
    manifest,
    baseCommit: row.baseCommit,
    isOwner,
    shareToken: share?.token ?? null,
    viaShare,
  };
}

export async function getHud(idOrSlug: string, userId: string | null): Promise<HudDetail> {
  const row = await findRow(idOrSlug);
  if (!row || !canRead(row, userId)) throw new HudError('Not found', 404);
  return detail(row, userId, false);
}

export async function getHudByShare(token: string, userId: string | null): Promise<HudDetail> {
  const share = await prisma.tf2HudShare.findUnique({ where: { token }, select: { hudId: true } });
  const row = share ? await findRow(share.hudId) : null;
  if (!row) throw new HudError('Not found', 404);
  return detail(row, userId, true);
}

async function readableRow(idOrSlug: string, userId: string | null): Promise<HudRow> {
  const row = await findRow(idOrSlug);
  if (!row || !canRead(row, userId)) throw new HudError('Not found', 404);
  return row;
}

export interface ServedFile {
  body: Buffer;
  contentType: string;
  sha1: string;
  immutablePublic: boolean;
}

async function serve(row: HudRow, path: string, version?: number): Promise<ServedFile> {
  const manifest = await latestManifest(row.id, version);
  const entry = manifest.find((e) => e.path === path);
  if (!entry?.sha1 || entry.deleted) throw new HudError('Not found', 404);
  const blob = await prisma.tf2HudBlob.findUnique({
    where: { sha1: entry.sha1 },
    select: { storageKey: true },
  });
  const object = blob ? await getObject(blob.storageKey) : null;
  if (!object) throw new HudError('Not found', 404);
  return {
    body: object.body,
    contentType: contentTypeForFilename(path),
    sha1: entry.sha1,
    immutablePublic: row.visibility === 'PUBLIC',
  };
}

export async function readFile(
  idOrSlug: string,
  userId: string | null,
  path: string,
  version?: number,
) {
  return serve(await readableRow(idOrSlug, userId), path, version);
}

export async function readSharedFile(token: string, path: string, version?: number) {
  const share = await prisma.tf2HudShare.findUnique({ where: { token }, select: { hudId: true } });
  const row = share ? await findRow(share.hudId) : null;
  if (!row) throw new HudError('Not found', 404);
  return serve(row, path, version);
}

/* ───────────────────────────── writes ───────────────────────────── */

async function ownedRow(id: string, userId: string): Promise<HudRow> {
  const row = await findRow(id);
  if (!row || row.ownerId !== userId) throw new HudError('Not found', 404);
  return row;
}

async function assertHudQuota(userId: string): Promise<void> {
  const count = await prisma.tf2Hud.count({ where: { ownerId: userId } });
  if (count >= HUD_LIMITS.maxHudsPerUser)
    throw new HudError('HUD limit reached — delete one first', 429);
}

interface VersionInput {
  manifest: CheckedManifest;
  message: string;
  autosave: boolean;
}

/** Add (or, for an autosave, fold into) a version and refresh the HUD's counters. */
async function writeVersion(hudId: string, input: VersionInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const hud = await tx.tf2Hud.findUnique({
      where: { id: hudId },
      select: { latestVersion: true },
    });
    if (!hud) throw new HudError('Not found', 404);
    const latest = hud.latestVersion
      ? await tx.tf2HudVersion.findUnique({
          where: { hudId_number: { hudId, number: hud.latestVersion } },
          select: { autosave: true, createdAt: true },
        })
      : null;

    const data = {
      manifest: input.manifest.entries as unknown as Prisma.InputJsonValue,
      fileCount: input.manifest.fileCount,
      totalBytes: input.manifest.totalBytes,
    };
    let number = hud.latestVersion;
    if (
      input.autosave &&
      latest?.autosave &&
      Date.now() - latest.createdAt.getTime() < AUTOSAVE_WINDOW_MS
    ) {
      await tx.tf2HudVersion.update({ where: { hudId_number: { hudId, number } }, data });
    } else {
      number += 1;
      await tx.tf2HudVersion.create({
        data: { hudId, number, message: input.message, autosave: input.autosave, ...data },
      });
      const stale = number - HUD_LIMITS.maxVersionsKept;
      if (stale > 0)
        await tx.tf2HudVersion.deleteMany({ where: { hudId, number: { lte: stale } } });
    }
    await tx.tf2Hud.update({
      where: { id: hudId },
      data: { latestVersion: number, fileCount: data.fileCount, totalBytes: data.totalBytes },
    });
  });
}

export interface CreateArgs {
  userId: string;
  title: string;
  description: string;
  tags: string[];
  visibility: Visibility;
  manifest: ManifestEntry[];
  baseCommit: string;
  forkOfId?: string;
  message?: string;
}

export async function createHud(a: CreateArgs): Promise<HudDetail> {
  await assertHudQuota(a.userId);
  const checked = await checkManifest(a.userId, a.manifest);
  let forkOfId: string | undefined;
  if (a.forkOfId) {
    const src = await prisma.tf2Hud.findUnique({
      where: { id: a.forkOfId },
      select: { id: true, ownerId: true, visibility: true },
    });
    if (src && canRead(src, a.userId)) forkOfId = src.id;
  }
  const slug = await uniqueSlug(a.title);
  const hud = await prisma.tf2Hud.create({
    data: {
      ownerId: a.userId,
      slug,
      title: a.title,
      description: a.description,
      tags: a.tags,
      visibility: a.visibility,
      baseCommit: a.baseCommit,
      forkOfId,
    },
    select: { id: true },
  });
  if (forkOfId)
    await prisma.tf2Hud.update({ where: { id: forkOfId }, data: { forkCount: { increment: 1 } } });
  await writeVersion(hud.id, { manifest: checked, message: a.message ?? '', autosave: false });
  return getHud(hud.id, a.userId);
}

export interface UpdateArgs {
  userId: string;
  id: string;
  title?: string;
  description?: string;
  tags?: string[];
  visibility?: Visibility;
  manifest?: ManifestEntry[];
  message?: string;
  autosave?: boolean;
}

export async function updateHud(a: UpdateArgs): Promise<HudDetail> {
  await ownedRow(a.id, a.userId);
  const checked = a.manifest ? await checkManifest(a.userId, a.manifest) : null;
  const meta: Prisma.Tf2HudUpdateInput = {};
  if (a.title !== undefined) meta.title = a.title;
  if (a.description !== undefined) meta.description = a.description;
  if (a.tags !== undefined) meta.tags = a.tags;
  if (a.visibility !== undefined) meta.visibility = a.visibility;
  if (Object.keys(meta).length) await prisma.tf2Hud.update({ where: { id: a.id }, data: meta });
  if (checked) {
    await writeVersion(a.id, {
      manifest: checked,
      message: a.message ?? '',
      autosave: a.autosave ?? false,
    });
  }
  return getHud(a.id, a.userId);
}

export async function deleteHud(id: string, userId: string): Promise<void> {
  const row = await ownedRow(id, userId);
  await prisma.$transaction(async (tx) => {
    if (row.forkOfId) {
      await tx.tf2Hud.updateMany({
        where: { id: row.forkOfId, forkCount: { gt: 0 } },
        data: { forkCount: { decrement: 1 } },
      });
    }
    await tx.tf2Hud.delete({ where: { id } });
  });
}

export async function forkHud(idOrSlug: string, userId: string): Promise<HudDetail> {
  const src = await readableRow(idOrSlug, userId);
  await assertHudQuota(userId);
  const manifest = await latestManifest(src.id);
  const hashes = [...new Set(manifest.flatMap((e) => (e.sha1 ? [e.sha1] : [])))];
  // Reading the source is what entitles the forker to its blobs.
  if (hashes.length) {
    await prisma.tf2HudUserBlob.createMany({
      data: hashes.map((sha1) => ({ userId, sha1 })),
      skipDuplicates: true,
    });
  }
  return createHud({
    userId,
    title: `${src.title} (copy)`.slice(0, 80),
    description: src.description,
    tags: src.tags,
    visibility: 'PRIVATE',
    manifest,
    baseCommit: src.baseCommit,
    forkOfId: src.id,
    message: `Forked from ${src.title}`,
  });
}

export async function toggleLike(
  idOrSlug: string,
  userId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const row = await readableRow(idOrSlug, userId);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.tf2HudLike.findUnique({
      where: { userId_hudId: { userId, hudId: row.id } },
    });
    if (existing) {
      await tx.tf2HudLike.delete({ where: { userId_hudId: { userId, hudId: row.id } } });
      const u = await tx.tf2Hud.update({
        where: { id: row.id },
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      });
      return { liked: false, likeCount: Math.max(0, u.likeCount) };
    }
    await tx.tf2HudLike.create({ data: { userId, hudId: row.id } });
    const u = await tx.tf2Hud.update({
      where: { id: row.id },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
    return { liked: true, likeCount: u.likeCount };
  });
}

export async function countDownload(idOrSlug: string, userId: string | null): Promise<void> {
  const row = await readableRow(idOrSlug, userId);
  if (row.visibility === 'PRIVATE') return;
  await prisma.tf2Hud.update({ where: { id: row.id }, data: { downloadCount: { increment: 1 } } });
}

export async function createShare(id: string, userId: string): Promise<string> {
  await ownedRow(id, userId);
  const existing = await prisma.tf2HudShare.findFirst({
    where: { hudId: id },
    select: { token: true },
  });
  if (existing) return existing.token;
  const token = randomBytes(18).toString('base64url');
  await prisma.tf2HudShare.create({ data: { hudId: id, token } });
  return token;
}

export async function revokeShares(id: string, userId: string): Promise<void> {
  await ownedRow(id, userId);
  await prisma.tf2HudShare.deleteMany({ where: { hudId: id } });
}

export async function listVersions(id: string, userId: string): Promise<VersionSummary[]> {
  await ownedRow(id, userId);
  const rows = await prisma.tf2HudVersion.findMany({
    where: { hudId: id },
    orderBy: { number: 'desc' },
    select: {
      number: true,
      message: true,
      fileCount: true,
      totalBytes: true,
      createdAt: true,
      autosave: true,
    },
  });
  return rows.map((r) => ({
    number: r.number,
    message: r.message || (r.autosave ? 'Autosave' : ''),
    fileCount: r.fileCount,
    totalBytes: r.totalBytes,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function restoreVersion(
  id: string,
  userId: string,
  number: number,
): Promise<HudDetail> {
  await ownedRow(id, userId);
  const v = await prisma.tf2HudVersion.findUnique({
    where: { hudId_number: { hudId: id, number } },
  });
  if (!v) throw new HudError('Not found', 404);
  const checked = await checkManifest(userId, parseManifest(v.manifest));
  await writeVersion(id, { manifest: checked, message: `Restored v${number}`, autosave: false });
  return getHud(id, userId);
}
