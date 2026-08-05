import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { assertAiBudget } from '@/lib/ai/budget.server';
import { reviewBuild, visibilityForVerdict } from '@/lib/builds/review.server';

/**
 * POST /api/builds/review — pre-publish security review for user-authored code (A16).
 *
 * The submit flow calls this with the source it is about to publish and acts on
 * the verdict: `block` refuses, `review` publishes UNLISTED pending a human,
 * `allow` publishes normally (`visibilityForVerdict` is returned so the client
 * does not re-derive that mapping).
 *
 * Three things about the shape of this endpoint are deliberate:
 *
 *  1. **It takes source, not a build id.** There is nothing to authorize
 *     against — the caller is reviewing a string they already hold — so there
 *     is no ownership check to get wrong, and the same endpoint serves a draft
 *     that has no row yet.
 *  2. **It is advisory, not the enforcement point.** A client that skips this
 *     call publishes unreviewed, which is why the server-side publish path must
 *     call `reviewBuild` itself (see the wiring note in the module). This route
 *     exists so an author sees the verdict *before* they hit publish, not so
 *     the browser can be trusted with it.
 *  3. **It is budgeted as well as rate-limited.** The handler reaches a model,
 *     so an authenticated caller could otherwise use it as free inference.
 *     `rateLimit: 'ai'` caps the minute, `assertAiBudget` caps the month, and
 *     the response is a fixed verdict envelope rather than free-form text —
 *     the three together make it a poor tool for anything but its purpose.
 *
 * `reviewBuild` never throws, so the only error paths here are the ones
 * `defineHandler` already owns (401, 429, 400, and the 402 from the budget
 * gate, which is an `AppError` and maps itself).
 */

const schema = z.object({
  /**
   * The full source. 400 KB is well above any hand-written page and well below
   * anything that would make the static sweep expensive; a build past it is a
   * bundle, and bundles are reviewed by the build pipeline, not by paste.
   */
  source: z.string().min(1).max(400_000),
  /** Which surface this came from. Recorded for the admin queue's grouping. */
  kind: z.enum(['user-build', 'vibe-page']).default('user-build'),
  /** Skip the model pass — the static sweep alone. Cheap and instant. */
  staticOnly: z.boolean().optional(),
});

export const Route = createFileRoute('/api/builds/review')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'ai', body: schema },
        async ({ userId, body }) => {
          if (!body.staticOnly) await assertAiBudget(userId);

          const review = await reviewBuild(body.source, {
            userId,
            staticOnly: body.staticOnly,
          });

          return Response.json({
            kind: body.kind,
            verdict: review.verdict,
            visibility: visibilityForVerdict(review.verdict),
            findings: review.findings,
            modelReviewed: review.modelReviewed,
            truncatedForModel: review.truncatedForModel,
          });
        },
      ),
    },
  },
});
