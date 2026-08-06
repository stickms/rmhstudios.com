/**
 * POST /api/kaikai-debt/ask — ask DeepSeek about Kaikai's debt.
 *
 * Server-Sent Events: `{type:'delta',text}` frames as the answer is written,
 * then `{type:'done'}`, or `{type:'error',message}`. Streamed for the reason
 * every AI surface here is — the whole completion is a few seconds, and a joke
 * that arrives after a spinner is not one.
 *
 * Sign-in required. This is a metered model call, and the site's budget system
 * (`lib/ai/budget.server.ts`) only has an account to charge when there is a
 * session — the module says so in as many words: "anonymous callers never reach
 * a metered route". Reading the counter and the whole log stays public; only
 * spending tokens needs a name attached.
 *
 * The model is handed the live figures and answers from those alone; the
 * question itself rides in the `<user-content>` region and is never mixed into
 * the same turn as the facts (see `answerDebtQuestion`).
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler, apiError } from '@/lib/api/handler.server';
import { assertAiBudget } from '@/lib/ai/budget.server';
import { isAppError } from '@/lib/errors/codes';
import { ANNUAL_INTEREST_RATE, projectDebtCents } from '@/lib/kaikai-debt/debt';
import { askDebtSchema } from '@/lib/kaikai-debt/schema';
import { answerDebtQuestion, isAiConfigured } from '@/lib/kaikai-debt/ai.server';
import { getDebtFacts } from '@/lib/kaikai-debt/ledger.server';

export const Route = createFileRoute('/api/kaikai-debt/ask')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: {
            policy: 'ai',
            limit: 10,
            windowMs: 60_000,
            prefix: 'kaikai-debt-ask',
            scope: 'user',
          },
          body: askDebtSchema,
        },
        async ({ userId, body }) => {
          if (!isAiConfigured()) {
            return apiError('The debt desk is closed right now. Try again later.', 503);
          }
          await assertAiBudget(userId);

          const { totals, recent, largest } = await getDebtFacts();
          const now = Date.now();

          const generator = answerDebtQuestion(
            body.question,
            {
              totalCents: projectDebtCents(totals.basisCents, now),
              principalCents: totals.principalCents,
              memberPrincipalCents: totals.memberPrincipalCents,
              entryCount: totals.entryCount,
              memberEntryCount: totals.memberEntryCount,
              contributorCount: totals.contributorCount,
              annualRatePercent: Math.round(ANNUAL_INTEREST_RATE * 100),
              recent: recent.map((r) => ({
                item: r.item,
                note: r.note,
                amountCents: r.amountCents,
                addedBy: r.addedBy?.handle ?? r.addedBy?.name ?? null,
              })),
              largest: largest.map((r) => ({ item: r.item, amountCents: r.amountCents })),
            },
            userId,
          );

          const encoder = new TextEncoder();
          // Tracks whether the reader is still there. A closed controller throws
          // on enqueue, and the generator's `finally` still meters what was
          // produced — the tokens were billed whether or not anyone read them.
          let open = true;
          const stream = new ReadableStream({
            async start(controller) {
              const send = (data: unknown) => {
                if (!open) return;
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                } catch {
                  open = false;
                }
              };
              try {
                for await (const text of generator) send({ type: 'delta', text });
                send({ type: 'done' });
              } catch (err) {
                // The stream has already committed a 200, so a failure can only
                // be reported inside the body. Named errors carry a safe
                // message; anything else gets a generic one, same as the
                // wrapper's 500 path — a Prisma or provider message must not
                // reach the client.
                send({
                  type: 'error',
                  message: isAppError(err)
                    ? err.message
                    : 'The debt desk lost its train of thought. Try again.',
                });
              } finally {
                open = false;
                try {
                  controller.close();
                } catch {
                  // Already closed by an aborted request — nothing to do.
                }
              }
            },
            cancel() {
              open = false;
            },
          });

          return new Response(stream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache, no-transform',
              Connection: 'keep-alive',
              // Apache/Cloudflare will otherwise buffer the whole response and
              // deliver it in one lump, which is a spinner with extra steps.
              'X-Accel-Buffering': 'no',
            },
          });
        },
      ),
    },
  },
});
