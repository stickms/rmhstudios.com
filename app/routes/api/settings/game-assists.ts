import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { getAssistsApi, setAssistsApi } from '@/lib/game/assist.contract';
import { assistPatchSchema } from '@/lib/game/assist-schema';
import { getAssists, setAssists } from '@/lib/game/assist.server';
import { ASSIST_CAPABLE } from '@/lib/game/assist';

/**
 * `/api/settings/game-assists` — the member's own assists (P7).
 *
 * GET also returns which games currently honour them, because the settings
 * panel has to be able to say so. A panel that offers five switches without
 * naming what they affect would be describing a feature the site does not have
 * yet — and today that list is empty, which the panel says out loud.
 */

export const Route = createFileRoute('/api/settings/game-assists')({
  server: {
    handlers: {
      GET: implement(getAssistsApi, { rateLimit: 'read' }, async ({ session }) => ({
        assists: await getAssists(session.user.id),
        honouredBy: [...ASSIST_CAPABLE].sort(),
      })),
      POST: implement(
        setAssistsApi,
        { rateLimit: 'write', body: assistPatchSchema },
        async ({ session, body }) => ({
          assists: await setAssists(session.user.id, body),
          honouredBy: [...ASSIST_CAPABLE].sort(),
        }),
      ),
    },
  },
});
