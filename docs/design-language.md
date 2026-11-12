# Design language: Steel

> Audience: humans and coding agents. The statement of the language is
> [`design.md`](../design.md) at the repo root; every value, rule and recipe is in
> [`docs/plans/2026-11-11-steel-design-implementation.md`](./plans/2026-11-11-steel-design-implementation.md)
> (the Steel plan, cited here as "the plan"). Where this file disagrees with the plan, the plan wins and
> this file is the bug. For the step-by-step "build a page that fits" checklist see
> [`page-consistency.md`](./page-consistency.md). The old language (Radial Plasmatic Jelly) is kept for the
> record in [`plasmatic-jelly-design-language.md`](./plasmatic-jelly-design-language.md); nothing in it is current.

Steel is a flat, neutral page set in one typeface (Geist) and divided by hairline rules. There are no cards,
gradients, blurs or shadows on content. Polished chrome appears in exactly three places: the navigation globe, the toggle
thumb and the slider thumb. Content hangs on a thin vertical line, the spine. Two editions: Day (`.style-default`, the bare
`:root` tokens) and Night (`.style-graphite`).

## 0. Definition of done for a UI commit

A change is done when all of this is true, in both editions, at 390px and at 1280px:

1. **The recipe.** The page is one of the recipes in plan section 10 (home, post and replies, profile, game page, article,
   conversation, inbox, explore, settings) or, per X2, a titled page of rows on rules with no spine. A gap with no fitting
   recipe is recorded in plan section 18, not invented around.
2. **Flat first (R1, R3).** Content sits on `--site-bg`. A group of things is rows with a 1px `--site-border` rule between
   them, or space. A bordered box is for a control or a picture. No gradient, blur, glow, translucency or shadow, except an
   overlay's shadow (T4) and the three chrome elements (R2).
3. **One ink primary per view (R4).** `<Button variant="primary">` marks the main action; every other button is bordered or
   borderless.
4. **Type is the seven `t-*` classes** (`t-title`, `t-heading`, `t-body`, `t-post`, `t-prose`, `t-label`, `t-meta`),
   weights 400, 500 and 600, sentence case, no letterspaced capitals (Y1, Y2). One `t-title` per page, supplied by
   `PageLayout`.
5. **Tokens only.** Colours, radii and fonts come from the `--site-*` utilities (`bg-site-bg`, `text-site-text-muted`,
   `border-site-border`, `rounded-site`, `rounded-site-sm`). No raw palette colour, hardcoded radius or `transition-all`.
6. **Primitives, not copies.** `components/ui/` first: Button, Input, Select, Tabs, Switch, Slider, Dialog, EmptyState,
   Skeleton (a still block, M6), `useConfirm`, sonner toasts, lucide icons. A hand-rolled tab strip is a bug even without
   `role="tablist"`.
7. **Logical properties** (`ps-*`, `ms-*`, `border-s`, `inset-inline-start`), so the page mirrors in `ar` and `ur` (P5, A6).
8. **Nothing moves at rest (R5, M6).** Motion is a response to input and ends within 360 ms. No `infinite` keyframes, no
   pulse, no hover lift, no frame loop or observer for decoration.
9. **Accessible.** Every text pair 4.5:1 and every control boundary 3:1 (A1); state is never colour alone (A2); touch
   targets 44px (A3); the focus ring is the global one (K10) and is not suppressed.
10. **Every string through `t()`** with a new key when the wording changes (plan section 14).
11. **`pnpm check:consistency` is green**, and you have looked at the page. A green gate means you did not regress an
    enforced rule; it does not mean the page looks right.

## 1. Tokens

`--site-*` names are stable; the values are fixed by plan section 2 and pinned, with their contrast pairs, by
`lib/__tests__/steel-tokens.test.ts`. They live in `app/globals/tokens-themes.css`. There is no accent colour (`--site-accent`
is the ink) and no shadow token. Deleted tokens (`--site-glass-*`, `--site-jelly-*`, `--site-arc-*`, `--site-shadow*`,
`--site-surface-opaque`, `--site-border-bright`, `--site-text-dim`, `--site-accent-dim`) fail `steel-flat.test.ts` anywhere
they reappear. The theme studio and accent presets still write `--site-*` overrides; whether they survive two fixed editions
is an owner decision (plan section 18).

## 2. Editions

Day is `:root` and `.style-default`, Night is `.style-graphite`; the stored ids are historical and unchanged
(`stores/themeStore.ts`). The picker is a two-row radio list in Settings, Look. The pre-paint script stamps the class
before first paint (`lib/prepaint`), so there is no flash.

## 3. Type

One family. `app/styles/steel-type.css` carries the seven classes. `--site-font-display` is the body stack: there is no
display face, so `font-display` utilities mean nothing and were removed in phase 7.

## 4. Surfaces

Roles live in `app/styles/steel-surfaces.css` (plan S6):

| Class                           | What it is                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `surface-overlay`               | The only raised surface: menus, dialogs, popovers, toasts. `--site-surface`, 1px border, 8px radius, the overlay shadow, no blur. Floating UI that is positioned, stacked and edge-anchored must carry it (gate, rule 7) |
| `surface-field`                 | The flat control surface (K4): `--site-surface` fill, 1px border, control radius                                                                                                                                         |
| `surface-chrome`                | A bar: `--site-bg` with a 1px rule on its inner edge                                                                                                                                                                     |
| `surface-press`                 | A pressable host: position and the M1 hover transition only                                                                                                                                                              |
| `surface-card`, `surface-panel` | No background, no border. A `_site` page does not write them. They remain on full-screen games and apps (L8), where `components/shared/app-theme.css` draws them as the app tier's translucent panels                    |

They are in `@layer components`, so a Tailwind utility on the same element wins.

## 5. Controls and the spine

Controls follow plan section 6 (K1 to K11). The spine is `components/ui/spine.tsx` (`Spine`, `SpineItem`, `SpineStation`)
and `spine.css`: pure CSS, one per column, a dot per discrete item, a hollow dot per section heading, dotless items for prose
and forms. What it means on each page is fixed by the recipes (P4); do not invent a meaning.

## 6. The shell

`components/shell/SiteShell.tsx` mounts every `_site` page: a 220px sidebar of the five sections and the docked globe on
desktop, the docked globe alone on a phone, an optional 320px margin (`NoMargin` opts a page out). Top-level routes (games,
login, legal) are full-screen and outside it. `PageLayout` supplies the title block, the optional back link and breadcrumbs,
and the content column; `PageFrame` supplies the column for a page whose content already names itself.

## 7. Motion

Plan section 11: hover and press fills 90 ms, tab underline and toggle 140 ms, chrome activation 280 ms, globe 360 ms,
overlay 160 ms opacity. Nothing else animates. `lib/motion.ts` carries the durations. The one ambient motion is the globe's
idle drift; "Globe motion: On / Still" stamps `html[data-jelly-motion='still']`, which `lib/globe/view.ts` and the games'
ambient canvases read (`motionStill()` in `lib/appearance/prefs.ts`).

## 8. Accessibility

Plan section 12. The skip link is the first focusable element; the focus ring is `outline: 2px solid var(--site-text)`
(K10, with the text-field amendment: on a field the ring sits on its border, and a field with no box shows no ring). The
colour-vision modes retint success and danger, so pair colour with a glyph or a label. Test Day and Night, 390px and
1280px, and once in `ar`.

## 9. Strings

Every string through `t("key", { defaultValue })`. English is authoritative. `defaultValue` is used only when a key is
missing, so a change of wording is a NEW key. Do not put a `{/* ... */}` comment immediately before a `t()` call: the
extractor skips it. A new namespace goes in `NAMESPACES` in `lib/i18n/config.ts`.

## 10. The full-screen tiers (L8)

Games and the `--app-*` apps keep their own look. `components/shared/app-theme.css` is the app tier's token contract and the
adapter that draws `surface-*` roles as app panels; `components/shared/AppShell.tsx` mounts it.

## 11. Do and do not

See plan Appendix B.

## 12. The full-screen viewport contract

`lib/__tests__/game-viewport-consistency.test.ts` scans every game and app directory: a scrolling flex or grid container that
centres on the block axis needs the `-safe` variant; `aspect-ratio` beside a `max-width`/`max-height` clamp defeats the
ratio; a `100vh` height needs a `dvh` or `svh` line after it. Safe-area insets on edge-pinned chrome, DPR clamping on
full-screen canvases and no per-frame canvas reallocation are manual rules.

## 13. What is enforced automatically

`pnpm check:consistency` (`scripts/check-consistency.sh`) runs on every commit through `.githooks/pre-commit` and, in agent
sessions, `.claude/hooks/commit-gate.sh`. It previews these rules against the added lines of the diff, then runs the gates
below, which are the authority.

- **`lib/__tests__/design-consistency.test.ts`**, rules 1 to 4 and 7: one tab-strip grammar (`role="tablist"` only in
  `components/ui/tabs.tsx` and a short, justified allowlist; no `aria-selected` element that also carries a `border-b` or
  `underline` marker; no inline tab `layoutId`; no accent-underline bar shape), and rule 7, no floating surface below
  `surface-overlay` (an element that is positioned, stacked and edge-anchored and carries `surface-card`, `surface-panel`,
  `surface-chrome` or `bg-site-surface`). New tab strips get no allowlist entry.
- **Eslint, rules 5, 6, 8 and 9** (scope in `eslint-local-rules/design-scope.js`, read by `eslint.config.mjs`, the vitest gates
  and `check-consistency.sh`):

  | Rule                                                                                                                                      | eslint rule                     | Scope      |
  | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------- |
  | 5, only section-2 colours: no palette family, `white`, `black` or colour literal                                                          | `local/no-raw-palette-color`    | site tier  |
  | 6, only `rounded-site`, `rounded-site-sm`, `rounded-full`, `rounded-none` or a token                                                      | `local/no-hardcoded-radius`     | site tier  |
  | 8, no `transition-all`                                                                                                                    | `local/no-transition-all`       | whole tree |
  | 9, no `tailwindcss-animate` class (`animate-in`, `fade-in-0`, `zoom-in-95`, ...): the plugin is not installed, so they compile to nothing | `local/no-dead-animate-classes` | whole tree |

- **`steel-tokens.test.ts`** (exact token values, contrast, type classes) and **`steel-flat.test.ts`** (no `backdrop-filter`,
  `filter` or gradient in site-tier CSS except the chrome stylesheets, no deleted token anywhere).
- **`stacking-consistency.test.ts`**: nothing `position: fixed` inside a surface role that could carry a transform; portal it.
- **`ios-edge-contract.test.ts`**: no `theme-color` on iOS, no full-viewport fixed decoration, and a ratchet against any new
  layer pinned flush to the top or bottom edge. `pnpm audit:pages` finds the rest in a real browser.
- **`game-viewport-consistency.test.ts`**, **`filter-cost-budget.test.ts`**, **`appearance-contrast.test.ts`**,
  **`color-vision-a11y.test.ts`**, **`theme-tokens.test.ts`**, **`responsive-layout-contract.test.ts`**,
  **`i18n-catalogs.test.ts`** and **`i18n-config.test.ts`**: the viewport contract, the SVG-filter budget, accent contrast, the
  colour-vision modes, the user-theme contract, the masthead staying inside narrow viewports, and catalog integrity.
- **`doc-pointers.test.ts`**: every path a gate prints exists.

Allowlists and ratchets only shrink. A finding is fixed, not listed.
