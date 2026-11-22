/**
 * Community ownership handover (s04-17), pure part: the life of an offer, who may offer, accept and
 * assign, and the DTOs the endpoints return. No database here; `handover.server.ts` loads the facts
 * these functions decide on and runs the transactions.
 */
import { isDeletedAccount } from '@/lib/account-lifecycle';

export type HandoverRole = 'MEMBER' | 'MOD' | 'ADMIN';

/** An offer lapses this long after it was made (read as expired, no job). */
export const HANDOVER_TTL_DAYS = 7;
const DAY_MS = 86_400_000;

/** Stored `status` values. `expired` is never stored: it is what a pending offer past `expiresAt` reads as. */
export const HANDOVER_STATUSES = ['pending', 'accepted', 'declined', 'cancelled'] as const;
export type HandoverStatus = (typeof HANDOVER_STATUSES)[number];
export type HandoverState = HandoverStatus | 'expired';

/** When an offer made at `now` lapses. */
export function handoverExpiry(now: Date): Date {
  return new Date(now.getTime() + HANDOVER_TTL_DAYS * DAY_MS);
}

/** What an offer reads as right now. */
export function handoverState(offer: { status: string; expiresAt: Date }, now: Date): HandoverState {
  if (offer.status !== 'pending') {
    return (HANDOVER_STATUSES as readonly string[]).includes(offer.status)
      ? (offer.status as HandoverStatus)
      : 'cancelled';
  }
  return offer.expiresAt.getTime() <= now.getTime() ? 'expired' : 'pending';
}

/** Whole days left on an offer, rounded up, never below zero ("expires in 6 days"). */
export function handoverDaysLeft(expiresAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS));
}

/** Why a request was refused. The endpoints map each code to a status and a plain message. */
export type HandoverRefusal =
  | 'not-owner'
  | 'self'
  | 'not-moderator'
  | 'recipient-banned'
  | 'blocked'
  | 'pending-exists'
  | 'no-offer'
  | 'not-recipient'
  | 'expired'
  | 'owner-changed'
  | 'owner-active'
  | 'already-owner';

export interface BanFacts {
  bannedUntil: Date | null;
  banReason: string | null;
}

/** True while a ban (a deletion tombstone's included) is in force. */
export function isBanned(user: Pick<BanFacts, 'bannedUntil'>, now: Date): boolean {
  return !!user.bannedUntil && user.bannedUntil.getTime() > now.getTime();
}

/**
 * Can this moderator be handed the community? A recipient is an existing moderator who is not the
 * owner, is not banned and is not blocked either way with the owner.
 */
export function checkRecipient(input: {
  ownerId: string;
  toId: string;
  toRole: HandoverRole | null;
  toBanned: boolean;
  blocked: boolean;
}): HandoverRefusal | null {
  if (input.toId === input.ownerId) return 'self';
  if (input.toRole !== 'MOD') return 'not-moderator';
  if (input.toBanned) return 'recipient-banned';
  if (input.blocked) return 'blocked';
  return null;
}

/** Only the community's current owner (`createdById`) offers or cancels. */
export function checkOwner(actorId: string, createdById: string): HandoverRefusal | null {
  return actorId === createdById ? null : 'not-owner';
}

/**
 * Accept or decline: the offer must be pending and unexpired, still from the current owner, and
 * addressed to the person responding.
 */
export function checkResponder(input: {
  userId: string;
  offer: { toId: string; fromId: string; status: string; expiresAt: Date } | null;
  createdById: string;
  now: Date;
}): HandoverRefusal | null {
  const { offer } = input;
  if (!offer) return 'no-offer';
  if (offer.toId !== input.userId) return 'not-recipient';
  const state = handoverState(offer, input.now);
  if (state === 'expired') return 'expired';
  if (state !== 'pending') return 'no-offer';
  if (offer.fromId !== input.createdById) return 'owner-changed';
  return null;
}

export type OrphanReason = 'deleted' | 'banned';

/**
 * Why a community's owner is gone, or null when they are an ordinary, active account. A deletion
 * tombstone carries the sentinel ban reason; anyone else is orphaned only while a ban is in force.
 */
export function orphanReason(owner: BanFacts & { id?: string }, now: Date): OrphanReason | null {
  if (isDeletedAccount(owner)) return 'deleted';
  return isBanned(owner, now) ? 'banned' : null;
}

/** A site admin assigns only when the owner is gone, to a moderator who is not banned. */
export function checkAdminAssign(input: {
  ownerOrphan: OrphanReason | null;
  toId: string;
  ownerId: string;
  toRole: HandoverRole | null;
  toBanned: boolean;
}): HandoverRefusal | null {
  if (!input.ownerOrphan) return 'owner-active';
  if (input.toId === input.ownerId) return 'already-owner';
  if (input.toRole !== 'MOD') return 'not-moderator';
  if (input.toBanned) return 'recipient-banned';
  return null;
}

/** HTTP status for a refusal. */
export function refusalStatus(code: HandoverRefusal): number {
  switch (code) {
    case 'not-owner':
    case 'not-recipient':
      return 403;
    case 'no-offer':
      return 404;
    case 'pending-exists':
    case 'owner-changed':
    case 'expired':
    case 'owner-active':
      return 409;
    default:
      return 400;
  }
}

/** The plain message for a refusal (English; the client words its own copy from the code). */
export function refusalMessage(code: HandoverRefusal): string {
  switch (code) {
    case 'not-owner':
      return 'Only the owner can do that';
    case 'self':
      return 'You already own this community';
    case 'not-moderator':
      return 'Ownership can only go to a moderator';
    case 'recipient-banned':
    case 'blocked':
      return "That member can't receive ownership";
    case 'pending-exists':
      return 'There is already a pending offer';
    case 'no-offer':
      return 'There is no pending offer';
    case 'not-recipient':
      return 'That offer is not addressed to you';
    case 'expired':
      return 'That offer has expired';
    case 'owner-changed':
      return 'The community changed owner';
    case 'owner-active':
      return "The owner's account is active";
    case 'already-owner':
      return 'That member already owns the community';
  }
}

export interface HandoverUserDTO {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}

/** One offer as the owner or the offered moderator sees it. */
export interface HandoverOfferDTO {
  id: string;
  from: HandoverUserDTO;
  to: HandoverUserDTO;
  state: HandoverState;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
}

/** What `GET /handover` returns for the signed-in viewer. */
export interface HandoverStatusDTO {
  /** `owner` sees the offer and the moderators to choose from; `recipient` sees the offer addressed to them; anyone else sees nothing. */
  viewer: 'owner' | 'recipient' | 'other';
  /** The offer that matters to this viewer: the pending one, or an expired one (so the owner can read "Expired"). */
  offer: HandoverOfferDTO | null;
  /** Owner only: moderators who can be offered the community. */
  candidates: HandoverUserDTO[];
}

/** A community a user created, as the admin sees it. */
export interface OwnedCommunityDTO {
  id: string;
  slug: string;
  name: string;
  orphan: OrphanReason | null;
  moderators: HandoverUserDTO[];
}
