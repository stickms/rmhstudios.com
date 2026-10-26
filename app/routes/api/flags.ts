import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { evaluateAllFlags } from '@/lib/flags/flags.server';

/** GET /api/flags — every feature flag evaluated for the caller (`{ [key]: boolean }`). */
export const Route = createFileRoute('/api/flags')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ userId }) =>
        Response.json(
          { flags: await evaluateAllFlags(userId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
    },
  },
});
