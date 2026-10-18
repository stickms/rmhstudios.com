import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { classifyHosts } from '@/lib/safety/link-risk.server';

/** POST /api/links/check — risk of up to 20 link hosts (S6). Read-only, cached. */
export const Route = createFileRoute('/api/links/check')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          body: z.object({ hosts: z.array(z.string().max(255)).min(1).max(20) }),
        },
        async ({ body }) =>
          Response.json(
            { risk: await classifyHosts(body.hosts) },
            {
              headers: { 'Cache-Control': 'private, max-age=60' },
            },
          ),
      ),
    },
  },
});
