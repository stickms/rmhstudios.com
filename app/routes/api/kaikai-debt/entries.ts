/**
 * POST /api/kaikai-debt/entries — add a line to Kaikai's tab.
 *
 * Sign-in required, and that is the feature rather than a restriction: the
 * ledger's whole claim to being a ledger is that every member line says who put
 * it there. An anonymous debt is graffiti. The client checks the session first
 * and shows a sign-in prompt, so the 401 here is the backstop, not the UX.
 *
 * Order: session → per-user rate limit → monthly AI budget → zod → appraisal →
 * insert → broadcast. The budget check sits before the model call because the
 * point of a budget is to not spend the money.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler, apiError } from '@/lib/api/handler.server';
import { assertAiBudget } from '@/lib/ai/budget.server';
import { addDebtSchema } from '@/lib/kaikai-debt/schema';
import { appraiseDebt, isAiConfigured } from '@/lib/kaikai-debt/ai.server';
import { addEntry, getTotals } from '@/lib/kaikai-debt/ledger.server';

export const Route = createFileRoute('/api/kaikai-debt/entries')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: {
            policy: 'ai',
            limit: 6,
            windowMs: 60_000,
            prefix: 'kaikai-debt-add',
            scope: 'user',
          },
          body: addDebtSchema,
          // The submit button can be double-fired, and the offline outbox
          // replays writes by design. Without this, one burrito becomes two.
          idempotent: true,
        },
        async ({ userId, body }) => {
          if (!isAiConfigured()) {
            return apiError('The appraiser is off duty right now. Try again later.', 503);
          }
          await assertAiBudget(userId);

          const appraisal = await appraiseDebt(body.claim, userId);
          if (!appraisal.ok) {
            // 422, not 400: the request was well-formed and the appraiser simply
            // declined it. The client shows `reason` verbatim, so it has to be
            // the model's sentence and not a generic validation string.
            return Response.json({ error: appraisal.reason, declined: true }, { status: 422 });
          }

          const entry = await addEntry({
            userId,
            claim: body.claim,
            item: appraisal.item,
            note: appraisal.note,
            category: appraisal.category,
            amountCents: appraisal.amountCents,
          });

          const totals = await getTotals();
          return Response.json({
            entry,
            basisCents: totals.basisCents,
            principalCents: totals.principalCents,
            memberPrincipalCents: totals.memberPrincipalCents,
            entryCount: totals.entryCount,
            memberEntryCount: totals.memberEntryCount,
            contributorCount: totals.contributorCount,
          });
        },
      ),
    },
  },
});
