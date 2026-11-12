/**
 * The site-tier exemption policy — the ONE list.
 *
 * Read by `eslint.config.mjs` (scopes `local/no-raw-palette-color` and
 * `local/no-hardcoded-radius`), by `isSiteTier()` below, by the vitest gates in
 * `lib/__tests__/` (`design-consistency`, `jelly-coverage`, `jelly-ownership`,
 * `ios-edge-contract`) and by `scripts/check-consistency.sh`, which awk-parses
 * the two `new Set([...])` blocks — keep their shape: one quoted name per
 * line, closed by `]);`.
 *
 * An entry comes out of these lists; it does not go in.
 */

/**
 * Rules 5–7 scan the SITE tier only (rules 8 and 9 run over the whole tree —
 * see their notes below). The full-screen games and the `--app-*`
 * apps are exempt from the `--site-*` palette by design (design-language.md §12
 * and the "games with a bespoke visual identity" note in §12) — Temple of Joy is
 * SUPPOSED to be candlelit, and forcing it onto site tokens would make it look
 * like a different product, not a more consistent one. This is the same split
 * `lib/catalog` publishes; it is duplicated here rather than
 * imported because those modules pull in far more than a static scan needs.
 *
 * `rmhladder`, `rmhcalculator` and `homes` are NOT listed: they are `usesSiteTheme`
 * apps and are held to the site contract. Nor are `shared` (the app-tier kit:
 * `AppShell`, `app-theme.css`), `studio` and `rmhcode` (redesign E3): an app is on
 * the same contract as a site page, with `--app-*` tokens and a palette override
 * (an `--app-*` declaration in its own stylesheet) in place of `--site-*`.
 * The site pages that used to sit here (`history`, `lockdown` — the legal pages —
 * and `blm`) and the game render helpers (`render`) came out with it.
 *
 * What is left beyond the games is the queue for E3: apps still carrying
 * eyebrows or edge-pinned modals (`rmhbox` … `rmhvibe`, `tf2-hud`), the
 * RMH Strategies app (`doctrine`), and the one-off pages with an owner-asked
 * art direction of their own, which are an A2 decision (archive, or an island),
 * not a token swap.
 */
export const FULLSCREEN_TIER_DIRS = new Set([
  // Games (their own palettes / scoped variable groups in globals.css)
  'altair',
  'cursed-logic',
  'daily-puzzles',
  'dream-rift',
  'gabriels-horn',
  'hearthworks',
  'house-always-wins',
  'kowloon-knockout',
  'laundry-sort',
  'lights-out',
  'neon-driftway',
  'nightrail',
  'signal-forge',
  'slice-it',
  'synapse-storm',
  'temple-of-joy',
  'vega',
  'velum2099',
  'versecraft',
  'void-breaker',
  // The `--app-*` full-screen app tier
  'rmhbox',
  'rmhmusic',
  'rmhstudy',
  'rmhtube',
  'rmhtype',
  'tf2-hud',
  // The TF2 / HL2 / Portal in-game HUDs: each draws its game's own HUD (TF2's
  // default HUD colours, HL2's amber suit, Portal's blue/orange) from scoped
  // `--tf2g-*` / `--hl2g-*` / `--ptl-*` groups in `components/tf2-game/tf2-game.css`;
  // their menus use the TF2 Hub's `--app-*` palette like `tf2-hud`.
  'tf2-game',
  // Half-Life 2 / Portal play pages (chapter select around the shared game canvas),
  // in the same scoped HL2 / Portal variants of that palette.
  'sp-game',
  // CS:GO (de_dust2) on the same engine: its own in-game HUD and lobby, on the TF2 Hub's
  // `--app-*` palette with scoped `--csg-*` team colours (components/csgo-game/cs-hud.css).
  'csgo-game',
  'rmhvibe',
  // An unlisted scheduling board for one Pathfinder 2e table, asked for as
  // "minimal, Apple-style, whites and blacks". It has no relationship to the
  // site's themes — it declares its own `--pf2e-*` group in
  // `components/pf2ecal/pf2ecal.css` and paints an opaque ground over the
  // viewport — so holding it to `--site-*` would make it a different page, not
  // a more consistent one.
  'pf2ecal',
  // The MCU + Dune marathon planner, asked for by name in Frutiger Aero —
  // glossy aqua glass, sky gradients, bubbles, Vista window chrome. It declares
  // its own `--ds-*` group in `components/dunesday/dunesday.css` (with a Night
  // variant) and paints its own sky over the viewport, so the site themes have
  // nothing to say about it.
  'dunesday',
  // Standalone campaign/marketing arms with their own art direction
  'covid',
  // The election hub, asked for as neo-brutalist: paper ground, 3px ink borders, hard offset shadows,
  // square corners, stretched Archivo display type and flat saturated party colours. It declares its
  // own `--el-*` group in `components/elections/elections.css` (the party colours are data, not
  // theme: red/blue must mean the same thing in every theme), so the site tokens have nothing to say.
  'elections',
  'doctrine',
  'rmh-capital',
  'rmh-pmc',
  // A single-purpose page that pastiches another site's fixed palette. It has
  // no theme to be consistent with — that is the whole point of it.
  'sohumbum',
  // The live activity dossier. It reports on Discord and is drawn in Discord's
  // own greys, blurple and — the part that matters — its four status colours, so
  // a green dot here means what a green dot means in the client. Re-tinting
  // those to the site accent would break the only vocabulary the page relies on
  // its readers already having. Declares its own `--stk-*` group in
  // `components/sohumtracker/sohumtracker.css`.
  'sohumtracker',
  // The games library — a literal Steam palette, flat, in `components/steam/steam.css`
  // (`--stm-*` tokens); no site glass, jelly or `--site-*` surfaces.
  'steam',
]);

/** Top-level route trees that are full-screen experiences, not `_site` pages. */
export const FULLSCREEN_ROUTE_SEGMENTS = new Set([
  'altair',
  'daily',
  'discord',
  'dream-rift',
  // The games library: `games.tsx` + `games/**` — a directory, not flat
  // `games.community.tsx` files, because the segment is read off the first path part.
  'games',
  // The marathon planner — see the note beside `dunesday` above.
  'dunesday',
  'gabriels-horn',
  'hearthworks',
  'house-always-wins',
  'kowloon-knockout',
  'laundry-sort',
  'neon-driftway',
  'nightrail',
  // The PF2e table's board — see the note beside `pf2ecal` above.
  'pf2ecal',
  'rmhbox',
  'rmhmusic',
  'rmhstudy',
  'rmhtube',
  'rmhtype',
  'secret',
  'slice-it',
  'sohumbum',
  // The live activity dossier — see the note beside `sohumtracker` above.
  'sohumtracker',
  'strategies',
  'synapse-storm',
  'temple-of-joy',
  'velum2099',
  'versecraft',
  'void-breaker',
]);

/**
 * The one site-tier file permitted to name raw palette colours.
 * `/login` renders third-party sign-in buttons, and a provider's mark is its own
 * brand asset: Discord blurple and Google red are not ours to theme. Everything
 * else on that page is on tokens.
 */
export const RAW_COLOR_ALLOW = ['app/routes/login.tsx'];

/** True when a repo-relative `.tsx` path under `components/` or `app/routes/` is held to the `--site-*` contract. */
export function isSiteTier(file) {
  const parts = file.split(/[\\/]/);
  // `features/<id>/ui/...` (redesign A1) is the feature's old `components/<id>/...`.
  if (parts[0] === 'components' || parts[0] === 'features')
    return !FULLSCREEN_TIER_DIRS.has(parts[1] ?? '');
  // app/routes/<seg>/... or app/routes/<seg>.tsx
  const seg = (parts[2] ?? '').replace(/\.tsx$/, '');
  return !FULLSCREEN_ROUTE_SEGMENTS.has(seg);
}

/**
 * Steel phase 1 tightened `local/no-raw-palette-color` (now also `white`, `black` and colour literals in arbitrary
 * values) and `local/no-hardcoded-radius` (now also side variants and literal arbitrary radii), so that only the
 * section-2 tokens are allowed (docs/plans/2026-11-11-steel-design-implementation.md §17). These are the site-tier files
 * that already broke the tightened rules. The list is a ratchet, like the CSS debt in `design-consistency.test.ts`:
 * entries come OUT when the named phase rewrites the file, they never go in, and a new file is held to the rule from its
 * first line. The value says which phase removes the entry and why it is there. `lib/__tests__/steel-flat.test.ts`
 * fails when an entry no longer breaks a rule, so the list cannot go stale.
 */
export const STEEL_PALETTE_BASELINE = {
  // Phase 5 (recipes): the article and profile pages.
  'components/blog/ShareButton.tsx': 'phase 5: article recipe',
  'components/creator-studio/AnalyticsDashboard.tsx': 'phase 7: long tail (rounded-t-sm chart bars)',
  'components/library/LibraryCollections.tsx': 'phase 5: catalogue recipe (book-spine radius)',
  'app/routes/_site/library/index.tsx': 'phase 5: catalogue recipe (book-spine radius)',
  'components/news/NewsHero.tsx': 'phase 5: article recipe (blob radius)',
  // Phase 7 (long tail): pages with no recipe yet, and the app-tier kit that moves under L8.
  'components/party/PhoneControllerHost.tsx': 'phase 7: long tail',
  'components/rideshare/RideMap.tsx': 'phase 7: long tail',
  'components/rideshare/RideChat.tsx': 'phase 7: long tail (rounded-br-sm bubble tails)',
  'components/rmhcoins/PlinkoGame.tsx': 'phase 7: long tail (casino keeps its own scheme)',
  'features/casino/ui/RouletteTable.tsx': 'phase 7: long tail (casino keeps its own scheme)',
  'components/kaikai-debt/stats/RhythmHeatmap.tsx': 'phase 7: long tail',
  'components/studio/plugins/FaderControl.tsx': 'phase 7: app tier (L8), moves under FULLSCREEN_TIER_DIRS',
  'components/shared/ChatPanel.tsx': 'phase 7: app-tier kit (L8)',
  'components/shared/DesktopControlsGate.tsx': 'phase 7: app-tier kit (L8)',
  'components/shared/GameErrorBoundary.tsx': 'phase 7: app-tier kit (L8)',
  'components/shared/GameLoadingFallback.tsx': 'phase 7: app-tier kit (L8)',
  'components/shared/WebGLUnavailable.tsx': 'phase 7: app-tier kit (L8)',
  'components/user-builds/TechBadges.tsx': 'phase 7: long tail',
  'app/routes/v.$slug.tsx': 'phase 7: long tail (vibe player)',
};

/** Files the class-string rules that run on the WHOLE tree look at (`transition-all`, dead animate classes). */
export const ALL_TIER_FILES = [
  'components/**/*.tsx',
  'features/*/ui/**/*.tsx',
  'app/routes/**/*.tsx',
];

/** Test and generated files no class-string rule looks at. */
export const CLASS_RULE_IGNORES = ['**/__tests__/**', '**/*.test.tsx'];

/** The full-screen tier as flat-config `ignores`, so site-tier rules skip exactly what `isSiteTier` skips. */
export const FULLSCREEN_IGNORES = [
  ...[...FULLSCREEN_TIER_DIRS].flatMap((d) => [`components/${d}/**`, `features/${d}/**`]),
  ...[...FULLSCREEN_ROUTE_SEGMENTS].flatMap((s) => [`app/routes/${s}/**`, `app/routes/${s}.tsx`]),
];

/** The Steel baseline as flat-config `ignores` for the two tightened rules. */
export const STEEL_BASELINE_IGNORES = Object.keys(STEEL_PALETTE_BASELINE);
