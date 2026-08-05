/**
 * The catalog entry contracts — the shape every file under `lib/catalog/games/`
 * and `lib/catalog/apps/` must satisfy.
 *
 * These are **zod schemas first and TypeScript types second** on purpose. The
 * catalog is the single source of truth for what the site ships, and its
 * entries are hand-written data, not code: a typo in `iconName`, a missing
 * `href`, or an extra key left behind by a copy-paste used to render as a blank
 * or broken card in production with nothing failing anywhere. Parsing every
 * entry at module load (see `lib/catalog/index.ts`) turns that class of mistake
 * into an immediate, loud failure in dev, in CI and in the build.
 *
 * The object schemas are **strict**: an unknown key is an error rather than
 * silently ignored data. That is the half of the check that catches the real
 * mistake — `imgPath` instead of `imagePath` type-checks nowhere and would
 * otherwise just never render.
 *
 * The types are derived with `z.infer` so there is exactly one declaration of
 * the shape. `GameInfo`/`AppInfo` keep their names and their mutable-array
 * exports so every existing consumer of `@/lib/games` and `@/lib/apps` compiles
 * unchanged.
 */

import { z } from 'zod';

/**
 * Fields shared by both catalogs. Games and apps started as copies of one
 * another and have stayed structurally identical apart from a few app-only
 * flags, so the common half lives here and each catalog extends it.
 */
const catalogEntryShape = {
  /** Stable id. Also the join key for scoring rules, capabilities, wagers and
   *  arcade challenges — renaming one is a data migration, not a rename. */
  id: z.string().min(1),
  /**
   * Display order within the catalog. Explicit rather than implied by file
   * order because the barrel imports alphabetically: that way adding an entry
   * appends one line to a sorted list instead of editing a hand-ordered array,
   * which is the merge conflict this split exists to remove.
   */
  order: z.number().int().nonnegative(),
  title: z.string().min(1),
  /** Card blurb — one or two sentences. */
  description: z.string().min(1),
  /** Detail-page copy; also what the SEO/knowledge-base generators read. */
  longDescription: z.string().min(1),
  /** Site-relative path, or an absolute URL for off-site entries. */
  href: z.string().min(1),
  /** Free-text badge ("Playable", "Beta", …). Absent means no badge. */
  status: z.string().min(1).optional(),
  cta: z.string().min(1),
  isSteam: z.boolean(),

  // Homepage card styling
  /** Tailwind gradient stops for the homepage card. */
  gradient: z.string().min(1),
  /** A Lucide icon name — each consumer maps it to a React element with
   *  whatever size/style it needs. Spelling is checked against `lucide-react`
   *  in `lib/__tests__/catalog.test.ts` rather than here, so the catalog does
   *  not drag the whole icon set into every bundle that reads it. */
  iconName: z.string().min(1),

  // Index page styling
  color: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
  imagePath: z.string().min(1).optional(),
  /** Whether the entry requires a signed-in account to open. */
  authGate: z.boolean(),
  /** Hidden from the public index but reachable by direct link. */
  unlisted: z.boolean().optional(),
} as const;

export const gameEntrySchema = z.strictObject(catalogEntryShape);

export const appEntrySchema = z.strictObject({
  ...catalogEntryShape,
  /** Keep the global RMH Studios theme/shell enabled for integrated site apps. */
  usesSiteTheme: z.boolean().optional(),
  hidden: z.boolean().optional(),
});

export type GameInfo = z.infer<typeof gameEntrySchema>;
export type AppInfo = z.infer<typeof appEntrySchema>;
