/**
 * Ledgered admin coin adjustments (s04-06).
 *
 * Every coin an adjustment moves goes through `creditCoins` / `debitCoins` (type
 * ADMIN) inside the same transaction that writes the `CoinAdjustment` row, so the
 * balance, the ledger row and the adjustment either all exist or none do, and
 * `balance == Σ in − Σ out` keeps holding. Nothing here writes
 * `UserProfile.coins` directly.
 *
 * Callers translate the outcome to HTTP; nothing here throws for an expected
 * refusal (a missing member, a short balance, a second reversal).
 */

import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { userChipSelect } from '@/lib/user-display';
import {
  creditCoins,
  debitCoins,
  getBalance,
  reconcileUser,
  InsufficientFundsError,
  type Db,
} from '@/lib/economy/ledger.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { DELETED_USER_ID } from '@/lib/account/deleted-user';
import { isDeletedAccount } from '@/lib/account-lifecycle';
import { recordAdminActionIn } from '@/lib/admin-audit.server';
import { createNotification } from '@/lib/notifications.server';
import {
  ADJUSTMENT_ENTITY,
  ADJUSTMENT_HISTORY_LIMIT,
  adjustmentLedgerKey,
  isAdjustmentReason,
  ledgerNote,
  notificationPreview,
  reversalLedgerKey,
  signedDelta,
  type AdjustmentDirection,
  type AdjustmentReason,
  type AdjustmentSummary,
  type AdjustmentView,
} from '@/lib/economy/adjustments';

type Row = {
  id: string;
  userId: string;
  adminId: string | null;
  delta: number;
  reason: string;
  note: string | null;
  transactionId: string;
  reversesId: string | null;
  reversedById: string | null;
  createdAt: Date;
};

export type AdjustOutcome =
  | { status: 'ok'; adjustment: AdjustmentView; balance: number; replayed: boolean }
  | { status: 'not_found' }
  | { status: 'deleted_account' }
  | { status: 'key_conflict' }
  | { status: 'insufficient'; balance: number };

export type ReverseOutcome =
  | { status: 'ok'; adjustment: AdjustmentView; balance: number }
  | { status: 'not_found' }
  | { status: 'deleted_account' }
  | { status: 'already_reversed' }
  | { status: 'is_reversal' }
  | { status: 'insufficient'; balance: number };

/** Unwinds the transaction for a refusal that is not an `InsufficientFundsError`. */
class Refused extends Error {
  constructor(readonly outcome: 'key_conflict' | 'already_reversed' | 'is_reversal' | 'not_found') {
    super(outcome);
  }
}

async function adminNames(rows: readonly Row[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.adminId).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: userChipSelect });
  return new Map(users.map((u) => [u.id, u.name ?? u.handle ?? 'Admin']));
}

function toView(row: Row, names: Map<string, string>): AdjustmentView {
  return {
    id: row.id,
    delta: row.delta,
    reason: isAdjustmentReason(row.reason) ? row.reason : 'correction',
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    admin: row.adminId ? { id: row.adminId, name: names.get(row.adminId) ?? 'Admin' } : null,
    reversed: row.reversedById !== null,
    isReversal: row.reversesId !== null,
  };
}

/** `ok` when the member exists and is a live account, else the refusal. */
async function checkTarget(userId: string): Promise<'ok' | 'not_found' | 'deleted_account'> {
  if (userId === DELETED_USER_ID) return 'deleted_account';
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, banReason: true } });
  if (!target) return 'not_found';
  return isDeletedAccount(target) ? 'deleted_account' : 'ok';
}

/** Move `delta` coins (sign = direction) through the ledger inside `tx`; returns the ledger row id. */
async function moveCoins(
  tx: Db,
  userId: string,
  delta: number,
  opts: { key: string; reason: AdjustmentReason; adjustmentId: string },
) {
  const ledgerOpts = {
    tx,
    type: 'ADMIN' as const,
    note: ledgerNote(opts.reason),
    entityType: ADJUSTMENT_ENTITY,
    entityId: opts.adjustmentId,
    idempotencyKey: opts.key,
  };
  return delta > 0 ? creditCoins(userId, delta, ledgerOpts) : debitCoins(userId, -delta, ledgerOpts);
}

/** The audit row, written inside the money transaction: if it fails, the movement rolls back. */
function audit(tx: Db, adminId: string, userId: string, row: Row, action: string) {
  return recordAdminActionIn(tx as Prisma.TransactionClient, adminId, action, {
    targetType: 'user',
    targetId: userId,
    detail: `${row.delta > 0 ? '+' : ''}${row.delta} ${row.reason} (adjustment ${row.id})`,
  });
}

/** Best-effort, after commit: the member's notification. */
async function notifyMember(userId: string, row: Row) {
  await createNotification({
    userId,
    type: 'SYSTEM',
    entityType: ADJUSTMENT_ENTITY,
    entityId: row.id,
    preview: notificationPreview(row.delta, isAdjustmentReason(row.reason) ? row.reason : 'correction'),
    link: '/wallet',
  }).catch(() => {});
}

export async function adjustCoins(input: {
  adminId: string;
  userId: string;
  direction: AdjustmentDirection;
  amount: number;
  reason: Exclude<AdjustmentReason, 'reversal'>;
  note?: string | undefined;
  key: string;
}): Promise<AdjustOutcome> {
  const target = await checkTarget(input.userId);
  if (target !== 'ok') return { status: target };

  const delta = signedDelta(input.direction, input.amount);
  const adjustmentId = randomUUID();
  const ledgerKey = adjustmentLedgerKey(input.key);

  let result: { row: Row; balance: number; replayed: boolean };
  try {
    result = await prisma.$transaction(async (tx) => {
      await lockKey(tx, `coin-adjust:${input.userId}`);
      const moved = await moveCoins(tx, input.userId, delta, {
        key: ledgerKey,
        reason: input.reason,
        adjustmentId,
      });
      if (moved.replayed) {
        // The same key already applied: report that adjustment, move and write nothing more.
        const existing = await tx.coinAdjustment.findUnique({ where: { transactionId: moved.transactionId ?? '' } });
        // Same key, different request: refuse rather than answer with an adjustment the admin did not ask for.
        const samePayload =
          !!existing &&
          existing.userId === input.userId &&
          existing.delta === delta &&
          existing.reason === input.reason &&
          (existing.note ?? null) === (input.note ? input.note : null);
        if (!existing || !samePayload) throw new Refused('key_conflict');
        return { row: existing, balance: await getBalance(input.userId, tx), replayed: true };
      }
      const row = await tx.coinAdjustment.create({
        data: {
          id: adjustmentId,
          userId: input.userId,
          adminId: input.adminId,
          delta,
          reason: input.reason,
          note: input.note ? input.note : null,
          transactionId: moved.transactionId ?? '',
        },
      });
      await audit(tx, input.adminId, input.userId, row, 'coins.adjust');
      return { row, balance: await getBalance(input.userId, tx), replayed: false };
    });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      return { status: 'insufficient', balance: await getBalance(input.userId) };
    }
    if (err instanceof Refused) return { status: 'key_conflict' };
    throw err;
  }

  const adjustment = toView(result.row, await adminNames([result.row]));
  if (!result.replayed) await notifyMember(input.userId, result.row);
  return { status: 'ok', adjustment, balance: result.balance, replayed: result.replayed };
}

export async function reverseAdjustment(input: {
  adminId: string;
  userId: string;
  adjustmentId: string;
}): Promise<ReverseOutcome> {
  const target = await checkTarget(input.userId);
  if (target !== 'ok') return { status: target };

  const reversalId = randomUUID();
  let result: { row: Row; balance: number };
  try {
    result = await prisma.$transaction(async (tx) => {
      await lockKey(tx, `coin-adjust:${input.userId}`);
      const original = await tx.coinAdjustment.findUnique({ where: { id: input.adjustmentId } });
      if (!original || original.userId !== input.userId) throw new Refused('not_found');
      if (original.reversesId !== null) throw new Refused('is_reversal');

      // Claim the original: only one caller moves reversedById off null.
      const claimed = await tx.coinAdjustment.updateMany({
        where: { id: original.id, reversedById: null },
        data: { reversedById: reversalId },
      });
      if (claimed.count === 0) throw new Refused('already_reversed');

      // A debit that has since been spent throws InsufficientFundsError, which rolls the claim back too.
      const delta = -original.delta;
      const moved = await moveCoins(tx, input.userId, delta, {
        key: reversalLedgerKey(original.id),
        reason: 'reversal',
        adjustmentId: reversalId,
      });
      if (moved.replayed) throw new Refused('already_reversed');
      const row = await tx.coinAdjustment.create({
        data: {
          id: reversalId,
          userId: input.userId,
          adminId: input.adminId,
          delta,
          reason: 'reversal',
          transactionId: moved.transactionId ?? '',
          reversesId: original.id,
        },
      });
      await audit(tx, input.adminId, input.userId, row, 'coins.reverse');
      return { row, balance: await getBalance(input.userId, tx) };
    });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      return { status: 'insufficient', balance: await getBalance(input.userId) };
    }
    // key_conflict only arises on adjust (the idempotency key); a reversal has none.
    if (err instanceof Refused) return { status: err.outcome === 'key_conflict' ? 'not_found' : err.outcome };
    throw err;
  }

  const adjustment = toView(result.row, await adminNames([result.row]));
  await notifyMember(input.userId, result.row);
  return { status: 'ok', adjustment, balance: result.balance };
}

/** Balance, reconciliation and the member's last adjustments, newest first. */
export async function listAdjustments(userId: string): Promise<AdjustmentSummary> {
  const [rec, rows] = await Promise.all([
    reconcileUser(userId),
    prisma.coinAdjustment.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ADJUSTMENT_HISTORY_LIMIT,
    }),
  ]);
  const names = await adminNames(rows);
  return {
    balance: rec.balance,
    reconciliation: { ledgerBalance: rec.ledgerBalance, drift: rec.drift, ok: rec.ok },
    adjustments: rows.map((r) => toView(r, names)),
  };
}

/**
 * Erasure: adjustments are financial records and stay (like the ledger rows they
 * explain); only the admin's free-text note about the member is cleared.
 */
export function adjustmentErasureOps(userId: string): Prisma.PrismaPromise<unknown>[] {
  return [prisma.coinAdjustment.updateMany({ where: { userId }, data: { note: null } })];
}
