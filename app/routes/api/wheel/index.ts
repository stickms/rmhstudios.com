import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { WHEEL_SEGMENTS, wheelDateKey } from '@/lib/wheel/wheel';

/** GET /api/wheel — segments + whether the viewer can spin today. */
export const Route = createFileRoute('/api/wheel/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ session }) => {
        const segments = WHEEL_SEGMENTS.map((s) => s.reward);

        if (!session) {
          return Response.json({ segments, signedIn: false, canSpin: false, today: null });
        }

        const today = await prisma.dailyWheelSpin.findUnique({
          where: { userId_dateKey: { userId: session.user.id, dateKey: wheelDateKey() } },
          select: { reward: true, segment: true },
        });

        return Response.json({
          segments,
          signedIn: true,
          canSpin: !today,
          today: today ? { reward: today.reward, segment: today.segment } : null,
        });
      }),
    },
  },
});
