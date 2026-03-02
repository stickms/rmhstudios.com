/**
 * Athora — Stand Socket Handlers
 *
 * Tracks stand visitors and queue state in real-time.
 */

import type { Server, Socket } from 'socket.io';
import { getPrismaClient } from '../../prisma-client';
import { logger } from '../../logger';
import { addStandVisitor, removeStandVisitor } from './state';

export function registerAthoraStandHandlers(io: Server, socket: Socket): void {
  const userId = socket.data.userId as string | undefined;

  if (!userId) return;

  // ── VISIT STAND ────────────────────────────────────────────────

  socket.on('athora:stand:visit', async ({ standId }: { standId: string }) => {
    try {
      const count = addStandVisitor(standId, userId);

      // Get stand's roomId for broadcasting
      const prisma = getPrismaClient();
      const stand = await prisma.athoraStand.findUnique({
        where: { id: standId },
        select: { roomId: true },
      });

      if (stand) {
        io.to(`athora:room:${stand.roomId}`).emit('athora:stand:visitor_count', {
          standId,
          count,
        });
      }

      // Increment view counts
      await prisma.athoraStand.update({
        where: { id: standId },
        data: {
          totalViews: { increment: 1 },
          uniqueVisitors: { increment: 1 },
        },
      });
    } catch (err) {
      logger.error({
        event: 'athora:stand:visit_error',
        userId,
        standId,
        error: String(err),
      });
    }
  });

  // ── LEAVE STAND ────────────────────────────────────────────────

  socket.on('athora:stand:leave', async ({ standId }: { standId: string }) => {
    const count = removeStandVisitor(standId, userId);

    const prisma = getPrismaClient();
    const stand = await prisma.athoraStand.findUnique({
      where: { id: standId },
      select: { roomId: true },
    });

    if (stand) {
      io.to(`athora:room:${stand.roomId}`).emit('athora:stand:visitor_count', {
        standId,
        count,
      });
    }
  });

  // ── QUEUE JOIN ─────────────────────────────────────────────────

  socket.on(
    'athora:stand:queue:join',
    async ({ standId }: { standId: string }) => {
      try {
        const prisma = getPrismaClient();

        // Get next position
        const lastEntry = await prisma.athoraStandQueueEntry.findFirst({
          where: { standId, status: { in: ['WAITING', 'ACTIVE'] } },
          orderBy: { position: 'desc' },
        });

        const position = (lastEntry?.position ?? 0) + 1;

        await prisma.athoraStandQueueEntry.create({
          data: { standId, userId, position, status: 'WAITING' },
        });

        // Fetch updated queue
        const queue = await prisma.athoraStandQueueEntry.findMany({
          where: { standId, status: { in: ['WAITING', 'ACTIVE'] } },
          orderBy: { position: 'asc' },
          include: { stand: { select: { roomId: true } } },
        });

        const stand = await prisma.athoraStand.findUnique({
          where: { id: standId },
          select: { roomId: true },
        });

        if (stand) {
          io.to(`athora:room:${stand.roomId}`).emit('athora:stand:queue_update', {
            standId,
            queue: queue.map((q: any) => ({
              userId: q.userId,
              name: '', // Will be filled client-side
              position: q.position,
              status: q.status,
            })),
          });
        }
      } catch (err) {
        logger.error({
          event: 'athora:stand:queue:join_error',
          userId,
          standId,
          error: String(err),
        });
      }
    },
  );

  // ── QUEUE LEAVE ────────────────────────────────────────────────

  socket.on(
    'athora:stand:queue:leave',
    async ({ standId }: { standId: string }) => {
      try {
        const prisma = getPrismaClient();

        await prisma.athoraStandQueueEntry.updateMany({
          where: { standId, userId, status: 'WAITING' },
          data: { status: 'LEFT' },
        });

        const stand = await prisma.athoraStand.findUnique({
          where: { id: standId },
          select: { roomId: true },
        });

        if (stand) {
          const queue = await prisma.athoraStandQueueEntry.findMany({
            where: { standId, status: { in: ['WAITING', 'ACTIVE'] } },
            orderBy: { position: 'asc' },
          });

          io.to(`athora:room:${stand.roomId}`).emit('athora:stand:queue_update', {
            standId,
            queue: queue.map((q: any) => ({
              userId: q.userId,
              name: '',
              position: q.position,
              status: q.status,
            })),
          });
        }
      } catch (err) {
        logger.error({
          event: 'athora:stand:queue:leave_error',
          userId,
          error: String(err),
        });
      }
    },
  );
}
