import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { applicationPath, patchApplicationBody } from '@/lib/api/v1/ladder-schema';
import {
  NO_STORE,
  getApplicationForKey,
  patchApplicationForKey,
  readBody,
  readInput,
  writeBudgetExceeded,
} from '@/lib/api/v1/ladder.server';

/**
 * GET   /api/v1/me/ladder/applications/{id} — one application with its newest 50 timeline events (`read:ladder`).
 * PATCH /api/v1/me/ladder/applications/{id} — status, applied date, follow-up date, interview dates and notes
 * (`write:ladder`), through the site's own update: one timeline event per change. Honours `Idempotency-Key`.
 * An application that is not yours is 404.
 */
export const Route = createFileRoute('/api/v1/me/ladder/applications/$id')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, applicationPath);
            if (!p.ok) return error('invalid_request', p.message, 400, NO_STORE);
            const application = await getApplicationForKey(userId, p.data.id);
            return application
              ? json({ data: application }, 200, NO_STORE)
              : error('not_found', 'Application not found.', 404, NO_STORE);
          },
          { scope: 'read:ladder' },
        ),

      PATCH: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, applicationPath);
            if (!p.ok) return error('invalid_request', p.message, 400, NO_STORE);
            const body = await readBody(request, patchApplicationBody);
            if (!body.ok) return error('invalid_request', body.message, 400, NO_STORE);
            if (writeBudgetExceeded(userId)) return error('rate_limited', 'Too many writes. Slow down.', 429, NO_STORE);
            const result = await patchApplicationForKey(userId, p.data.id, body.data);
            if (result.ok) return json({ data: result.application }, 200, NO_STORE);
            return result.reason === 'not_found'
              ? error('not_found', 'Application not found.', 404, NO_STORE)
              : error('invalid_request', 'Invalid request.', 400, NO_STORE);
          },
          { scope: 'write:ladder', idempotent: true },
        ),
    },
  },
});
