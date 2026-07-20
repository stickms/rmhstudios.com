/**
 * Profile v2 — the module catalog (§12 of
 * docs/plans/2026-07-20-parity-qol-customization-design.md).
 *
 * A profile showcase is an ordered list of typed blocks. This is the schema of
 * record: unknown kinds/fields are dropped at read time (forward-safe). Empty =
 * the classic profile. Client-safe (editor + renderer + API).
 */
import { z } from 'zod';

export const MAX_MODULES = 6;

export const MODULE_KINDS = ['about', 'stats', 'status', 'wishlist'] as const;
export type ModuleKind = (typeof MODULE_KINDS)[number];

// Per-kind config (kept small + serializable).
const configByKind = {
  about: z.object({ text: z.string().max(600).default('') }),
  stats: z.object({}).strip(),
  status: z.object({}).strip(),
  wishlist: z.object({}).strip(),
} as const;

export const moduleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('about'), config: configByKind.about }),
  z.object({ kind: z.literal('stats'), config: configByKind.stats.optional().default({}) }),
  z.object({ kind: z.literal('status'), config: configByKind.status.optional().default({}) }),
  z.object({ kind: z.literal('wishlist'), config: configByKind.wishlist.optional().default({}) }),
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

export const MODULE_LABELS: Record<ModuleKind, string> = {
  about: 'About',
  stats: 'Stats',
  status: 'Status',
  wishlist: 'Wishlist',
};
