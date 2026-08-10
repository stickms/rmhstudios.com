import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { maskWebhookUrl, validateWebhookUrl } from '@/lib/pf2ecal/discord.server';
import { SETTINGS_ID } from '@/lib/pf2ecal/settings.server';
import { settingsSchema } from '@/lib/pf2ecal/types';

/**
 * PUT /api/pf2ecal/settings — save the Discord webhook and reminder time.
 *
 * Signed-in only, like every other write on this page. There is no GET: the
 * settings ride along with `GET /api/pf2ecal` (masked), so the page has them on
 * first paint and there is exactly one shape for the board's state.
 *
 * The response deliberately returns the MASKED webhook, not the value that was
 * just submitted — so nothing downstream can start treating the response as a
 * source of the secret.
 */
export const Route = createFileRoute('/api/pf2ecal/settings')({
  server: {
    handlers: {
      PUT: defineHandler({ rateLimit: 'write', body: settingsSchema }, async ({ userId, body }) => {
        // Tri-state: `undefined` leaves the stored URL alone, `null`/'' clears
        // it, a string replaces it. See the schema's note.
        let webhookUpdate: { discordWebhookUrl?: string | null } = {};
        if (body.webhookUrl !== undefined) {
          if (body.webhookUrl === null || body.webhookUrl.trim() === '') {
            webhookUpdate = { discordWebhookUrl: null };
          } else {
            const check = validateWebhookUrl(body.webhookUrl);
            if (!check.ok || !check.url) {
              return Response.json({ error: check.error }, { status: 400 });
            }
            webhookUpdate = { discordWebhookUrl: check.url };
          }
        }

        if (body.reminderTimeZone !== undefined && !isValidTimeZone(body.reminderTimeZone)) {
          return Response.json({ error: 'That is not a known timezone.' }, { status: 400 });
        }

        const data = {
          ...webhookUpdate,
          ...(body.remindersEnabled !== undefined && {
            remindersEnabled: body.remindersEnabled,
          }),
          ...(body.reminderMinutes !== undefined && { reminderMinutes: body.reminderMinutes }),
          ...(body.reminderTimeZone !== undefined && {
            reminderTimeZone: body.reminderTimeZone,
          }),
          updatedById: userId,
        };

        const row = await prisma.pf2eSettings.upsert({
          where: { id: SETTINGS_ID },
          create: { id: SETTINGS_ID, ...data },
          update: data,
        });

        // Turning reminders on with no webhook saved would leave the cron
        // silently doing nothing; say so rather than letting the switch lie.
        if (row.remindersEnabled && !row.discordWebhookUrl) {
          return Response.json(
            { error: 'Add a webhook URL before turning reminders on.' },
            { status: 400 },
          );
        }

        return Response.json({
          settings: {
            webhookMasked: maskWebhookUrl(row.discordWebhookUrl),
            remindersEnabled: row.remindersEnabled,
            reminderMinutes: row.reminderMinutes,
            reminderTimeZone: row.reminderTimeZone,
          },
        });
      }),
    },
  },
});

/** Whether the runtime's IANA database knows this zone. */
function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
