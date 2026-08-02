import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';

import { prisma } from '@/lib/prisma.server';

export const Route = createFileRoute('/api/slice-it/songs')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ session }) => {
        const userId = session?.user?.id;

        const query: any = {
          where: { isPublic: true },
          orderBy: { createdAt: 'desc' },
          include: {
            uploader: {
              select: { name: true, username: true },
            },
            _count: {
              select: {
                scores: true,
                likes: true,
              },
            },
          },
          take: 50,
        };

        if (userId) {
          query.include.likes = {
            where: { userId },
            select: { id: true },
          };
          query.include.songPlays = {
            where: { userId },
            select: { count: true },
          };
        }

        const songs = await prisma.song.findMany(query);

        // Format for frontend
        const formatted = songs.map((s: any) => ({
          id: s.id,
          title: s.title,
          artist: s.artist,
          bpm: s.bpm || 0,
          description: s.description,
          duration: s.duration,
          audioUrl: s.audioUrl,
          coverUrl: s.coverUrl,
          analysisData: s.analysisData,
          uploadedBy: s.uploadedBy,
          uploader: { name: s.uploader?.name || s.uploader?.username || 'Unknown' },
          plays: s.plays || 0,
          likeCount: s._count?.likes || 0,
          isLiked: userId ? s.likes?.length > 0 : false,
          userPlays: userId ? s.songPlays?.[0]?.count || 0 : undefined,
          _count: s._count,
        }));

        return Response.json(formatted);
      }),
    },
  },
});
