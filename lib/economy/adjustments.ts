/**
 * Ledgered admin coin adjustments (s04-06) — pure and client-safe: the fixed
 * reasons, the limits, the sign handling and the confirmation threshold the
 * dialog and the server both read, so the two can never disagree.
 */

/** Reasons an admin can pick. `reversal` is written only by reversing an adjustment. */
export const ADJUSTMENT_REASONS = [
  'correction',
  'goodwill',
  'compensation',
  'exploit_clawback',
] as const;

export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number] | 'reversal';

/** Every reason a stored row can carry. */
export const ALL_ADJUSTMENT_REASONS: readonly AdjustmentReason[] = [...ADJUSTMENT_REASONS, 'reversal'];

export const ADJUSTMENT_MIN = 1;
export const ADJUSTMENT_MAX = 1_000_000;
/** An adjustment of more than this many coins needs the amount typed again. */
export const ADJUSTMENT_CONFIRM_ABOVE = 100_000;
export const ADJUSTMENT_NOTE_MAX = 280;
/** Adjustments shown in the dialog's history. */
export const ADJUSTMENT_HISTORY_LIMIT = 20;
/** The reason that makes a note mandatory. */
export const NOTE_REQUIRED_REASON: AdjustmentReason = 'correction';

export type AdjustmentDirection = 'add' | 'remove';

export function isAdjustmentReason(value: string): value is AdjustmentReason {
  return (ALL_ADJUSTMENT_REASONS as readonly string[]).includes(value);
}

/** `+1` for a credit, `-1` for a debit. */
export function directionSign(direction: AdjustmentDirection): 1 | -1 {
  return direction === 'add' ? 1 : -1;
}

/** The signed change an admin's input stands for. */
export function signedDelta(direction: AdjustmentDirection, amount: number): number {
  return directionSign(direction) * amount;
}

/** True when the amount is a whole number inside the allowed range. */
export function isValidAmount(amount: number): boolean {
  return Number.isInteger(amount) && amount >= ADJUSTMENT_MIN && amount <= ADJUSTMENT_MAX;
}

/** True when the admin must type the amount again before it applies. */
export function requiresConfirmation(amount: number): boolean {
  return amount > ADJUSTMENT_CONFIRM_ABOVE;
}

/** True when the re-typed amount satisfies the confirmation rule for `amount`. */
export function confirmationSatisfied(amount: number, confirmAmount: number | undefined): boolean {
  return !requiresConfirmation(amount) || confirmAmount === amount;
}

/** True when the note is long enough for the reason (a correction must say what was corrected). */
export function noteSatisfied(reason: AdjustmentReason, note: string | undefined): boolean {
  return reason !== NOTE_REQUIRED_REASON || (note ?? '').trim().length > 0;
}

/** The text of the ledger row the member sees on the statement ("Adjustment · goodwill"). */
export function ledgerNote(reason: AdjustmentReason): string {
  return `Adjustment · ${reason.replace('_', ' ')}`;
}

/** The notification the member receives; no admin name, no admin note. */
export function notificationPreview(delta: number, reason: AdjustmentReason): string {
  const verb = delta >= 0 ? 'added' : 'removed';
  return `RMH Studios ${verb} ${Math.abs(delta).toLocaleString('en-US')} coins: ${reason.replace('_', ' ')}`;
}

/** The idempotency key the ledger row carries for a client-supplied key. */
export function adjustmentLedgerKey(clientKey: string): string {
  return `coin-adjustment:${clientKey}`;
}

/** The idempotency key of the ledger row a reversal writes (one reversal per adjustment). */
export function reversalLedgerKey(adjustmentId: string): string {
  return `coin-adjustment-reversal:${adjustmentId}`;
}

/** The ledger `entityType` that links a ledger row to its adjustment. */
export const ADJUSTMENT_ENTITY = 'coin_adjustment';

export interface AdjustmentView {
  id: string;
  /** Signed coins: positive credited the member. */
  delta: number;
  reason: AdjustmentReason;
  note: string | null;
  createdAt: string;
  admin: { id: string; name: string } | null;
  /** This adjustment was undone by another one. */
  reversed: boolean;
  /** This adjustment is itself a reversal (it cannot be reversed again). */
  isReversal: boolean;
}

export interface AdjustmentSummary {
  balance: number;
  /** `drift` 0 means the ledger explains the balance. */
  reconciliation: { ledgerBalance: number; drift: number; ok: boolean };
  adjustments: AdjustmentView[];
}
