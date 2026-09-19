import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getAssists, setAssists } from '@/lib/game/assist.server';
import { ASSIST_CAPABLE, MIN_SPEED_FLOOR } from '@/lib/game/assist';

/**
 * `/api/settings/game-assists` — the member's own assists (P7).
 *
 * GET also returns which games currently honour them, because the settings
 * panel has to be able to say so. A panel that offers five switches without
 * naming what they affect would be describing a feature the site does not have
 * yet — and today that list is empty, which the panel says out loud.
 */

const schema = z.object({
  holdToPress: z.boolean().optional(),
  speedFloor: z.number().min(MIN_SPEED_FLOOR).max(1).optional(),
  calmVisuals: z.boolean().optional(),
  colorSafe: z.boolean().optional(),
  noTimedInput: z.boolean().optional(),
});

export const Route = createFileRoute('/api/settings/game-assists')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ session }) =>
        Response.json({
          assists: await getAssists(session.user.id),
          honouredBy: [...ASSIST_CAPABLE].sort(),
        }),
      ),
      POST: defineHandler(
        { rateLimit: 'write', body: schema },
        async ({ session, body }) =>
          Response.json({
            assists: await setAssists(session.user.id, body),
            honouredBy: [...ASSIST_CAPABLE].sort(),
          }),
      ),
    },
  },
});
