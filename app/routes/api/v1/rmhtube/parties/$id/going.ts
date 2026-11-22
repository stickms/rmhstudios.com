import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { goingBody } from '@/lib/api/v1/rmhtube-schema';
import { setGoingForKey } from '@/lib/api/v1/rmhtube.server';

/** PUT /api/v1/rmhtube/parties/{id}/going — say whether you are going (the site's `setGoing`). */
export const Route = createFileRoute('/api/v1/rmhtube/parties/$id/going')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      PUT: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const body = goingBody.safeParse(await request.json().catch(() => null));
            if (!body.success) return error('invalid_request', '`going` must be true or false.', 400);
            const out = await setGoingForKey(params.id ?? '', userId, body.data.going);
            if (!out.ok) return error(out.failure.code, out.failure.message, out.failure.status);
            return json(out.party);
          },
          { scope: 'write:rmhtube', idempotent: true },
        ),
    },
  },
});
