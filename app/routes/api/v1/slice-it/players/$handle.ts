import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { playerPath } from '@/lib/api/v1/slice-it-schema';
import { SLICE_CACHE, getPlayer, readInput } from '@/lib/api/v1/slice-it.server';

/**
 * GET /api/v1/slice-it/players/{handle} — a member's public Slice It! career, their best 20 rows on public songs and
 * their public uploads count. A member hidden from boards, banned, without a handle, or blocked either way with the
 * key owner is `404`, the same as an unknown handle.
 */
export const Route = createFileRoute('/api/v1/slice-it/players/$handle')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, playerPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const player = await getPlayer(p.data.handle, userId);
            if (!player) return error('not_found', 'Player not found.', 404);
            return json({ data: player }, 200, SLICE_CACHE);
          },
          { scope: 'read:slice-it' },
        ),
    },
  },
});
