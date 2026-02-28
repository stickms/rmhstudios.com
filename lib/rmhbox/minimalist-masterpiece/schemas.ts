/**
 * RMHbox — Minimalist Masterpiece Zod Schemas
 *
 * Validation schemas for client → server actions in Minimalist Masterpiece.
 * Used server-side to validate all player input.
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §3.5
 */

import { z } from 'zod';
import { MM_CANVAS_SIZE, MM_MIN_POINTS_PER_STROKE, MM_MAX_POINTS_PER_STROKE, MM_MAX_STROKES, MM_BID_INCREMENT } from '../constants';

// ─── Point Schema ────────────────────────────────────────────────

export const PointSchema = z.object({
  x: z.number().min(0).max(MM_CANVAS_SIZE),
  y: z.number().min(0).max(MM_CANVAS_SIZE),
  pressure: z.number().min(0).max(1),
});

// ─── Stroke Schema ───────────────────────────────────────────────

export const StrokeSchema = z.object({
  id: z.string().min(1).max(36),
  points: z.array(PointSchema).min(MM_MIN_POINTS_PER_STROKE).max(MM_MAX_POINTS_PER_STROKE),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  width: z.number().positive(),
  timestamp: z.number(),
});

// ─── Submit Drawing Schema ───────────────────────────────────────

export const SubmitDrawingSchema = z.object({
  strokes: z.array(StrokeSchema).max(MM_MAX_STROKES),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#ffffff'),
});

/** Auto-save schema — same shape as submit but does not lock the drawing. */
export const SaveDrawingSchema = SubmitDrawingSchema;

// ─── Place Bid Schema ────────────────────────────────────────────

export const PlaceBidSchema = z.object({
  drawingId: z.string().min(1).max(36),
  amount: z.number().int().multipleOf(MM_BID_INCREMENT),
});
