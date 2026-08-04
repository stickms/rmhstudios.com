/**
 * Recovery codes (I3 §1) — ten single-use codes, shown exactly once.
 *
 * A recovery code is a password that never expires and that its owner keeps in
 * a screenshot, so it is stored the same way a password is: through Better
 * Auth's own hasher (`better-auth/crypto` → `@better-auth/utils/password`,
 * scrypt on Node). That is deliberate rather than convenient — inventing a
 * second, weaker hash for the credential that bypasses the first one is how
 * this feature turns into the way in.
 *
 * Nothing here logs, returns, or stores a plaintext code after generation.
 * `generateRecoveryCodes` is the only function that has ever seen one.
 */

import { randomInt } from 'node:crypto';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { prisma } from '@/lib/prisma.server';
import {
  RECOVERY_CODE_ALPHABET,
  RECOVERY_CODE_COUNT,
  RECOVERY_CODE_LENGTH,
  formatRecoveryCode,
  isWellFormedRecoveryCode,
  normalizeRecoveryCode,
} from '@/lib/recovery/policy';

/** One code's worth of CSPRNG output, unbiased (`randomInt`, not `% length`). */
function randomCode(): string {
  let out = '';
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
    out += RECOVERY_CODE_ALPHABET[randomInt(RECOVERY_CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Replace a user's recovery codes and return the ten plaintexts **once**.
 *
 * Regenerating destroys the previous set, including unused codes: a user asking
 * for new codes is telling us the old ones may be compromised, and leaving them
 * live would mean the "regenerate" button did nothing for the case it exists
 * for.
 */
export async function generateRecoveryCodes(userId: string): Promise<string[]> {
  const plaintexts = Array.from({ length: RECOVERY_CODE_COUNT }, randomCode);
  const hashes = await Promise.all(plaintexts.map((code) => hashPassword(code)));

  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({
      data: hashes.map((codeHash) => ({ userId, codeHash })),
    }),
  ]);

  return plaintexts.map(formatRecoveryCode);
}

export interface RecoveryCodeStatus {
  /** Codes that have never been used. */
  remaining: number;
  /** Codes issued in the current set. */
  total: number;
  generatedAt: string | null;
}

/** How many codes are left. Never the codes themselves. */
export async function getRecoveryCodeStatus(userId: string): Promise<RecoveryCodeStatus> {
  const rows = await prisma.recoveryCode.findMany({
    where: { userId },
    select: { usedAt: true, createdAt: true },
  });
  const generatedAt = rows.reduce<Date | null>(
    (newest, row) => (!newest || row.createdAt > newest ? row.createdAt : newest),
    null,
  );
  return {
    remaining: rows.filter((row) => row.usedAt === null).length,
    total: rows.length,
    generatedAt: generatedAt ? generatedAt.toISOString() : null,
  };
}

/**
 * Redeem a code. Returns true when it matched an unused code, which is then
 * burned.
 *
 * Every unused hash is checked even after a match, so the work done — and
 * therefore the time taken — does not depend on *which* code was supplied.
 * Burning happens through a conditional `updateMany` on `usedAt: null`, so two
 * simultaneous redemptions of the same code cannot both win.
 */
export async function redeemRecoveryCode(userId: string, supplied: string): Promise<boolean> {
  const candidate = normalizeRecoveryCode(supplied);
  if (!isWellFormedRecoveryCode(candidate)) return false;

  const rows = await prisma.recoveryCode.findMany({
    where: { userId, usedAt: null },
    select: { id: true, codeHash: true },
  });

  let matchedId: string | null = null;
  for (const row of rows) {
    const ok = await verifyPassword({ hash: row.codeHash, password: candidate }).catch(() => false);
    if (ok && !matchedId) matchedId = row.id;
  }
  if (!matchedId) return false;

  const { count } = await prisma.recoveryCode.updateMany({
    where: { id: matchedId, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1;
}
