/**
 * Saved views (B8) — client-safe schemas.
 *
 * `SavedSearch` already stored a query for the search page. Every *other* list
 * on the site — `/rmhladder`, `/homes`, `/market`, `/arcade`, the admin queues
 * — rebuilds its filter state from URL params and forgets it, so someone
 * checking the same three ladder filters daily re-enters them daily.
 *
 * The load-bearing decision is **validate at READ time, and drop what no longer
 * fits**. A saved view outlives the surface that created it: a filter gets
 * removed, a sort option is renamed, and every view that mentioned it is now
 * carrying a key nothing understands. Throwing there means one stale row breaks
 * the page for its owner, with no way to fix it from the UI. Dropping the
 * unknown key degrades the view to "mostly what you saved", which is what a
 * person would want.
 */

import { z } from 'zod';

/** The surfaces that can hold a saved view. `search` is the original behaviour. */
export const VIEW_SURFACES = ['search', 'ladder', 'homes', 'market', 'arcade'] as const;
export type ViewSurface = (typeof VIEW_SURFACES)[number];

export function isViewSurface(value: unknown): value is ViewSurface {
  return typeof value === 'string' && (VIEW_SURFACES as readonly string[]).includes(value);
}

/**
 * One schema per surface.
 *
 * Every field is optional and every collection is bounded. A saved view is
 * user-controlled data that gets turned into a database query, so the bounds
 * are not cosmetic: an unbounded `keywords` array is an unbounded `IN` clause.
 */
export const VIEW_SCHEMAS = {
  search: z.object({
    q: z.string().max(200).optional(),
    types: z.array(z.string().max(24)).max(10).optional(),
  }),
  ladder: z.object({
    keywords: z.array(z.string().max(40)).max(20).optional(),
    remote: z.boolean().optional(),
    minScore: z.number().min(0).max(100).optional(),
    company: z.string().max(80).optional(),
  }),
  homes: z.object({
    maxPrice: z.number().min(0).max(100_000_000).optional(),
    minBeds: z.number().int().min(0).max(20).optional(),
    city: z.string().max(80).optional(),
    maxCommuteMin: z.number().int().min(0).max(240).optional(),
  }),
  market: z.object({
    tag: z.string().max(40).optional(),
    sort: z.enum(['new', 'price', 'ending']).optional(),
    maxCoins: z.number().int().min(0).optional(),
  }),
  arcade: z.object({
    tags: z.array(z.string().max(30)).max(10).optional(),
    players: z.number().int().min(1).max(16).optional(),
    sort: z.enum(['new', 'popular', 'title']).optional(),
  }),
} as const satisfies Record<ViewSurface, z.ZodType>;

export type ViewPayload<S extends ViewSurface> = z.infer<(typeof VIEW_SCHEMAS)[S]>;

/**
 * Parse a stored payload, dropping anything the surface no longer declares.
 *
 * Never throws. An unparseable payload becomes an empty view — the list renders
 * unfiltered, which is a recoverable state the owner can re-save from.
 */
export function parseViewPayload<S extends ViewSurface>(
  surface: S,
  payload: unknown,
): ViewPayload<S> {
  const schema = VIEW_SCHEMAS[surface];
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};

  // Per-key rather than whole-object: `safeParse` on the whole payload fails
  // the ENTIRE view when one field is stale, which is the outcome this exists
  // to avoid. Keys the schema no longer knows are simply not copied.
  const shape = (schema as unknown as z.ZodObject<z.ZodRawShape>).shape;
  const out: Record<string, unknown> = {};
  for (const [key, fieldSchema] of Object.entries(shape)) {
    const value = (source as Record<string, unknown>)[key];
    if (value === undefined) continue;
    const parsed = (fieldSchema as z.ZodType).safeParse(value);
    if (parsed.success) out[key] = parsed.data;
  }
  return out as ViewPayload<S>;
}

/** Which stored keys a surface no longer understands — for a "this view is stale" hint. */
export function droppedKeys(surface: ViewSurface, payload: unknown): string[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const shape = (VIEW_SCHEMAS[surface] as unknown as z.ZodObject<z.ZodRawShape>).shape;
  return Object.keys(payload as Record<string, unknown>).filter((k) => !(k in shape));
}

/** Most saved views a user may keep per surface, so the list stays navigable. */
export const MAX_VIEWS_PER_SURFACE = 20;

export const savedViewInputSchema = z.object({
  surface: z.enum(VIEW_SURFACES),
  name: z.string().trim().min(1).max(60),
  payload: z.record(z.string(), z.unknown()),
  alerts: z.boolean().optional(),
});
export type SavedViewInput = z.infer<typeof savedViewInputSchema>;
