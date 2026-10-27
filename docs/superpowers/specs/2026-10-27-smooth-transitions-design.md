# Smooth, very quick page transitions (design)

Date: 2026-10-27 · Scope: every main-site page (the `_site` shell, `.page-root`) and shared UI. The full-screen games/apps are out (their own scheme).

## Intent

Switching pages or tabs "flickers": the title, every card and the whole column replay entrance animations, and on a tab switch the frame that is identical on both pages (title, tab strip, filters) blinks out and back with the content. The owner wants **smooth but very quick** transitions on all pages, with **pages that share a layout (tabbed pages) getting a better one**: the shared frame stays perfectly still and only the content swaps.

## What actually replays (measured, `/games` → `/apps`, Chromium, 390px)

`radial-page-rise` on the page heading (500ms), `store-rise` on the hero and each card (550–600ms), `page-enter` on the whole `site-main-column` (160ms, fade + 4px rise), plus image and haze opacity transitions. The same mechanism (per-feature one-shot CSS entrances) exists across feed, profile, store and others. Native View Transitions are deliberately off on WebKit (the owner is on iOS Safari), so the fix cannot depend on them.

## Goals

- One shared, very quick swap on every page navigation: ≤ 70ms leave, ≤ 130ms enter, **opacity only** (no translate, no stagger), never fully blank (never below `--swap-dim`).
- Every one-shot CSS entrance animation inside the newly mounted page is finished in the same frame the page mounts (title rise, card rises, feed item enters…), so only the shared swap is visible. Opt out per subtree with `data-keep-entrance`.
- **Same-frame navigations** (the destination shares the shell layout group with the origin, e.g. `/games` ↔ `/apps`, settings tabs, library tabs): the frame (`.page-heading`, `[data-slot='page-controls']`) does not animate or dim at all; only the content region swaps.
- **State-based tab switches** (no route change) use the same swap through a small `SwapPanel`, so cards leave and arrive the same way.
- Works without View Transitions; identical on Chromium, Firefox and Safari.

## Non-goals / anti-goals

- No new `infinite` keyframes, no `backdrop-filter`, no per-frame JS, no animation of layout properties.
- No change to the games/apps tier, to jelly/physics, or to the router's pending rules (skeleton still appears only after 400ms).
- Must not hide content from assistive tech or delay navigation: the leave dim starts at navigation start and never blocks the commit.
- First paint / hydration is untouched (`html:not([data-navigated])` still disables entrances).
- Back/forward (`nav-pop`) stays instant, as today.

## Approaches considered

- **A. Native View Transitions for all.** Best crossfade on Chromium, but off on WebKit by policy (owner's device) → rejected as the mechanism.
- **B. Per-page `AnimatePresence`.** Needs edits on ~100 pages and fights the router's remount → rejected.
- **C. One shared swap in the shell + a generic "finish entrance animations" pass (chosen).** CSS tokens + a small client module; works on every page without per-page edits; opt-outs are explicit.

## Design

- `lib/page-transition.ts` (pure + one installer):
  - `shellLayoutFor(pathname)`: the catalog/workspace/editorial/social grouping already inlined in `RadialShell`, extracted and shared.
  - `navKind(fromPath, toPath)` → `'sibling'` when both resolve to the same layout group, else `'cross'`.
  - `finishEntranceAnimations(root)`: finishes every `CSSAnimation` on the document timeline with `iterations === 1` whose target is inside `root` and not inside `[data-keep-entrance]`; skips scroll/view timelines (`Reveal`).
  - `installPageTransitions(router)`: on `onBeforeNavigate` sets `html[data-nav-kind]` and `html[data-page-leaving]` (the leave dim); on `onResolved` clears the leaving flag.
- `RadialShell`: a layout effect after each committed page (`renderedPathname`) runs `finishEntranceAnimations` over `.page-root`, so the new page's own entrances never paint.
- CSS (`app/globals.css`, tokens in `:root`): `--swap-dim: 0.6`, `--swap-out: 70ms`, `--swap-in: 120ms`, one `@keyframes page-swap-in { from { opacity: var(--swap-dim) } }`. `.page-root > *` uses it (replacing `page-enter`); `html[data-page-leaving] .page-root > *` transitions to `--swap-dim`; for `[data-nav-kind='sibling']` the frame is exempt and the swap applies to the column's other children.
- `components/ui/swap-panel.tsx`: `SwapPanel({ swapKey, children })` with framer `AnimatePresence initial={false} mode="popLayout"`, exit/enter from the same tokens, for tabs that switch by state.
- Docs: a "Page transitions" note in `docs/design-language.md` §7 (motion).

## Verification

Unit tests for `shellLayoutFor`, `navKind`, `finishEntranceAnimations` (fake animations), the CSS contract (tokens, keyframe, frame exemption), `SwapPanel` markup. Browser: re-run the animation probe on `/games`↔`/apps`, `/store`→`/games`, feed→profile and a settings tab switch and confirm: no `radial-page-rise`/`store-rise`/`page-enter` observed, frame opacity stays 1 on sibling navs, content never below `--swap-dim`.

## Left to the builder

Exact dim/duration values (tune by eye), which state-tab pages adopt `SwapPanel` first (the feed's For you / Following at minimum), and the per-route opt-outs if any page needs its entrance kept.
