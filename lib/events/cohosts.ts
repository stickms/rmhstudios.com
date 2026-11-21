/**
 * Event co-hosts, the pure half (s05-05): the cap, who may do what, the refusal codes and the shaping of
 * the "Hosted by A with B and C" line. Client-safe: no Prisma, no server imports.
 */

/** At most this many co-hosts (invited and accepted together) per event. */
export const MAX_COHOSTS = 5;

export type CohostStatus = 'invited' | 'accepted';

/** What the viewer is to an event: its host, an accepted co-host, an invited (not yet accepted) co-host, or nothing. */
export type EventViewerRole = 'host' | 'cohost' | 'invited' | null;

/** The roles that may edit the event and look after its guests and waitlist. */
export type ManagerRole = 'host' | 'cohost';

export interface CohostPersonDTO {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}

/** One co-host row as the host (or an accepted co-host, for accepted rows) reads it. */
export interface CohostEntryDTO extends CohostPersonDTO {
  status: CohostStatus;
  invitedAt: string;
}

/** The role of `actorId` on an event whose host is `hostId`, given their co-host row (if any). */
export function resolveRole(
  hostId: string | null,
  actorId: string | null,
  cohostStatus: string | null | undefined,
): EventViewerRole {
  if (!actorId) return null;
  if (hostId && hostId === actorId) return 'host';
  if (cohostStatus === 'accepted') return 'cohost';
  if (cohostStatus === 'invited') return 'invited';
  return null;
}

/** Whether the role may edit the event and use the guest list and waitlist. An invited co-host has no rights. */
export function canManage(role: EventViewerRole): role is ManagerRole {
  return role === 'host' || role === 'cohost';
}

export type CohostRefusal =
  | 'not-found'
  | 'not-host'
  | 'self'
  | 'full'
  | 'blocked'
  | 'banned'
  | 'not-member'
  | 'canceled'
  | 'user-not-found'
  | 'no-invite'
  | 'already-accepted';

const REFUSALS: Record<CohostRefusal, { status: number; message: string }> = {
  'not-found': { status: 404, message: 'Not found' },
  'not-host': { status: 403, message: 'Only the host can do that' },
  self: { status: 400, message: 'You already host this event' },
  full: { status: 409, message: `An event can have at most ${MAX_COHOSTS} co-hosts` },
  blocked: { status: 403, message: "That member can't be invited" },
  banned: { status: 403, message: "That member can't be invited right now" },
  'not-member': { status: 400, message: 'That member has to join the community first' },
  canceled: { status: 409, message: 'This event was canceled' },
  'user-not-found': { status: 404, message: 'Member not found' },
  'no-invite': { status: 404, message: 'There is no invitation to answer' },
  'already-accepted': { status: 409, message: 'You are already a co-host. Step down instead.' },
};

export const refusalStatus = (code: CohostRefusal): number => REFUSALS[code].status;
export const refusalMessage = (code: CohostRefusal): string => REFUSALS[code].message;

/** A person's display name for a sentence: their name, else their @handle, else nothing. */
export function personLabel(p: Pick<CohostPersonDTO, 'name' | 'handle'>): string | null {
  const name = p.name?.trim();
  if (name) return name;
  return p.handle ? `@${p.handle}` : null;
}

/** The labels of the accepted co-hosts for "Hosted by A with B and C", nameless members dropped. */
export function cohostLabels(cohosts: readonly Pick<CohostPersonDTO, 'name' | 'handle'>[]): string[] {
  return cohosts.flatMap((c) => {
    const label = personLabel(c);
    return label ? [label] : [];
  });
}

/** Whether another invitation fits: pending and accepted rows both count towards the cap. */
export const hasRoom = (rows: number): boolean => rows < MAX_COHOSTS;
