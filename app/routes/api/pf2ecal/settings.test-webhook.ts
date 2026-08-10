import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { validateWebhookUrl } from '@/lib/pf2ecal/discord.server';
import { sendTestMessage } from '@/lib/pf2ecal/reminders.server';
import { testWebhookSchema } from '@/lib/pf2ecal/types';

/**
 * POST /api/pf2ecal/settings/test-webhook — post a one-off message so the user
 * can see it land in the channel before trusting the schedule to it.
 *
 * Tests the URL in the FIELD, not the one in the database: the whole point is
 * to check a value before committing it, and a button that tests what is
 * already saved cannot do that.
 *
 * Rate-limited harder than an ordinary write. It is an unauthenticated-adjacent
 * outbound POST to a user-supplied host — the host allowlist means it can only
 * ever reach Discord, but "make the server post to a Discord channel of my
 * choosing, on demand" still wants a tight bucket rather than the shared write
 * limit.
 */
export const Route = createFileRoute('/api/pf2ecal/settings/test-webhook')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 5, windowMs: 60_000, prefix: 'pf2e-webhook-test', scope: 'user' },
          body: testWebhookSchema,
        },
        async ({ body }) => {
          const check = validateWebhookUrl(body.webhookUrl);
          if (!check.ok || !check.url) {
            return Response.json({ error: check.error }, { status: 400 });
          }
          const result = await sendTestMessage(check.url);
          if (!result.ok) {
            // 502, not 500: the failure is Discord's, and the message says
            // which of the plausible causes it was.
            return Response.json({ error: result.error }, { status: 502 });
          }
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
