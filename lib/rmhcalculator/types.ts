/**
 * RMHCalculator — shared, client-safe types & schemas.
 *
 * RMHCalculator does NO arithmetic of its own: every scientific evaluation and
 * every plotted graph point is computed by DeepSeek (reasoner or chat). This
 * module holds the zod contracts and TypeScript shapes used on BOTH sides of the
 * wire — the API routes validate requests against them, and the client infers
 * response shapes from them. Pure/no server imports, so it is safe in the
 * browser bundle.
 */

import { z } from 'zod';

/* ─── Model selection ─────────────────────────────────────────────── */

/** The two DeepSeek modes a user can switch between. */
export const CALC_MODELS = ['reasoner', 'chat'] as const;
export type CalcModel = (typeof CALC_MODELS)[number];

export interface CalcModelMeta {
  /** Display name. */
  label: string;
  /** One-line tradeoff hint. */
  hint: string;
}

/**
 * UI copy for the model switcher. `reasoner` shows its full chain-of-thought and
 * is the most accurate (default); `chat` skips deep reasoning for faster replies.
 */
export const CALC_MODEL_META: Record<CalcModel, CalcModelMeta> = {
  reasoner: { label: 'DeepSeek Reasoner', hint: 'Most accurate · shows its work' },
  chat: { label: 'DeepSeek Chat', hint: 'Faster · lighter reasoning' },
};

/** Angle interpretation for trig functions. */
export const ANGLE_MODES = ['rad', 'deg'] as const;
export type AngleMode = (typeof ANGLE_MODES)[number];

/* ─── Request schemas (validated server-side) ─────────────────────── */

export const computeRequestSchema = z.object({
  expression: z.string().trim().min(1).max(500),
  model: z.enum(CALC_MODELS),
  angleMode: z.enum(ANGLE_MODES).default('rad'),
});
export type ComputeRequest = z.infer<typeof computeRequestSchema>;

export const graphRequestSchema = z.object({
  /** One or more functions of x, e.g. "sin(x)", "x^2 - 3". */
  functions: z.array(z.string().trim().min(1).max(160)).min(1).max(4),
  model: z.enum(CALC_MODELS),
  angleMode: z.enum(ANGLE_MODES).default('rad'),
  /** Optional explicit x-domain; the model auto-frames the view when omitted. */
  domain: z
    .object({ min: z.number().finite(), max: z.number().finite() })
    .refine((d) => d.max > d.min, { message: 'domain max must exceed min' })
    .optional(),
});
export type GraphRequest = z.infer<typeof graphRequestSchema>;

/* ─── Response schemas (the model's JSON output, validated) ────────── */

export const computeResultSchema = z.object({
  /** Primary numeric answer as a string (kept as text to preserve precision). */
  result: z.string().max(400).default(''),
  /** Optional exact closed form, e.g. "√2", "3/7", "2π". */
  exact: z.string().max(200).optional(),
  /** Up to a few short working steps. */
  steps: z.array(z.string().max(400)).max(8).optional(),
  /** Set (with an empty result) when the expression is invalid/undefined. */
  error: z.string().max(300).optional(),
});
export type ComputeResult = z.infer<typeof computeResultSchema>;

/** A single [x, y] sample; y is null where the function is undefined (break). */
export const graphPointSchema = z.tuple([z.number(), z.number().nullable()]);
export type GraphPoint = z.infer<typeof graphPointSchema>;

export const graphSeriesSchema = z.object({
  expression: z.string().max(200),
  points: z.array(graphPointSchema).max(400),
});
export type GraphSeries = z.infer<typeof graphSeriesSchema>;

export const graphViewSchema = z.object({
  xMin: z.number().finite(),
  xMax: z.number().finite(),
  yMin: z.number().finite(),
  yMax: z.number().finite(),
});
export type GraphView = z.infer<typeof graphViewSchema>;

export const graphResultSchema = z.object({
  view: graphViewSchema,
  xTicks: z.array(z.number().finite()).max(40).default([]),
  yTicks: z.array(z.number().finite()).max(40).default([]),
  series: z.array(graphSeriesSchema).min(1).max(4),
  notes: z.string().max(500).optional(),
});
export type GraphResult = z.infer<typeof graphResultSchema>;

/* ─── SSE event contract (server → client) ────────────────────────── */

export type CalcStreamEvent =
  | { type: 'thinking'; text: string }
  | { type: 'result'; data: ComputeResult }
  | { type: 'graph'; data: GraphResult }
  | { type: 'error'; message: string }
  | { type: 'done' };

/**
 * A stable, colour-blind-safe palette for graph series, assigned client-side
 * (index-based) so the look stays consistent and theme-agnostic rather than
 * depending on colours the model might invent.
 */
export const GRAPH_SERIES_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b'] as const;
