/**
 * One stored Slice It replay, for the viewer (`R4`).
 *
 * Thin on purpose: it returns the payload and who set it, and nothing about the
 * song. The viewer already has to read `/api/slice-it/songs/$id` for the chart
 * and the audio — that read is cached, shared with the game itself, and is the
 * only place that knows how to resolve a stream URL — so duplicating any of it
 * here would be a second definition of what a song is.
 *
 * `versionMatch` is the field a player-facing screen must branch on. A replay
 * recorded under an older `SLICE_IT_VERSION` is not playable as itself: the
 * logic that would render it has changed, which is precisely what bumping the
 * version means. Better a "recorded on an older version" notice than a
 * confidently wrong playback.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getReplay } from '@/lib/replays.server';

export const Route = createFileRoute('/api/slice-it/replay/$id')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ params }) => {
        const id = typeof params.id === 'string' ? params.id : '';
        if (!id) return Response.json({ error: 'Not found' }, { status: 404 });

        const replay = await getReplay(id);
        if (!replay || replay.game !== 'slice-it') {
          return Response.json({ error: 'Not found' }, { status: 404 });
        }

        return Response.json({
          id: replay.id,
          version: replay.version,
          versionMatch: replay.versionMatch,
          durationMs: replay.durationMs,
          createdAt: replay.createdAt,
          author: replay.author,
          data: replay.data,
        });
      }),
    },
  },
});
