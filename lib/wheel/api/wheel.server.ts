import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/wheel/wheel.contract';
import { prisma } from '@/lib/prisma.server';
import { WHEEL_SEGMENTS, wheelDateKey } from '@/lib/wheel/wheel';

/** GET /api/wheel — segments + whether the viewer can spin today. */
export const route = apiRoute('/api/wheel', {
  GET: implement(C.getWheelApi, { auth: 'optional' }, async ({ session }) => {
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
});
