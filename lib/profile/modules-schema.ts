/**
 * Profile v2 — the module schema of record (§12 of
 * docs/plans/2026-07-20-parity-qol-customization-design.md).
 *
 * Unknown kinds/fields are dropped at read time (forward-safe). Empty = the
 * classic profile. Used by the profile API routes and `lib/profile/*.server.ts`;
 * the editor and renderer import the zod-free catalog in `./modules` instead.
 */
import { z } from 'zod';

import { MAX_MODULES, TOP_FOUR_SIZE, type ModuleKind } from './modules';

export const topFourItemSchema = z.object({
  kind: z.enum(['game', 'app']),
  id: z.string().min(1).max(64),
});
export type TopFourItem = z.infer<typeof topFourItemSchema>;

// Per-kind config (kept small + serializable).
const configByKind = {
  about: z.object({ text: z.string().max(600).default('') }),
  stats: z.object({}).strip(),
  status: z.object({}).strip(),
  wishlist: z.object({}).strip(),
  'slice-it': z.object({}).strip(),
  'top-four': z.object({ items: z.array(topFourItemSchema).max(TOP_FOUR_SIZE).default([]) }),
  now: z.object({}).strip(),
  stamps: z.object({}).strip(),
  webrings: z.object({}).strip(),
  endorsements: z.object({}).strip(),
  counter: z.object({}).strip(),
} as const;

export const moduleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('about'), config: configByKind.about }),
  z.object({ kind: z.literal('stats'), config: configByKind.stats.optional().default({}) }),
  z.object({ kind: z.literal('status'), config: configByKind.status.optional().default({}) }),
  z.object({ kind: z.literal('wishlist'), config: configByKind.wishlist.optional().default({}) }),
  z.object({
    kind: z.literal('slice-it'),
    config: configByKind['slice-it'].optional().default({}),
  }),
  z.object({
    kind: z.literal('top-four'),
    config: configByKind['top-four'].optional().default({ items: [] }),
  }),
  z.object({ kind: z.literal('now'), config: configByKind.now.optional().default({}) }),
  z.object({ kind: z.literal('stamps'), config: configByKind.stamps.optional().default({}) }),
  z.object({ kind: z.literal('webrings'), config: configByKind.webrings.optional().default({}) }),
  z.object({
    kind: z.literal('endorsements'),
    config: configByKind.endorsements.optional().default({}),
  }),
  z.object({ kind: z.literal('counter'), config: configByKind.counter.optional().default({}) }),
]);

export type ProfileModule = z.infer<typeof moduleSchema>;

export const layoutSchema = z.object({
  modules: z.array(moduleSchema).max(MAX_MODULES),
});

/**
 * Parse a stored modules JSON into a safe list — invalid/unknown entries are
 * dropped rather than trusted, and the list is capped.
 */
export function parseLayout(raw: unknown): ProfileModule[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileModule[] = [];
  for (const entry of raw) {
    const parsed = moduleSchema.safeParse(entry);
    if (parsed.success) out.push(parsed.data);
    if (out.length >= MAX_MODULES) break;
  }
  return out;
}

/**
 * Add or drop a module of `kind` in a layout, preserving order, the cap and any
 * existing config. Pure — used by the server when a feature is switched on or
 * off from settings so the profile shows what the member just configured.
 */
export function withModule(
  modules: readonly ProfileModule[],
  kind: ModuleKind,
  present: boolean,
): ProfileModule[] {
  const has = modules.some((m) => m.kind === kind);
  if (present === has) return [...modules];
  if (!present) return modules.filter((m) => m.kind !== kind);
  if (modules.length >= MAX_MODULES) return [...modules];
  const created = moduleSchema.safeParse(kind === 'about' ? { kind, config: {} } : { kind });
  return created.success ? [...modules, created.data] : [...modules];
}
