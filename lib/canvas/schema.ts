/**
 * Z5 canvas — the zod schemas for the canvas API routes. Split from
 * `./shared`, which the /canvas page imports for the palette and view types.
 */
import { z } from 'zod';

import { CANVAS_PALETTE } from './shared';

export const createCanvasEventSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    size: z.union([z.literal(64), z.literal(128), z.literal(256)]),
    cooldownMinutes: z.number().int().min(1).max(120),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), { message: 'End must follow start' });

export const placePixelSchema = z.object({
  eventId: z.string().min(1).max(40),
  x: z.number().int().min(0).max(255),
  y: z.number().int().min(0).max(255),
  color: z
    .number()
    .int()
    .min(0)
    .max(CANVAS_PALETTE.length - 1),
});

export const canvasEventQuery = z.object({ id: z.string().min(1).max(40) });

export const canvasLogQuery = z.object({
  id: z.string().min(1).max(40),
  after: z.coerce.number().int().min(0).default(0),
});
