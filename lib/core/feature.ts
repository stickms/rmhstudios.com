/**
 * Feature manifest (redesign audit A1). Every folder under `features/<id>/`
 * carries a `feature.ts` that default-exports `defineFeature({...})`: what the
 * feature is, which URL prefix it owns, which i18n namespaces it loads, and
 * where its catalog entry (the card and scoring rules
 * `lib/catalog` serve) lives. The manifest is the structured
 * answer to "where does this feature live and what does it own" — B1 islands
 * read it; it is checked by `lib/__tests__/feature-manifests.test.ts` and changes
 * no runtime behaviour.
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
  /** 'island' = separately built client bundle (B1); 'shell' = rendered inside _site. */
  delivery: z.enum(['island', 'shell']),
  /** Every route file (relative to the repo root) that is a thin entry into this feature. */
  routes: z.array(z.string()),
  /** i18n namespaces this feature loads (must be registered in lib/i18n/config.ts NAMESPACES). */
  namespaces: z.array(z.string()),
  /** The feature's own catalog entry, `features/<id>/catalog.ts` (composed by `lib/catalog/index.ts`). */
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
