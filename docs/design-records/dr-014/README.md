# DR-014 — Redesigning the Home Button

Sources for [`../DR-014-redesigning-the-home-button.pdf`](../DR-014-redesigning-the-home-button.pdf),
a 107-page design record of the RMH hub: the orb docked at the bottom centre of every
`_site` page, and the two-deck radial dial that blooms out of it.

## What it documents

The reasoning, geometry, motion, material and defect history of one control, reconstructed
from this repository — `components/radial/RadialHub.tsx`, `components/radial/radial.css`,
`components/radial/README.md`, `lib/sidebar-nav.ts`, `docs/design-language.md`,
`docs/ui-audit-2026-07-28.md`, and the commits between `e5003b1` and `feeec2c`.

Eight parts plus five reference appendices: the case for the change and the July audit
evidence · the concept · the geometry (annulus sectors, the double deck, `ringSector()`,
the masked hole, label centroids, the art bleed) · the motion (one synchronous 500 ms, the
phase machine, counter-rotation, the degradation ladder) · material and colour (the art/hit
split, the metaball bank, the white-on-white family, the token contract) · input and access
· the defect ledger · verification and open questions.

## How it is built

`build.mjs` assembles the fragments in `src/`, resolves three kinds of token, lays the
result out into real A4 page boxes with `paginate.js`, and prints it with Chromium. Because
pagination is explicit, folios, running heads and the table of contents carry measured page
numbers rather than estimates.

Tokens resolved at build time:

| Token                                    | Expands to                                                        |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `{{code:path\|from-to\|title}}`          | A line-numbered excerpt read from the working tree                 |
| `{{fig:name}}`                           | A figure from `figures.mjs`                                       |
| `{{mark:stroke}}`                        | The RMH mark, path lifted from `components/radial/RmhLogo.tsx`     |
| `{{stat:key}}`                           | A counted fact (e.g. component line counts)                       |

`figures.mjs` carries a faithful port of the production `RINGS`, `SINGLE_RING`,
`INNER_MAX`, `SINGLE_RING_MAX`, `ART_BLEED_DEG` and `ringSector()`, so every dial diagram
and the Appendix A geometry table are drawn by the shipped algorithm. Change the geometry in
`RadialHub.tsx` and the port must be updated with it — that is the point: a figure cannot
silently disagree with the code it illustrates.

## Rebuilding

Needs Node ≥ 24, `playwright-core`, and a Chromium binary. It is deliberately **not** wired
into the workspace — it is a one-off document toolchain, not part of the app build.

```bash
cd docs/design-records/dr-014
npm init -y && npm install playwright-core
# point CHROME in build.mjs at your Chromium, then:
node build.mjs ../DR-014-redesigning-the-home-button.pdf
```

It prints the body page count, the total page count and the number of contents entries.
