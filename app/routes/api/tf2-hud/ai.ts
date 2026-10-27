/**
 * POST /api/tf2-hud/ai — the HUD assistant. Two stages, both stateless:
 *   { stage: "select", message, paths }          → which files the request touches
 *   { stage: "edit",   message, files: [{path, text}] } → a summary and key-level changes
 * `{ unavailable: true }` when the model cannot be reached. Signed-in only, rate limited and budgeted.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { HUD_AI_LIMITS } from '@/lib/tf2-hud/ai-core';
import { proposeHudChanges, selectHudFiles } from '@/lib/tf2-hud/ai.server';

const message = z.string().trim().min(1).max(HUD_AI_LIMITS.message);
const history = z
  .array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().max(HUD_AI_LIMITS.historyChars),
    }),
  )
  .max(HUD_AI_LIMITS.history)
  .default([]);

const schema = z.discriminatedUnion('stage', [
  z.object({
    stage: z.literal('select'),
    message,
    history,
    paths: z.array(z.string().min(1).max(200)).min(1).max(HUD_AI_LIMITS.paths),
  }),
  z.object({
    stage: z.literal('edit'),
    message,
    history,
    files: z
      .array(
        z.object({
          path: z.string().min(1).max(200),
          text: z.string().max(HUD_AI_LIMITS.fileChars + 100),
        }),
      )
      .min(1)
      .max(HUD_AI_LIMITS.files)
      .refine(
        (f) => f.reduce((n, x) => n + x.text.length, 0) <= HUD_AI_LIMITS.totalChars,
        'files are too large',
      ),
  }),
]);

export const Route = createFileRoute('/api/tf2-hud/ai')({
  server: {
    handlers: {
      POST: defineHandler({ rateLimit: 'ai', body: schema }, async ({ userId, body }) => {
        if (body.stage === 'select') {
          const r = await selectHudFiles({
            userId,
            message: body.message,
            paths: body.paths,
            history: body.history,
          });
          return Response.json(r.ok ? { files: r.files } : { unavailable: true, reason: r.reason });
        }
        const r = await proposeHudChanges({
          userId,
          message: body.message,
          files: body.files,
          history: body.history,
        });
        return Response.json(
          r.ok
            ? { summary: r.summary, changes: r.changes, malformed: r.malformed }
            : { unavailable: true, reason: r.reason },
        );
      }),
    },
  },
});
