/**
 * Prisma filter for `CommunityEvent`: events outside private communities, or in
 * ones `viewerId` currently belongs to. Shared by every surface that pushes event
 * titles/venues to a user off an RSVP (ICS feed, digest, listings), because an
 * RSVP outlives membership.
 */
export function eventCommunityVisibleWhere(viewerId: string | null) {
  return {
    OR: [
      { communityId: null },
      { community: { isPrivate: false } },
      ...(viewerId ? [{ community: { members: { some: { userId: viewerId } } } }] : []),
    ],
  };
}
