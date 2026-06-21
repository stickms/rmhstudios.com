import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { WHEEL_SEGMENTS, wheelDateKey } from '@/lib/wheel/wheel';

/** GET /api/wheel — segments + whether the viewer can spin today. */
export const Route = createFileRoute('/api/wheel/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
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
      },
    },
  },
});
