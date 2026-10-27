/**
 * POST /api/tf2-loadout/ai — ask the loadout assistant for themes, suggestions and counters. Returns a
 * short reply and a list of equips that have already been checked against the catalog, or
 * `{ unavailable: true }` when the model cannot be reached (the browser then matches names itself).
 * Signed-in only, rate limited and budgeted like every AI call on the site.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { apiError, defineHandler } from '@/lib/api/handler.server';
import { classSchema, slotsSchema } from '@/lib/tf2-loadout/api-schema';
import { ASSISTANT_LIMITS } from '@/lib/tf2-loadout/ai-core';
import { askLoadoutAssistant } from '@/lib/tf2-loadout/ai.server';
import { getCatalogObject } from '@/lib/tf2-loadout/catalog.server';

const schema = z.object({
  tfClass: classSchema,
  slots: slotsSchema.default({}),
  message: z.string().trim().min(1).max(ASSISTANT_LIMITS.message),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(ASSISTANT_LIMITS.historyChars),
      }),
    )
    .max(ASSISTANT_LIMITS.history)
    .default([]),
});

export const Route = createFileRoute('/api/tf2-loadout/ai')({
  server: {
    handlers: {
      POST: defineHandler({ rateLimit: 'ai', body: schema }, async ({ userId, body }) => {
        const catalog = await getCatalogObject();
        if (!catalog) return apiError('The item catalog is not available yet. Try again shortly.', 503);
        const result = await askLoadoutAssistant({
          userId,
          catalog,
          cls: body.tfClass,
          slots: body.slots,
          message: body.message,
          history: body.history,
        });
        if (!result.ok) return Response.json({ unavailable: true, reason: result.reason });
        return Response.json({ reply: result.reply, actions: result.actions, dropped: result.dropped });
      }),
    },
  },
});
