# Theme carousel — one picker for editions and bought themes

Approved by the owner 2026-11-18. Answers Steel plan D11 for the theme half: bought themes stay, and they sit in
the same picker as the two editions rather than in a second row on top of them.

## Intent

Settings → Look had two dropdowns, "Theme" (Day / Night) and "Bought themes" (None / owned themes), and a bought
theme was laid over whichever edition was last chosen. A light theme over Night left the page marked dark, so the
globe's environment, `color-scheme` readers and anything else keyed off `.style-graphite` disagreed with what was on
screen. The owner found the split "wonky".

## Design

- **One row, "Theme".** A horizontal carousel of preview cards: Day, Night, then every owned theme (official and
  community), then a link to the store's themes. Each card is the shop's own preview, `ThemeMiniShell`, so a theme
  looks the same here as in the store. Day and Night are drawn from the scoped `.style-default` / `.style-graphite`
  token blocks that exist for exactly this.
- **Choosing applies at once.** Day / Night clear any bought theme and set the edition; a bought theme is applied as
  before (`deriveAppliedTheme`).
- **Light or dark is derived, not chosen.** While a bought theme is on, the edition class on `<html>` is the one its
  background belongs to (`colorSchemeForBackground`, WCAG luminance, threshold 0.5 — the same one the pre-paint
  script already uses for `color-scheme`). Applied in both places that set the class: the pre-paint script
  (`lib/prepaint/theme.ts`) and `Providers`. The stored `style` is left alone, so removing a theme elsewhere (theme
  studio) returns to the edition the visitor last picked.
- **"Show all"** toggles the carousel into a wrapping grid of the same cards, in place.
- **Motion (R5):** a native scroll-snap row with previous / next buttons; nothing moves at rest, no auto-advance.

## Approaches considered

1. *Derive the class from the active theme at apply time (chosen).* One rule in the two class writers; previews and
   the cached theme work unchanged; no schema change.
2. *Write the derived edition into `style` when a theme is applied.* Simpler reads, but it overwrites the visitor's
   edition and syncs it to the account, so removing a theme lands on an edition they never chose.
3. *Store a `scheme` on each theme.* A schema and migration for a value that is a pure function of `canvasBase`.

## Left to the builder

Card size, the exact selected mark (a 2px ink outline + the name in 600), keyboard behaviour (the cards are a
`radiogroup`).
