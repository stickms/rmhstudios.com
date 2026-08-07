import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { optimizeImage } from '@/lib/image-optimize';
import { COVER_MAX_BYTES, COVER_SIZE, DIFFICULTIES } from '@/lib/slice-it/constants';
import { SongPatchZ } from '@/lib/slice-it/api-schemas';
import { trimToDifficulty } from '@/lib/slice-it/nested-chart';
import { validateImageBuffer } from '@/lib/slice-it/upload-validation';
import {
  deleteSongAssets,
  songSelect,
  storeSongCover,
  toSliceSong,
} from '@/lib/slice-it/songs.server';
import { issueRunToken } from '@/lib/slice-it/run-token.server';

/**
 * O7 — which single difficulty to send.
 *
 * Optional, and absent means "all four", because the editor, the linter and
 * every client older than this parameter need the whole chart. A caller that
 * knows what it is about to play should always pass it.
 */
const SongQueryZ = z.object({
  difficulty: z.enum(DIFFICULTIES).optional(),
});

/**
 * A single song: read, edit, delete.
 *
 * The GET is new. Previously the only way to obtain a song's chart was the list
 * endpoint, which returned `analysisData` for all fifty songs on every library
 * open — several megabytes of note arrays to render a list of titles. The chart
 * now travels exactly once, when a player is about to play that song.
 */
export const Route = createFileRoute('/api/slice-it/songs/$id')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: SongQueryZ },
        async ({ params, userId, query }) => {
          const song = await prisma.song.findUnique({
            where: { id: params.id },
            select: {
              ...songSelect,
              analysisData: true,
              ...(userId
                ? {
                    likes: { where: { userId }, select: { id: true } },
                    songPlays: { where: { userId }, select: { count: true } },
                  }
                : {}),
            },
          });

          if (!song || (!song.isPublic && userId !== song.uploadedBy)) {
            return Response.json({ error: 'Song not found' }, { status: 404 });
          }

          const payload = toSliceSong(song, userId, { includeAnalysis: true });

          // O7 — send one difficulty, not four. The `select` cannot narrow
          // inside a Json column, so the trim happens after the read: the win
          // is on the wire, not in the query, and the wire is where
          // `LOAD_TIMEOUT_MS` is spent. Since the tiers are nested
          // (easy ⊆ normal ⊆ hard ⊆ expert), three of the four lists are mostly
          // the same notes repeated.
          if (query.difficulty && payload.analysisData) {
            payload.analysisData = trimToDifficulty(payload.analysisData, query.difficulty);
          }

          // Mint the run receipt here rather than from a dedicated endpoint:
          // every run performs this read, so it costs no extra round trip on
          // the path to starting a song. See `run-token.server.ts`.
          return Response.json({
            ...payload,
            ...(userId ? { runToken: issueRunToken(userId, song.id) } : {}),
          });
        },
      ),

      PATCH: defineHandler(
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'slice-patch', scope: 'user' } },
        async ({ request, params, userId, isAdmin }) => {
          // Before `formData()`, which buffers the whole body. Only a cover can
          // be replaced here, so the ceiling is that plus form slack.
          const declaredLength = Number(request.headers.get('content-length') ?? 0);
          if (Number.isFinite(declaredLength) && declaredLength > COVER_MAX_BYTES + 1024 * 1024) {
            return Response.json({ error: 'Upload too large.' }, { status: 413 });
          }

          const song = await prisma.song.findUnique({
            where: { id: params.id },
            select: { id: true, uploadedBy: true, coverUrl: true },
          });
          if (!song) return Response.json({ error: 'Song not found' }, { status: 404 });
          if (song.uploadedBy !== userId && !isAdmin) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }

          const formData = await request.formData();
          const fields = SongPatchZ.safeParse({
            title: formData.get('title') ?? undefined,
            artist: formData.get('artist') ?? undefined,
            description: formData.get('description') ?? undefined,
            bpm: formData.get('bpm') ?? undefined,
            isPublic: formData.get('isPublic') ?? undefined,
          });
          if (!fields.success) {
            return Response.json({ error: 'Invalid track details.' }, { status: 400 });
          }

          let coverUrl = song.coverUrl;
          const coverFile = formData.get('cover');
          if (coverFile instanceof File && coverFile.size > 0) {
            const raw = Buffer.from(await coverFile.arrayBuffer());
            const check = validateImageBuffer(raw);
            if (!check.ok) return Response.json({ error: check.error }, { status: 400 });

            const { buffer } = await optimizeImage(raw, {
              width: COVER_SIZE,
              height: COVER_SIZE,
              format: 'webp',
              quality: 82,
              autoOrient: true,
            });
            const previous = song.coverUrl;
            coverUrl = await storeSongCover(buffer);
            // Only once the new cover is safely stored — an upload that failed
            // halfway used to leave the song with no artwork at all.
            if (previous) await deleteSongAssets({ audioUrl: null, coverUrl: previous });
          }

          const updated = await prisma.song.update({
            where: { id: params.id },
            data: {
              ...(fields.data.title !== undefined ? { title: fields.data.title } : {}),
              ...(fields.data.artist !== undefined ? { artist: fields.data.artist } : {}),
              ...(fields.data.description !== undefined
                ? { description: fields.data.description || null }
                : {}),
              ...(fields.data.bpm !== undefined ? { bpm: fields.data.bpm } : {}),
              ...(fields.data.isPublic !== undefined ? { isPublic: fields.data.isPublic } : {}),
              coverUrl,
            },
            select: songSelect,
          });

          return Response.json({ success: true, song: toSliceSong(updated, userId) });
        },
      ),

      DELETE: defineHandler({ rateLimit: 'write' }, async ({ params, userId, isAdmin }) => {
        const song = await prisma.song.findUnique({
          where: { id: params.id },
          select: { id: true, uploadedBy: true, audioUrl: true, coverUrl: true },
        });
        if (!song) return Response.json({ error: 'Song not found' }, { status: 404 });
        if (song.uploadedBy !== userId && !isAdmin) {
          return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        // The row goes first. Cascades take the likes, scores, comments and
        // plays with it; the files are best-effort cleanup after, because a
        // storage hiccup must not leave the user staring at a song they just
        // asked to delete.
        await prisma.song.delete({ where: { id: params.id } });
        await deleteSongAssets(song);

        return Response.json({ success: true });
      }),
    },
  },
});
