import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import {
  getBotActivityStats,
  getBotWorkerSettings,
  saveBotWorkerSettings,
} from '@/lib/rmhark-ai/bot-settings.server';
import { BOT_SETTINGS_BOUNDS as B } from '@/lib/rmhark-ai/bot-stats';

const settingsSchema = z.object({
  targetBotCount: z.number().int().min(B.targetBotCount.min).max(B.targetBotCount.max),
  createBatch: z.number().int().min(B.createBatch.min).max(B.createBatch.max),
  createIntervalMin: z.number().int().min(B.createIntervalMin.min).max(B.createIntervalMin.max),
  postRateMultiplier: z.number().min(B.postRateMultiplier.min).max(B.postRateMultiplier.max),
  maxPostsPerTick: z.number().int().min(B.maxPostsPerTick.min).max(B.maxPostsPerTick.max),
});

/**
 * GET /api/admin/bots — the bot-worker's settings plus live bot/post counts.
 * PUT /api/admin/bots — save settings; the Go worker picks them up within a minute.
 */
export const Route = createFileRoute('/api/admin/bots/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () => {
        const settings = await getBotWorkerSettings();
        const stats = await getBotActivityStats(settings);
        return Response.json({ settings, stats });
      }),
      PUT: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: settingsSchema },
        async ({ userId, body }) => {
          const settings = await saveBotWorkerSettings(userId, body);
          const stats = await getBotActivityStats(settings);
          return Response.json({ settings, stats });
        },
      ),
    },
  },
});
