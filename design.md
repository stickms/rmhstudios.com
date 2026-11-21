# The RMH Studios Design Language

**Steel.**

Steel is a flat, neutral page set in one typeface and divided by hairline rules. There are no cards, gradients, blurs or
shadows on content. Polished chrome is the only material, and it appears in exactly three places: the navigation globe,
the toggle thumb and the slider thumb. Content hangs on a thin vertical line, the spine. The result should read as a
professional tool that happens to have one remarkable object in it.

This file is the short statement of the language. The single source for every value, rule and phase is
[`docs/plans/2026-11-11-steel-design-implementation.md`](docs/plans/2026-11-11-steel-design-implementation.md) (the
Steel plan). Where this file and the plan disagree, the plan wins and this file is the bug. Steel replaces Plasmatic
Jelly and the Broadsheet brief; the documents that describe those
([`docs/archive/2026/plasmatic-jelly-design-language.md`](docs/archive/2026/plasmatic-jelly-design-language.md),
[`docs/archive/2026/plasmatic-jelly-system.md`](docs/archive/2026/plasmatic-jelly-system.md)) are historical.
[`docs/design-language.md`](docs/design-language.md) is the working reference: the definition of done and the gates.

The plan is executed one phase at a time (its section 16). Phases 1 to 7 are in: the values and type classes below are
real; every `_site` page sits in `components/shell/SiteShell.tsx` (a sidebar of the sections on desktop, the docked
globe on a phone, an optional margin; `/sections` is the no-script list); controls, overlays, the spine and the page
recipes are built; phase 6 deleted the old material and shell (`components/radial/`, `lib/jelly/`, `lib/liquid/`,
`lib/eversion/`, the WebAssembly kernels, the glass, jelly and arc stylesheets, the page entrances); and phase 7 removed
the dead names it left (`data-jelly*` other than `data-jelly-motion`, the `Reveal` wrappers) and renamed the `glass-*`
role classes to the plan's S6 names. A `_site` page writes only `surface-overlay`, `surface-field`, `surface-chrome` and
`surface-press` (`app/styles/steel-surfaces.css`); `surface-card` and `surface-panel` remain on full-screen games and
apps only, where `components/shared/app-theme.css` draws them (L8).

## 1. The five rules

| ID  | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Flat first.** Page, surfaces and content use solid colours from the tokens below. No gradient, blur, glow or translucency outside the chrome elements in R2. Amended 2026-11-17 (owner): a bought user theme may show its own colours as two quiet gradients, a faint glow wash behind the whole page ground (held to the viewport as the page scrolls) and a gentle sheen on the ink primary (`--site-theme-wash`, `--site-accent-fill`, derived only in `lib/themes/tokens.ts`), and on a profile an equipped shop theme's gradient as a quiet wash behind the header (`--profile-theme-gradient`, `components/profile/profile.css`). Without a user theme the page is flat. Amended 2026-11-19 (owner): purchased elements, a bought name colour and avatar frame, may be a gradient when it is subtle and gradual: at most three colours, neighbouring colours within 60° of hue (analogous, never a spectrum), never animated (`lib/shop/catalog.ts`, held by `lib/__tests__/cosmetic-gradients.test.ts`). |
| R2  | **Chrome in three places.** The globe, the toggle thumb, the slider thumb. Nothing else is chrome: not buttons, bars, cards, avatars or icons.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| R3  | **Rules before boxes.** Separate things with a 1px rule or with space. A bordered box is for a control (button, field) or a picture, not for a group.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| R4  | **One ink primary per view.** One solid-ink button marks the main action. Everything else is a bordered or borderless button.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| R5  | **Nothing moves at rest.** No idle animation, frame loop, canvas, worker or observer runs for decoration. Motion is a response to input and ends within 360 ms.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## 2. Tokens

The `--site-*` names stay, so `bg-site-bg`, `text-site-text-muted`, `border-site-border` and `rounded-site` keep
working; only the values changed. Day is `:root` and `.style-default`, Night is `.style-graphite`. The values live in
`app/globals/tokens-themes.css` and are pinned, with the contrast pairs, by `lib/__tests__/steel-tokens.test.ts`.

| Token                  | Day       | Night     | Use                                     |
| ---------------------- | --------- | --------- | --------------------------------------- |
| `--site-bg`            | `#fafafa` | `#0b0d10` | The page                                |
| `--site-surface`       | `#ffffff` | `#111418` | Controls and overlays only              |
| `--site-bg-subtle`     | `#f0f2f4` | `#161a1f` | Hover fill, picture placeholder         |
| `--site-surface-hover` | `#f0f2f4` | `#161a1f` | Same value, kept for existing utilities |
| `--site-border`        | `#e3e6e9` | `#22272d` | Every rule and control border           |
| `--site-text`          | `#0b0d10` | `#eef1f4` | Ink                                     |
| `--site-text-muted`    | `#606873` | `#8b949e` | Secondary text, inactive tabs           |
| `--site-accent`        | `#2563eb` | `#6ea8fe` | The accent: blue (owner, 2026-11-19)    |
| `--site-accent-fg`     | `#ffffff` | `#0b0d10` | Text on an accent fill                  |
| `--site-danger`        | `#c40016` | `#f2555a` | Errors, destructive actions             |
| `--site-notify`        | `#ff5c7a` | `#ff5c7a` | Unread counts and dots, in every theme  |
| `--site-notify-fg`     | `#0b0d10` | `#0b0d10` | Text on a notify fill                   |
| `--site-success`       | `#167d3a` | `#3fb26b` | Confirmation only                       |
| `--site-radius`        | `8px`     | `8px`     | Controls, pictures                      |
| `--site-radius-sm`     | `4px`     | `4px`     | Tags, small chips                       |
| `--chrome-flat`        | `#737c87` | `#6b7480` | A chrome thumb at rest                  |
| `--chrome-1` to `-6`   | see plan  | see plan  | The six stops of the chrome gradient    |

There are no shadow tokens: the only shadows are the globe's and an overlay's (`0 8px 24px rgba(0,0,0,.12)`, Night
`.5`). The old glass, jelly, arc and shadow tokens are deleted, as are the opaque-surface, bright-border, dim-text and
dim-accent tokens: use `--site-surface`, `--site-text`, `--site-text-muted` and `--site-bg-subtle` (Appendix A of the
plan). Every text pair holds 4.5:1 in both editions. Do not introduce a lighter grey for text.

## 3. Type

One family, **Geist**, with **Geist Mono** for timestamps, counts and small data. There is no display face
(`--site-font-display` is the body stack). Seven classes carry every size (`app/styles/steel-type.css`):

| Class       | Size / line    | Weight     | Tracking | Use                                  |
| ----------- | -------------- | ---------- | -------- | ------------------------------------ |
| `t-title`   | 28 / 1.1       | 600        | -0.025em | The page's name. One per page.       |
| `t-heading` | 17 / 1.3       | 600        | -0.01em  | A section inside a page              |
| `t-body`    | 14 / 1.45      | 400        | 0        | Default text and controls            |
| `t-post`    | 15 / 1.5       | 400        | 0        | Post text                            |
| `t-prose`   | 16 / 1.6       | 400        | 0        | Long reading                         |
| `t-label`   | 13 / 1.3       | 600, muted | 0        | Spine station, sidebar group heading |
| `t-meta`    | 12 / 1.3, mono | 400, muted | 0        | Time, kind, handle metadata          |

Weights are 400, 500 (controls) and 600, never 700 or above (Y1). No letterspaced capitals anywhere; labels are sentence
case (Y2). Links inside running text are underlined, navigation words are not (Y3).

## 4. Surfaces, controls, structure

Content sits on `--site-bg`; a list is rows on 1px rules; columns are divided by a 1px vertical rule; pictures take
`--site-bg-subtle`, a 1px border and 8px radius. An overlay (menu, dialog, popover) is the only raised surface:
`--site-surface`, 1px border, 8px radius, the overlay shadow, no blur; the scrim behind a dialog is `--site-bg` at 80%.
Controls are 8px radius, 1px border, 500 weight, 14px text, 36px high (44px on touch). The focus ring is
`outline: 2px solid var(--site-text); outline-offset: 2px` on every focusable element (K10). A page's one structural
signature is the spine, a 1px vertical line with a dot per item and a hollow dot per section heading. Phone navigation
is the globe alone; desktop navigation is a word list in a left sidebar. Controls (plan section 6), the spine (7), the
globe and shell (8, 9) and the page recipes (10) are specified in the plan.

## 5. What the code enforces

- `pnpm check:consistency` is the commit gate. Its executable gates are in `lib/__tests__/`: `steel-tokens.test.ts`
  (exact token values, contrast, type classes), `steel-flat.test.ts` (no `backdrop-filter`, `filter` or gradient in
  site-tier CSS except the chrome stylesheets, no deleted token anywhere), `design-consistency.test.ts` (one tab-strip
  grammar, no eyebrows, CSS debt ratchets) and `ios-edge-contract.test.ts`.
- The eslint rules `local/no-raw-palette-color` (only section-2 colours: no palette families, `white`, `black` or colour
  literals), `local/no-hardcoded-radius` (only `rounded-site`, `rounded-site-sm`, `rounded-full`, `rounded-none`, or a
  token), `local/no-transition-all` and `local/no-dead-animate-classes`. The files that still break the first two are in
  `STEEL_PALETTE_BASELINE` in `eslint-local-rules/design-scope.js`, each with the phase that removes it.
- Full-screen games and the `--app-*` apps are outside the site design and keep their own look (L8):
  `components/shared/app-theme.css` carries the literal palette the app tier read from the old site tokens.

## 6. Words

Say the specific thing in short sentences. No exclamation marks, no "seamless / powerful / unleash", no emoji in site
chrome, no invented numbers. Buttons are a verb or a verb and a noun ("Post", "Write a post", "Join"). An error says
what happened and what to do next. Every string goes through `t()` with a new key when the wording changes.

## 7. Link previews

Every public page unfurls as itself. A link pasted into Discord, iMessage or X is the first thing most people see of a
page, so its Open Graph data is part of the page's design, not metadata to fill in later.

- **Personal.** The title and description name this page, in the page's own words, not the site's tagline. A page about
  one thing (a post, a profile, a game, a book, a deck) shows that thing: its card comes from `ogCardPath(kind, id)` or
  `definePage`'s `ogCard`, and draws the thing's own picture where it has one.
- **Relevant.** Any other page resolves to a section card in `lib/og/static-cards.ts`: an eyebrow saying what kind of
  page it is, a title and subtitle in the copy rules of §6, and the section's own picture where it has one. No public
  page except the home page falls back to the site-wide default card.
- **One path.** `head()` goes through `buildMeta` (directly or through `definePage`, `gameRouteHead`, `appRouteHead`,
  `appHubHead`), which owns the whole `og:*` and `twitter:*` block. Never hand-roll those tags.
- **Private pages are exempt.** Routes the sitemap excludes (admin, settings, composers, capability links) are not
  shared publicly; they set `noindex` instead.

- **Drawn in Steel.** A card is this design on a 1200×630 page: flat `--site-bg`, the favicon as the mark, 1px rules
  between the brand row, body and footer, Geist at 400/500/600, a picture in a bordered `--site-bg-subtle` box. The
  renderers share one frame (`lib/og/chrome.server.tsx`), so a card type never improvises its own look.

`lib/__tests__/og-page-coverage.test.ts` holds this for every route the sitemap lists as public, with a backlog that
only shrinks. The card system itself is documented in [`docs/open-graph.md`](docs/open-graph.md).
