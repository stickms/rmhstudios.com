/**
 * Ledger task names for RMHVibe model calls. Client-safe (no imports).
 *
 * Vibe spend is recorded in the same `AiUsage` ledger as every other AI call
 * but is budgeted separately (`lib/ai/vibe-budget.server.ts`): a build costs
 * cents, the shared monthly allowance is a quarter for the free tier, and one
 * evening of vibes must not lock a member out of compose-assist.
 */
export type VibeLedgerTask =
  | 'vibe'
  | 'vibe-ai';

/** SQL `LIKE` pattern matching every vibe task, so `spentThisMonth` can exclude them. */
export const VIBE_TASK_LIKE =
  'vibe%';

/**
 * `detail.scope` on the two refusals the vibe gates raise. They reuse the existing
 * `AI_BUDGET_EXCEEDED` (402) and `AI_UNAVAILABLE` (503) codes rather than adding
 * vibe-specific ones: `ERROR_CODES` ships on every page's critical path, and the
 * builder and the bot read the scope to word the refusal themselves.
 */
export const VIBE_BUDGET_SCOPE =
  'vibe';
export const VIBE_BUSY_SCOPE =
  'vibe-busy';
