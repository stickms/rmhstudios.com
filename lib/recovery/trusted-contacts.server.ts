/**
 * Trusted contacts (I3 §3) — nominate three people who can vouch that you are
 * you when every other route back into the account is gone.
 *
 * A nomination is a two-sided relationship: it does nothing until the nominee
 * accepts. An unconfirmed nomination cannot vouch, so nobody can build a quorum
 * out of three strangers who have never heard of them.
 */

import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { userDisplaySelect, resolveUser, type ResolvedUser } from '@/lib/user-display';
import { MAX_TRUSTED_CONTACTS } from '@/lib/recovery/policy';

export interface TrustedContactDTO {
  id: string;
  confirmedAt: string | null;
  createdAt: string;
  user: ResolvedUser;
}

export type NominateFailure = 'unknown-account' | 'self' | 'limit' | 'duplicate';

export type NominateResult =
  | { ok: true; contact: TrustedContactDTO }
  | { ok: false; reason: NominateFailure; message: string };

/** People this user nominated. */
export async function listTrustedContacts(userId: string): Promise<TrustedContactDTO[]> {
  const rows = await prisma.trustedContact.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: { contact: { select: userDisplaySelect } },
  });
  return rows.map((row) => ({
    id: row.id,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    user: resolveUser(row.contact),
  }));
}

/** Accounts that nominated this user (their side of the same relationship). */
export async function listTrustedFor(userId: string): Promise<TrustedContactDTO[]> {
  const rows = await prisma.trustedContact.findMany({
    where: { contactId: userId },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: userDisplaySelect } },
  });
  return rows.map((row) => ({
    id: row.id,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    user: resolveUser(row.user),
  }));
}

/** Nominate an account by handle. The nominee must accept before it counts. */
export async function nominateTrustedContact(
  userId: string,
  handle: string,
): Promise<NominateResult> {
  const contact = await prisma.user.findUnique({
    where: { handle: handle.trim().toLowerCase() },
    select: { id: true },
  });
  if (!contact) {
    return { ok: false, reason: 'unknown-account', message: 'No account with that handle' };
  }
  if (contact.id === userId) {
    return { ok: false, reason: 'self', message: 'You cannot nominate yourself' };
  }

  const existingCount = await prisma.trustedContact.count({ where: { userId } });
  if (existingCount >= MAX_TRUSTED_CONTACTS) {
    return {
      ok: false,
      reason: 'limit',
      message: `You can nominate at most ${MAX_TRUSTED_CONTACTS} trusted contacts`,
    };
  }

  const duplicate = await prisma.trustedContact.findUnique({
    where: { userId_contactId: { userId, contactId: contact.id } },
    select: { id: true },
  });
  if (duplicate) {
    return { ok: false, reason: 'duplicate', message: 'That person is already a trusted contact' };
  }

  const row = await prisma.trustedContact.create({
    data: { userId, contactId: contact.id },
    include: { contact: { select: userDisplaySelect } },
  });

  void createNotification({
    userId: contact.id,
    actorId: userId,
    type: 'SYSTEM',
    entityType: 'recovery-contact',
    entityId: row.id,
    preview: 'asked you to be a trusted contact for account recovery',
    link: '/settings/security',
  });

  return {
    ok: true,
    contact: {
      id: row.id,
      confirmedAt: null,
      createdAt: row.createdAt.toISOString(),
      user: resolveUser(row.contact),
    },
  };
}

/**
 * Accept a nomination. Only the nominee can — an account cannot confirm its own
 * contacts, which would make the whole confirmation step decorative.
 */
export async function confirmTrustedContact(contactUserId: string, id: string): Promise<boolean> {
  const { count } = await prisma.trustedContact.updateMany({
    where: { id, contactId: contactUserId, confirmedAt: null },
    data: { confirmedAt: new Date() },
  });
  if (count === 1) {
    const row = await prisma.trustedContact.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (row) {
      void createNotification({
        userId: row.userId,
        actorId: contactUserId,
        type: 'SYSTEM',
        entityType: 'recovery-contact',
        entityId: id,
        preview: 'accepted being a trusted contact for your account',
        link: '/settings/security',
      });
    }
  }
  return count === 1;
}

/**
 * Remove a nomination. Either side may: the owner because they changed their
 * mind, the nominee because being someone's recovery quorum is a
 * responsibility nobody can be conscripted into.
 */
export async function removeTrustedContact(actingUserId: string, id: string): Promise<boolean> {
  const { count } = await prisma.trustedContact.deleteMany({
    where: { id, OR: [{ userId: actingUserId }, { contactId: actingUserId }] },
  });
  return count > 0;
}

/** Confirmed contacts only — the set a quorum is drawn from. */
export async function confirmedContactIds(userId: string): Promise<string[]> {
  const rows = await prisma.trustedContact.findMany({
    where: { userId, confirmedAt: { not: null } },
    select: { contactId: true },
  });
  return rows.map((row) => row.contactId);
}
