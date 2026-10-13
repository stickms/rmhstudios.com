import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getCalibration } from '@/lib/forecasting/forecasting.server';

/** GET /api/forecasting/calibration — the caller's own calibration profile (G7). */
export const Route = createFileRoute('/api/forecasting/calibration')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
        const calibration = await getCalibration(userId);
        return Response.json(
          { calibration },
          { headers: { 'Cache-Control': 'private, no-store' } },
        );
      }),
    },
  },
});
