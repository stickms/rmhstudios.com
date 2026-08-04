/**
 * Profile links, promoted out of the JSON blob (J1).
 *
 * `UserProfile.links` still exists and the public profile still reads it, so
 * this module is deliberately **two-way** during the migration:
 *
 *  - reads lazily BACK-FILL the `ProfileLink` table from the blob the first
 *    time a user's rows are asked for, so nobody's links disappear the moment
 *    the new code path ships;
 *  - writes MIRROR the rows back into the blob, so every existing reader
 *    (`lib/profile.server.ts` → `ProfileHero`) keeps rendering the same links
 *    with no coordinated deploy.
 *
 * The rows are the source of truth for everything the blob cannot hold —
 * `verifiedAt`, `lastCheckedAt`, and the indexed `host` an impersonation
 * investigation queries. The mirror is transitional: when the profile read path
 * moves onto `listProfileLinks`, delete `writeLegacyMirror` and the column.
 */

import type { ProfileLink as ProfileLinkRow } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import {
  MAX_PROFILE_LINKS,
  linkDisplayLabel,
  linkHost,
  normalizeLinkUrl,
  type ProfileLinkDTO,
} from '@/lib/profile-links/schema';

export function toProfileLinkDTO(row: ProfileLinkRow): ProfileLinkDTO {
  return {
    id: row.id,
    url: row.url,
    label: row.label,
    host: row.host,
    position: row.position,
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
    lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
  };
}

/** Legacy blob entries: `{ label, url }`, label always present (old schema). */
interface LegacyLink {
  label: string;
  url: string;
}

function parseLegacyBlob(value: unknown): LegacyLink[] {
  if (!Array.isArray(value)) return [];
  const out: LegacyLink[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const url = (entry as { url?: unknown }).url;
    const label = (entry as { label?: unknown }).label;
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue;
    out.push({ url, label: typeof label === 'string' ? label : '' });
    if (out.length >= MAX_PROFILE_LINKS) break;
  }
  return out;
}

/**
 * Copy a user's JSON-blob links into `ProfileLink` **once**, if and only if the
 * table holds nothing for them yet.
 *
 * Idempotent and safe to race: the "is the table empty?" check runs inside the
 * same transaction as the insert, so two simultaneous reads cannot both decide
 * to backfill. Callers never have to know whether it ran.
 */
export async function backfillProfileLinks(userId: string): Promise<ProfileLinkRow[]> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { links: true },
  });
  const legacy = parseLegacyBlob(profile?.links);
  if (legacy.length === 0) return [];

  return prisma.$transaction(async (tx) => {
    const existing = await tx.profileLink.count({ where: { userId } });
    if (existing > 0) {
      return tx.profileLink.findMany({ where: { userId }, orderBy: [{ position: 'asc' }] });
    }
    await tx.profileLink.createMany({
      data: legacy.map((link, index) => ({
        userId,
        url: normalizeLinkUrl(link.url),
        label: link.label || null,
        position: index,
        host: linkHost(link.url),
      })),
    });
    return tx.profileLink.findMany({ where: { userId }, orderBy: [{ position: 'asc' }] });
  });
}

/**
 * A user's links, backfilling from the legacy blob on first read.
 *
 * Ordered by `position` then `createdAt` so the list is stable even if two rows
 * were handed the same position by an out-of-order reorder.
 */
export async function listProfileLinks(userId: string): Promise<ProfileLinkRow[]> {
  const rows = await prisma.profileLink.findMany({
    where: { userId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
  if (rows.length > 0) return rows;
  return backfillProfileLinks(userId);
}

/**
 * Re-write `UserProfile.links` from the rows.
 *
 * Transitional (see the module header). The legacy schema requires a non-empty
 * label, so a row with no label is mirrored with its derived display label
 * rather than dropped — otherwise the public profile would silently lose links
 * that the settings panel still shows.
 */
async function writeLegacyMirror(userId: string): Promise<void> {
  const rows = await prisma.profileLink.findMany({
    where: { userId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    take: MAX_PROFILE_LINKS,
  });
  const blob = rows.map((row) => ({
    label: linkDisplayLabel(row).slice(0, 30),
    url: row.url,
  }));
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, links: blob },
    update: { links: blob },
  });
}

export class ProfileLinkLimitError extends Error {
  constructor() {
    super(`At most ${MAX_PROFILE_LINKS} links allowed`);
    this.name = 'ProfileLinkLimitError';
  }
}

/** Add a link. Throws {@link ProfileLinkLimitError} past the cap. */
export async function addProfileLink(
  userId: string,
  input: { url: string; label?: string | null },
): Promise<ProfileLinkRow> {
  // Backfill first so the cap counts the links the user can actually see.
  const existing = await listProfileLinks(userId);
  if (existing.length >= MAX_PROFILE_LINKS) throw new ProfileLinkLimitError();

  const url = normalizeLinkUrl(input.url);
  const row = await prisma.profileLink.create({
    data: {
      userId,
      url,
      label: input.label?.trim() || null,
      host: linkHost(url),
      position: existing.length,
    },
  });
  await writeLegacyMirror(userId);
  return row;
}

/**
 * Edit a link.
 *
 * Changing the URL **clears the verification mark**: the proof was about the
 * old address, and carrying a check across an edit is how a verified link
 * becomes a redirect to anywhere.
 */
export async function updateProfileLink(
  userId: string,
  id: string,
  input: { url?: string; label?: string | null; position?: number },
): Promise<ProfileLinkRow | null> {
  const current = await prisma.profileLink.findFirst({ where: { id, userId } });
  if (!current) return null;

  const nextUrl = input.url !== undefined ? normalizeLinkUrl(input.url) : undefined;
  const urlChanged = nextUrl !== undefined && nextUrl !== current.url;

  const row = await prisma.profileLink.update({
    where: { id: current.id },
    data: {
      ...(nextUrl !== undefined ? { url: nextUrl, host: linkHost(nextUrl) } : {}),
      ...(input.label !== undefined ? { label: input.label?.trim() || null } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(urlChanged ? { verifiedAt: null, lastCheckedAt: null } : {}),
    },
  });
  await writeLegacyMirror(userId);
  return row;
}

/** Remove a link. Returns false when it is not this user's row. */
export async function deleteProfileLink(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.profileLink.deleteMany({ where: { id, userId } });
  if (count === 0) return false;
  await writeLegacyMirror(userId);
  return true;
}

/**
 * Every account claiming a host — the query a J2 impersonation investigation
 * runs, and the reason the links became rows at all.
 *
 * Verified claims sort first: an unverified claim on a domain somebody else has
 * proven is the exact shape of the report being investigated.
 */
export async function accountsClaimingHost(
  host: string,
  limit = 25,
): Promise<
  {
    userId: string;
    url: string;
    verifiedAt: Date | null;
    handle: string | null;
    name: string | null;
  }[]
> {
  const normalized = linkHost(host.includes('://') ? host : `https://${host}`);
  if (!normalized) return [];
  const rows = await prisma.profileLink.findMany({
    where: { host: normalized },
    orderBy: [{ verifiedAt: 'desc' }, { createdAt: 'asc' }],
    take: limit,
    select: {
      userId: true,
      url: true,
      verifiedAt: true,
      user: { select: { handle: true, name: true } },
    },
  });
  return rows.map((row) => ({
    userId: row.userId,
    url: row.url,
    verifiedAt: row.verifiedAt,
    handle: row.user.handle,
    name: row.user.name,
  }));
}
