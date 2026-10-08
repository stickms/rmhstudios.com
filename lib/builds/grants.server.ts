/**
 * Build consent (B1) — recording what a member gave a build, and checking it.
 * Server-only.
 *
 * Every capability call a build makes goes through {@link hasCapability}. It
 * is the entire permission model at runtime, which is why it is short: a
 * check with branches is a check somebody eventually reads wrong.
 */

import { prisma } from '@/lib/prisma.server';
import { AppError } from '@/lib/errors/codes';
import {
  consentList,
  needsHumanReview,
  validateManifest,
  manifestSchema,
  type BuildManifest,
  type Capability,
} from '@/lib/builds/manifest';

/** Record a version's manifest at publish time. */
export async function recordManifest(
  versionId: string,
  buildSlug: string,
  raw: unknown,
): Promise<BuildManifest> {
  const problems = validateManifest(raw, buildSlug);
  if (problems.length > 0) {
    throw new AppError('INVALID_INPUT', { problems: problems.join(',') });
  }
  const manifest = manifestSchema.parse(raw);

  await prisma.buildManifestRecord.upsert({
    where: { versionId },
    create: { versionId, manifest, needsReview: needsHumanReview(manifest) },
    update: { manifest, needsReview: needsHumanReview(manifest), reviewedAt: null, reviewedBy: null },
  });
  return manifest;
}

/**
 * What a member is being asked to approve, for one version.
 *
 * Returns null when the version has no manifest — an older build, published
 * before B1 — which the shell renders as "this build cannot use the platform",
 * because that is exactly what it means.
 */
export async function consentFor(versionId: string): Promise<{
  manifest: BuildManifest;
  asks: Capability[];
  blocked: boolean;
} | null> {
  const row = await prisma.buildManifestRecord.findUnique({
    where: { versionId },
    select: { manifest: true, needsReview: true, reviewedAt: true },
  });
  if (!row) return null;

  const parsed = manifestSchema.safeParse(row.manifest);
  if (!parsed.success) return null;

  return {
    manifest: parsed.data,
    asks: consentList(parsed.data),
    // A build wanting to spend coins does not run at all until a human has
    // looked at it. Blocking here rather than at the capability call is
    // deliberate: the member should not be asked to consent to something the
    // platform has not itself approved.
    blocked: row.needsReview && row.reviewedAt === null,
  };
}

/**
 * Record a member's decision.
 *
 * `granted` may be a SUBSET of what was asked — declining one capability and
 * keeping the rest is the normal case, not an error, and a consent screen
 * that is all-or-nothing is a consent screen people click through.
 *
 * Anything not in the manifest is dropped rather than rejected: a client
 * sending a capability the build never asked for is confused, not hostile, and
 * silently narrowing to the manifest is both safe and the obvious intent.
 */
export async function grant(
  userId: string,
  buildId: string,
  versionId: string,
  granted: Capability[],
  coinCap: number,
): Promise<Capability[]> {
  const consent = await consentFor(versionId);
  if (!consent) throw new AppError('NOT_FOUND');
  if (consent.blocked) throw new AppError('FORBIDDEN', { reason: 'awaiting-review' });

  const asked = new Set(consent.manifest.capabilities);
  const effective = granted.filter((c) => asked.has(c));
  const cap = Math.max(0, Math.min(Math.trunc(coinCap) || 0, 100_000));

  await prisma.buildGrant.upsert({
    where: { userId_versionId: { userId, versionId } },
    create: { userId, buildId, versionId, capabilities: effective, coinCap: cap },
    update: { capabilities: effective, coinCap: cap, revokedAt: null },
  });
  return effective;
}

/** Take it all back. The member's half of the contract. */
export async function revoke(userId: string, versionId: string): Promise<boolean> {
  const { count } = await prisma.buildGrant.updateMany({
    where: { userId, versionId, revokedAt: null },
    data: { revokedAt: new Date(), capabilities: [] },
  });
  return count > 0;
}

/**
 * May this build do this thing for this member, right now?
 *
 * The one runtime check. Three ways to be false and they are all the same
 * answer — no grant, a revoked grant, or a grant that never included this —
 * because distinguishing them for the CALLER would tell a build which
 * capabilities a member has declined elsewhere.
 */
export async function hasCapability(
  userId: string,
  versionId: string,
  capability: Capability,
): Promise<boolean> {
  const row = await prisma.buildGrant.findUnique({
    where: { userId_versionId: { userId, versionId } },
    select: { capabilities: true, revokedAt: true },
  });
  if (!row || row.revokedAt !== null) return false;
  return Array.isArray(row.capabilities) && row.capabilities.includes(capability);
}

/**
 * The member's own coin ceiling for this build, per session.
 *
 * Zero when there is no grant, which means a build with `coins:spend` and no
 * grant can ask for nothing — the safe direction, and the one that makes the
 * capability meaningless until somebody deliberately sets a number.
 */
export async function coinCapFor(userId: string, versionId: string): Promise<number> {
  const row = await prisma.buildGrant.findUnique({
    where: { userId_versionId: { userId, versionId } },
    select: { coinCap: true, revokedAt: true },
  });
  if (!row || row.revokedAt !== null) return 0;
  return row.coinCap;
}

/** Everything this member has granted, for a "connected builds" page. */
export async function grantsForUser(userId: string) {
  return prisma.buildGrant.findMany({
    where: { userId, revokedAt: null },
    orderBy: { grantedAt: 'desc' },
    take: 100,
    select: {
      versionId: true,
      capabilities: true,
      coinCap: true,
      grantedAt: true,
      build: { select: { id: true, slug: true, title: true } },
    },
  });
}
