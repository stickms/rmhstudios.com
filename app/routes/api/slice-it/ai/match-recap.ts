/**
 * POST /api/slice-it/ai/match-recap — recap a versus match. (Feature 10.)
 *
 * Returns `{ recap }`, null when AI is unavailable — the standings table is the
 * screen that shipped before this.
 *
 * The standings come from the body. This is the one route where that is a real
 * compromise and it is taken knowingly: the authoritative results live in the
 * socket server's match state, not in a table the web tier can read, and
 * plumbing a signed match receipt through for a paragraph of flavour text would
 * be a large change for a small feature. The blast radius is bounded — the
 * recap writes nothing, awards nothing, and is shown only to the caller — and
 * every name goes through the safety frame as data.
 *
 * The *song* is still read from the database, so a fabricated body can at worst
 * produce a recap of a match that did not happen, on a real song, for an
 * audience of one.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { assertAiBudget } from '@/lib/ai/budget.server';
import { MatchRecapRequestZ } from '@/lib/slice-it/ai/api-schemas';
import { recapMatch } from '@/lib/slice-it/ai/match.server';
import { isAiConfigured } from '@/lib/slice-it/ai/run.server';
import { loadSongFacts } from '@/lib/slice-it/ai/song-facts.server';

export const Route = createFileRoute('/api/slice-it/ai/match-recap')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          body: MatchRecapRequestZ,
          rateLimit: {
            policy: 'ai',
            limit: 8,
            windowMs: 60_000,
            prefix: 'slice-match-recap',
            scope: 'user',
          },
        },
        async ({ userId, body }) => {
          if (!isAiConfigured()) return Response.json({ recap: null });

          const song = await loadSongFacts(body.songId, userId);
          if (!song) return Response.json({ error: 'Song not found' }, { status: 404 });

          await assertAiBudget(userId);

          const recap = await recapMatch(
            {
              songTitle: song.title,
              songArtist: song.artist,
              durationSec: song.durationSec,
              standings: body.standings,
            },
            { userId },
          );

          return Response.json({ recap });
        },
      ),
    },
  },
});
