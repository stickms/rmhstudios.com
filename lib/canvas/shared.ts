import { z } from 'zod';

/** Z5 — fixed 16-colour palette (one byte per pixel on the board indexes into it). */
export const CANVAS_PALETTE = [
  '#ffffff',
  '#e4e4e4',
  '#888888',
  '#222222',
  '#ffa7d1',
  '#e50000',
  '#e59500',
  '#a06a42',
  '#e5d900',
  '#94e044',
  '#02be01',
  '#00d3dd',
  '#0083c7',
  '#0000ea',
  '#cf6ee4',
  '#820080',
] as const;

export const CANVAS_SIZES = [64, 128, 256] as const;
export const CANVAS_BLANK = 0;

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

export type CanvasPhase = 'upcoming' | 'live' | 'ended';

export interface CanvasEventView {
  id: string;
  title: string;
  width: number;
  height: number;
  cooldownSec: number;
  startsAt: string;
  endsAt: string;
  phase: CanvasPhase;
  /** ISO time the viewer may place next; null when they can place now (or are signed out). */
  nextAt: string | null;
}

export function phaseOf(startsAt: Date, endsAt: Date, now = new Date()): CanvasPhase {
  if (now < startsAt) return 'upcoming';
  return now < endsAt ? 'live' : 'ended';
}

/** Live stream frame: a batch of [x, y, color] triples. */
export interface CanvasBatch {
  pixels: [number, number, number][];
}
