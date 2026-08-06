import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { AnalysisBackfillZ } from '@/lib/slice-it/api-schemas';
import { BEATMAP_VERSION, isStaleAnalysis } from '@/lib/slice-it/beatmap';

/**
 * Backfill a chart for a song that has none, or upgrade a stale one.
 *
 * Every song uploaded since the analyser moved server-side already has a
 * current chart, generated once from the pre-transcode audio. This route exists
 * for the songs that predate that: their `analysisData` is either null or was
 * produced by the old time-domain detector. The beatmap pipeline is pure
 * TypeScript and runs in a tab as well as on the server, so the first player to
 * open such a song generates a current chart locally and posts it back — and
 * every player after them gets it from the database.
 *
 * ## What this had to fix
 *
 * - **Anyone could write it.** The check was `song.uploadedBy !== session.user?.id`
 *   — but with `?.`, so an *unauthenticated* request compared a string to
 *   `undefined`, failed, and got a 403. That happened to be safe. What was not
 *   safe is the body: the only validation was `JSON.stringify(body).length <
 *   1_000_000`, so the uploader could store any megabyte of arbitrary JSON as
 *   the chart every future player of that song would download and execute
 *   against the engine. `AnalysisBackfillZ` validates every note.
 * - **A stale chart could never be replaced.** It refused to write whenever
 *   `analysisData` was non-empty, which is exactly the case a v1 chart is in —
 *   so the songs that most needed re-analysing were the ones locked out of it.
 * - **Only the uploader could fix a song.** A chart is not authorship, and a
 *   library where a song is unplayable until one specific person comes back is
 *   a library with dead songs in it. Any signed-in player may supply a chart
 *   for a song that has none or has a stale one; nobody may overwrite a current
 *   one except the uploader.
 */
export const Route = createFileRoute('/api/slice-it/songs/$id/patch-analysis')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          body: AnalysisBackfillZ,
          rateLimit: { limit: 10, windowMs: 60_000, prefix: 'slice-analysis', scope: 'user' },
        },
        async ({ params, body, userId }) => {
          const song = await prisma.song.findUnique({
            where: { id: params.id },
            select: {
              id: true,
              uploadedBy: true,
              isPublic: true,
              analysisData: true,
              bpm: true,
            },
          });
          if (!song || (!song.isPublic && song.uploadedBy !== userId)) {
            return Response.json({ error: 'Song not found' }, { status: 404 });
          }

          const current = song.analysisData;
          const stale = isStaleAnalysis(current);
          const isOwner = song.uploadedBy === userId;

          if (!stale && !isOwner) {
            return Response.json({ success: true, updated: false, reason: 'current' });
          }

          const incoming = body.analysisData;
          // Never let a backfill downgrade a chart. A client running an older
          // bundle would otherwise replace a v2 chart with its own v1 one, and
          // the next client would replace it back, forever.
          const incomingVersion = incoming.analysisVersion ?? 1;
          const currentVersion =
            typeof (current as { analysisVersion?: unknown })?.analysisVersion === 'number'
              ? ((current as { analysisVersion: number }).analysisVersion)
              : 0;
          if (current && incomingVersion <= currentVersion) {
            return Response.json({ success: true, updated: false, reason: 'not_newer' });
          }

          await prisma.song.update({
            where: { id: song.id },
            data: {
              // The id inside the blob is whatever the generator was handed;
              // pin it to the row so a chart cannot claim to belong to another
              // song.
              analysisData: { ...incoming, id: song.id } as never,
              // A song uploaded with no BPM gets one the first time it is
              // charted, so the library card stops reading "0 BPM".
              ...(!song.bpm && incoming.bpm > 0 ? { bpm: incoming.bpm } : {}),
            },
          });

          return Response.json({
            success: true,
            updated: true,
            version: incomingVersion,
            currentVersion: BEATMAP_VERSION,
          });
        },
      ),
    },
  },
});
