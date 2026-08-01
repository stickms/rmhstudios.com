import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';

import { prisma } from '@/lib/prisma.server';
import { unlink, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { resolvePathUnder, validateImageBuffer } from '@/lib/slice-it/upload-validation';
import { optimizeImage } from '@/lib/image-optimize';

// Match the upload route: covers are stored as 1024px square WebP.
const COVER_SIZE = 1024;

export const Route = createFileRoute('/api/slice-it/songs/$id')({
  server: {
    handlers: {
      PATCH: defineHandler(
        { rateLimit: { limit: 10, windowMs: 60_000, prefix: 'slice-patch' } },
        async ({ request, params, session }) => {
          const { id } = params;

          const song = await prisma.song.findUnique({
            where: { id },
          });

          if (!song) {
            return Response.json({ error: 'Song not found' }, { status: 404 });
          }

          if (song.uploadedBy !== session.user.id) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }

          const formData = await request.formData();
          const title = formData.get('title') as string | null;
          const artist = formData.get('artist') as string | null;
          const bpmRaw = formData.get('bpm') as string | null;
          const bpm = bpmRaw ? parseFloat(bpmRaw) : null;
          const description = formData.get('description') as string | null;
          const coverFile = formData.get('cover') as File | null;

          let coverUrl: string | null = song.coverUrl ?? null;

          if (coverFile && coverFile.size > 0) {
            const coverBuffer = Buffer.from(await coverFile.arrayBuffer());
            const coverValidation = validateImageBuffer(coverBuffer);
            if (!coverValidation.ok) {
              return Response.json({ error: coverValidation.error }, { status: 400 });
            }
            const { buffer: coverWebp } = await optimizeImage(coverBuffer, {
              width: COVER_SIZE,
              height: COVER_SIZE,
              format: 'webp',
              quality: 82,
              autoOrient: true,
            });
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
            const coverFileName = `${uniqueSuffix}-cover.webp`;
            const coverDir = path.join(process.cwd(), 'db', 'music', 'covers');
            await mkdir(coverDir, { recursive: true });
            const coverPath = path.join(coverDir, coverFileName);
            await writeFile(coverPath, coverWebp);
            coverUrl = `/api/slice-it/songs/cover/${coverFileName}`;
          }

          const updated = await prisma.song.update({
            where: { id },
            data: {
              title: title ?? song.title,
              artist: artist ?? song.artist,
              bpm: bpm && bpm > 0 ? bpm : song.bpm,
              description: description ?? song.description,
              coverUrl,
            },
          });

          return Response.json({ success: true, song: updated });
        },
      ),
      DELETE: defineHandler({}, async ({ params, session }) => {
        const { id } = params;
        const song = await prisma.song.findUnique({
          where: { id },
        });

        if (!song) {
          return Response.json({ error: 'Song not found' }, { status: 404 });
        }

        if (song.uploadedBy !== session.user.id) {
          return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        const musicDir = path.join(process.cwd(), 'db', 'music');
        const filePath = resolvePathUnder(musicDir, song.audioUrl);
        if (!filePath) {
          return Response.json({ error: 'Invalid path' }, { status: 400 });
        }
        try {
          await unlink(filePath);
        } catch (e) {
          console.error('Failed to delete file from disk:', e);
          // Continue to delete record even if file is missing
        }

        // Delete from DB
        await prisma.song.delete({
          where: { id },
        });

        return Response.json({ success: true });
      }),
    },
  },
});
