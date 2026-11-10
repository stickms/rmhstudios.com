/**
 * Feature manifest (redesign audit A1). Every folder under `features/<id>/`
 * carries a `feature.ts` that default-exports `defineFeature({...})`: what the
 * feature is, which URL prefix it owns, which i18n namespaces it loads, and
 * which catalog entry (`lib/games.ts` / `lib/apps.ts` / `lib/game/registry.ts`)
 * describes it. The manifest is the structured answer to "where does this
 * feature live and what does it own" — later steps (B1 islands, A1 step 7's
 * generated catalog) read it; today it is checked by
 * `lib/__tests__/feature-manifests.test.ts` and changes no runtime behaviour.
 *
 * Server/test-side only: it imports zod at runtime, so client code must not
 * import a `feature.ts` (the manifest is not part of any browser bundle).
 */
import { z } from 'zod';

export const FeatureManifestSchema = z.object({
  /** Folder name under `features/`; kebab-case. */
  id: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(['game', 'app', 'site']),
  /** Route prefix this feature owns, e.g. '/balatro'. B1 uses it to pick island vs shell. */
  basePath: z.string().startsWith('/'),
  /**
   * 'island' = delivered (or to be delivered) as a separately built client bundle (B1);
   * 'shell' = rendered by the site's router. A feature IS an island once it has
   * `features/<id>/island.tsx`: `vite.islands.config.ts` builds that entry and its
   * route serves `renderIslandDocument` (lib/islands/document.server.ts) instead of a
   * component. `lib/__tests__/islands.test.ts` holds both halves to each other.
   */
  delivery: z.enum(['island', 'shell']),
  /** Every route file (relative to the repo root) that is a thin entry into this feature. */
  routes: z.array(z.string()),
  /** i18n namespaces this feature loads (must be registered in lib/i18n/config.ts NAMESPACES). */
  namespaces: z.array(z.string()),
  /** Where the user-facing catalog entry lives, e.g. `lib/catalog/games/void-breaker.ts`. */
  catalog: z.string().optional(),
  /** Hidden/unlisted features say so explicitly (audit Appendix 3). */
  listed: z.boolean().default(true),
});

export type FeatureManifest = z.infer<typeof FeatureManifestSchema>;
export type FeatureManifestInput = z.input<typeof FeatureManifestSchema>;

/** Validate and return a feature manifest. Throws a ZodError on a malformed one. */
export function defineFeature(manifest: FeatureManifestInput): FeatureManifest {
  return FeatureManifestSchema.parse(manifest);
}
