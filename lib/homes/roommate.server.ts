import { prisma } from '@/lib/prisma.server';
import { compatibility, type RoommateProfile } from './roommate';

const pick = { sleep: true, guests: true, cleanliness: true, noise: true, pets: true } as const;

export async function getRoommateProfile(userId: string): Promise<RoommateProfile | null> {
  const row = await prisma.homeRoommateProfile.findUnique({ where: { userId }, select: pick });
  return row as RoommateProfile | null;
}

export async function saveRoommateProfile(userId: string, profile: RoommateProfile) {
  await prisma.homeRoommateProfile.upsert({
    where: { userId },
    create: { userId, ...profile },
    update: profile,
  });
}

export type MatchResult =
  | { status: 'match'; percent: number }
  | { status: 'no-quiz' }
  | { status: 'poster-no-quiz' }
  | { status: 'not-applicable' };

/** Viewer-vs-poster compatibility for a roommate-wanted listing; never returns answers. */
export async function matchForListing(viewerId: string, listingId: string): Promise<MatchResult> {
  const listing = await prisma.homeListing.findUnique({
    where: { id: listingId },
    select: { authorId: true, listingType: true, propertyType: true, status: true },
  });
  if (
    !listing?.authorId ||
    listing.authorId === viewerId ||
    listing.listingType !== 'RENT' ||
    listing.propertyType !== 'ROOM' ||
    listing.status !== 'ACTIVE'
  ) {
    return { status: 'not-applicable' };
  }
  const [mine, theirs] = await Promise.all([
    getRoommateProfile(viewerId),
    getRoommateProfile(listing.authorId),
  ]);
  if (!mine) return { status: 'no-quiz' };
  if (!theirs) return { status: 'poster-no-quiz' };
  return { status: 'match', percent: compatibility(mine, theirs) };
}
