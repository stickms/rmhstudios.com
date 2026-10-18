/**
 * S1 "Reconsider" nudge — server-only. Asks the existing moderation triage
 * whether a reply reads as hostile and, if so, lets the API answer once with
 * "review before posting?". Advisory only: it never blocks (the client resends
 * with a confirm flag) and it is skipped entirely when AI is unavailable, slow,
 * or the author has used up their hourly checks.
 */
import { isAiConfigured } from '@/lib/ai/provider.server';
import { triageReport } from '@/lib/ai/triage.server';
import { rateLimit } from '@/lib/rate-limit';

/** A slow provider must not make replying slow: past this we post without a check. */
const CHECK_BUDGET_MS = 2_500;
const MIN_CHARS = 12;
const HOSTILE = new Set(['harassment', 'violence']);

export async function looksHostile(content: string, userId: string): Promise<boolean> {
  if (!isAiConfigured()) return false;
  const text = content.trim();
  if (text.length < MIN_CHARS) return false;
  if (!rateLimit(userId, { limit: 30, windowMs: 3_600_000, prefix: 'reconsider' }).allowed) {
    return false;
  }
  const verdict = await Promise.race([
    triageReport(text, { userId }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), CHECK_BUDGET_MS)),
  ]);
  if (!verdict) return false;
  return (
    (verdict.severity === 'medium' ||
      verdict.severity === 'high' ||
      verdict.severity === 'critical') &&
    verdict.categories.some((c) => HOSTILE.has(c))
  );
}
