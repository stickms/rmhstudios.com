import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { createOwnJobBody } from '@/lib/api/v1/ladder-schema';
import { NO_STORE, createOwnJobForKey, readBody, writeBudgetExceeded } from '@/lib/api/v1/ladder.server';

/**
 * POST /api/v1/me/ladder/own-jobs — add a job you found elsewhere (`write:ladder`), through the site's own create: the
 * same 300-job cap and refusal. Answers 201 with the application it opens, so the next call can move it along.
 * Pay is not accepted. Honours `Idempotency-Key`.
 */
export const Route = createFileRoute('/api/v1/me/ladder/own-jobs')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      POST: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const body = await readBody(request, createOwnJobBody);
            if (!body.ok) return error('invalid_request', body.message, 400, NO_STORE);
            if (writeBudgetExceeded(userId)) return error('rate_limited', 'Too many writes. Slow down.', 429, NO_STORE);
            const result = await createOwnJobForKey(userId, body.data);
            if (result.ok) return json({ data: result.application }, 201, NO_STORE);
            if (result.status === 409) return error('conflict', result.message, 409, NO_STORE);
            if (result.status === 404) return error('not_found', 'Not found.', 404, NO_STORE);
            return error('invalid_request', result.message, 400, NO_STORE);
          },
          { scope: 'write:ladder', idempotent: true },
        ),
    },
  },
});
