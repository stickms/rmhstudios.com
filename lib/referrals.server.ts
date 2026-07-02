/**
 * Referral program.
 *
 * Flow: /ref/$code stores the code client-side → after the invitee's account
 * exists, the client calls /api/referrals/claim which attributes the signup
 * (a Referral row) → the mutual coin reward fires only when the invitee
 * unlocks their FIRST achievement (see maybeRewardReferral, called from the
 * achievements engine), so farmed empty accounts never pay out.
 */

import { customAlphabet } from 'nanoid';
import { prisma } from '@/lib/prisma.server';
import { awardCoins } from '@/lib/coins.server';
import { createNotification } from '@/lib/notifications.server';

/** Coins each side receives when a referral matures. */
export const REFERRAL_REWARD = 50;

/** How long after signup a referral can still be claimed. */
const CLAIM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Unambiguous lowercase alphabet (no 0/o/1/l) for readable invite links.
const generateCode = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 8);

/** Get the user's shareable referral code, generating one on first request. */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (user?.referralCode) return user.referralCode;

  // Retry on the (unlikely) unique collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCode();
    try {
      await prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
      return code;
    } catch {
      // collision — try another code
    }
  }
  throw new Error('Could not allocate a referral code');
}

export type ClaimResult = 'claimed' | 'invalid-code' | 'own-code' | 'already-claimed' | 'too-old';

/** Attribute a new account to a referral code. Idempotent per referee. */
export async function claimReferral(refereeId: string, code: string): Promise<ClaimResult> {
  const referrer = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { id: true },
  });
  if (!referrer) return 'invalid-code';
  if (referrer.id === refereeId) return 'own-code';

  const referee = await prisma.user.findUnique({
    where: { id: refereeId },
    select: { createdAt: true },
  });
  if (!referee) return 'invalid-code';
  if (Date.now() - referee.createdAt.getTime() > CLAIM_WINDOW_MS) return 'too-old';

  try {
    await prisma.referral.create({
      data: { referrerId: referrer.id, refereeId, code },
    });
    return 'claimed';
  } catch {
    // Unique(refereeId) violation — this account is already attributed.
    return 'already-claimed';
  }
}

/**
 * Pay out a pending referral for this user, if any. Called after each
 * achievement unlock; the `rewardedAt` guard makes it fire exactly once.
 * Best-effort — never throws into the achievement pipeline.
 */
export async function maybeRewardReferral(refereeId: string): Promise<void> {
  try {
    // Atomically claim the pending referral so concurrent unlocks can't double-pay.
    const { count } = await prisma.referral.updateMany({
      where: { refereeId, rewardedAt: null },
      data: { rewardedAt: new Date() },
    });
    if (count === 0) return;

    const referral = await prisma.referral.findUnique({
      where: { refereeId },
      select: {
        referrerId: true,
        referee: { select: { name: true, handle: true } },
        referrer: { select: { name: true, handle: true } },
      },
    });
    if (!referral) return;

    await Promise.all([
      awardCoins(referral.referrerId, REFERRAL_REWARD, {
        note: 'Referral reward — a friend you invited is active',
        entityType: 'referral',
        entityId: refereeId,
      }),
      awardCoins(refereeId, REFERRAL_REWARD, {
        note: 'Referral bonus — welcome to RMH Studios',
        entityType: 'referral',
        entityId: referral.referrerId,
      }),
    ]);

    const refereeName = referral.referee.name || referral.referee.handle || 'A friend you invited';
    await Promise.all([
      createNotification({
        userId: referral.referrerId,
        type: 'SYSTEM',
        entityType: 'coins',
        entityId: refereeId,
        preview: `${refereeName} is now active — you both earned ${REFERRAL_REWARD} coins!`,
        link: '/wallet',
      }),
      createNotification({
        userId: refereeId,
        type: 'SYSTEM',
        entityType: 'coins',
        entityId: referral.referrerId,
        preview: `Referral bonus: +${REFERRAL_REWARD} coins for joining through an invite!`,
        link: '/wallet',
      }),
    ]);
  } catch (err) {
    console.error('[referrals] reward failed:', err);
  }
}
