# Edge and consistency guards (design)

Date: 2026-10-27 · Scope: main site (`_site` shell and shared UI). Owner request: never again get the coloured bands behind Safari's status bar / tab bar, and enforce design consistency permanently (e.g. `/games` and `/create` do not look alike).

## What the coloured bands are (from the code, `app/globals.css`, `app/routes/__root.tsx`)

iOS 26 Safari fills the strips behind its status bar and floating tab bar from `position: fixed` / sticky layers it finds **at a screen edge**; a layer with its own paint is read as one flat colour and becomes an opaque band over the content scrolling under it. Transparency, `pointer-events: none`, transforms and `backdrop-filter` do not reliably opt a layer out. The shipped contract that keeps the bands away:

1. `viewport-fit=cover`; no `theme-color` meta on iOS (a flat colour is exactly the band).
2. On iOS WebKit the full-viewport fixed decoration (`.site-aurora`, `.radial-backdrop`, `.jelly-arc-layer`) is not rendered, and the **root** (`html`) carries the canvas background.
3. Nothing is pinned flush to the top or bottom edge: the top capsule floats 12px down, the orb and compose button sit well off the edges, page banners are inset.

Nothing enforces that contract. It lives in comments, so any new `fixed inset-0`, `sticky top-0`, edge-flush banner or full-bleed layer silently breaks it, and the breakage shows only on a real iPhone.

## Goals

- A **static guard that runs with the existing test suite** (and so the commit gate, no new CI job): the iOS-edge invariants above are asserted, and a **ratchet** (frozen baseline, only goes down, the repo's existing pattern) fails any NEW edge-pinned fixed/sticky pattern in site CSS or TSX.
- A **runtime audit** (`pnpm audit:pages`) that loads every `_site` route in Chromium with an iPhone Safari user-agent (so `html.ios-webkit` is stamped), lists every visible fixed/sticky element touching a viewport edge, and fails on any not in a reviewed allowlist. It is the real-browser check the static guard cannot be, and it is what finds today's offenders.
- A **page-anatomy audit** in the same tool: per route, at phone and desktop widths, in both themes, it measures the shared frame (heading left edge, tab strip / search / sort edges, first content block edge, card radius, tab appearance, entrance animations replayed) and flags any page that deviates from the shared norm.
- Today's offenders found by the audit are **fixed**, not just baselined.
- A written **"how consistency is enforced"** map in `docs/page-consistency.md`: what each layer catches, when it runs, how to extend it.

## Non-goals / anti-goals

- No pixel-diff screenshot baselines (brittle, slow, and they would punish every intentional design change).
- No per-PR CI job for the runtime audit (owner: too many gates take too long). It is a command, and a scheduled workflow only if it is cheap.
- Not a redesign: the guards encode the existing contract; they do not invent new visual rules.
- Games and apps keep their own scheme; out of scope for the anatomy audit.

## Approaches considered

- **A. Comments only (status quo).** Failed: the bands came back.
- **B. Static ratchet only.** Catches new code, cannot see computed layout (e.g. a Tailwind class built at runtime, a component that is fixed only on some routes) and cannot judge Safari's heuristic.
- **C. Static ratchet + real-browser audit with an iPhone UA (chosen).** Static is fast and always on; the audit is the ground truth on demand and finds what static misses. Chromium cannot reproduce Safari's tinting, so the audit checks the cause (edge-touching fixed/sticky layers), which is what the code's own contract names.

## Design

- `lib/__tests__/ios-edge-contract.test.ts`: (1) invariants as file assertions (viewport meta, theme-color skipped on `ios-webkit`, the `display: none` rule for the fixed decoration, the root canvas rule); (2) ratchet: a postcss/regex scan of site-tier CSS and TSX for `fixed`/`sticky` + `top|bottom|inset: 0` patterns, keyed per file, compared with `lib/__tests__/ios-edge.baseline.json` (new → fail; fewer than frozen → "lower it"). Game/app dirs and `components/shared` are exempt (`FULLSCREEN_TIER_DIRS`, same policy as the other gates).
- `scripts/audit-pages.mjs` + `pnpm audit:pages [--edges|--anatomy] [--strict] [--base-url …] [--routes …]`: routes from `app/routeTree.gen.ts` (static `_site` paths), Chromium from the Playwright already in devDependencies, iPhone UA, 390×844 and 1280×800, graphite and default. Prints a table and writes `/tmp`-style JSON; `--strict` exits non-zero on findings not in `docs/page-audit-allowlist.json` (reviewed, one-directional).
- Fixes: every real offender the audit finds on the iOS pass.
- Docs: `docs/page-consistency.md` gets the enforcement map; `CLAUDE.md` / `components/CLAUDE.md` point at `pnpm audit:pages` in the UI checklist.

## Left to the builder

Exact anatomy metrics and tolerances (start with: heading/tabs/search/first-block left+right edges equal at 390 within 1px; card radius equals `--site-radius`), the allowlist format, and whether a scheduled workflow is cheap enough to add.
