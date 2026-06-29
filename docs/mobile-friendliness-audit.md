# Mobile-Friendliness Audit — rmhstudios.com

**Document status:** Findings & recommendations — *awaiting sign-off before any code changes.*
**Prepared:** 2026-06-29
**Branch:** `claude/mobile-friendliness-audit-edr36k`
**Scope:** Full web application — public site (`_site/*`), shared UI primitives, games, and full-screen apps.
**Target devices:** Modern phones at ~360–430px CSS width (iPhone SE → 15 Pro Max), with emphasis on notched/home-indicator iOS Safari and Android Chrome.

---

## 1. Executive summary

The platform is, on the whole, **deliberately mobile-aware**. The team has done the hard parts well: a global `100dvh` override for `h-screen`/`min-h-screen`, a swipe-driven push-drawer with proper scroll-locking, tabbed mobile layouts for the apps (RMHTube, RMHStudy, RMHType, RMHBox), touch controls for several games (Altair, VELUM 2099, Kowloon Knockout), and content columns that lean consistently on `min-w-0` + `truncate` + `break-words` + responsive grids. Horizontal overflow on the public content pages is **largely a non-issue**.

However, the audit found a small number of **systemic, high-leverage defects** that affect nearly every screen and map precisely onto the three symptoms described, plus the horizontal-scroll/sidebar conflict reported during the audit:

| Reported symptom | Root cause | Finding |
|---|---|---|
| "Jankiness zooming in… for text boxes" | Form controls render below the 16px iOS threshold | **F2** (systemic — ~230–260 fields) |
| "Unscrollable when necessary" | The shared `Dialog` primitive has no `max-height` + scroll | **F3** (+ a few custom modals, F7) |
| "Elements going off viewport" | Fixed bottom nav ignores the home-indicator safe area; a few games; minor table cramping | **F4**, **F5**, **F6**, **F9** |
| "Horizontal scroll opens the sidebar instead" | The page-wide swipe handler claims *all* horizontal swipes and suppresses native scroll of inner containers | **F1** (user-reported, root-caused) |

**The good news:** the two or three highest-impact issues are fixable centrally. A single global CSS rule neutralizes the form-zoom problem across hundreds of fields without touching component code; one line on the shared `Dialog` fixes modal scrolling everywhere; and a scoped guard in one swipe handler fixes the scroll-vs-sidebar conflict site-wide. **Phase 1 below (4 central edits) resolves the bulk of the user-perceived jank.**

### Severity counts

| Severity | Count | Findings |
|---|---|---|
| Critical | 1 | F5 (Forest Explorer: unusable on touch, no warning) |
| High | 4 | F1, F2, F3, F4 |
| Medium | 5 | F6, F7, F8, F9, F10 |
| Low / polish | 7 | F11–F17 |

---

## 2. Methodology

**Primary method — source analysis.** Every finding below is backed by an exact `file:line` reference and the offending code. For the two issue classes the user emphasized, source analysis is *authoritative* rather than a proxy for testing:

- **iOS focus-zoom** is a spec-defined behavior: mobile Safari zooms when a focused form control's computed `font-size` is `< 16px`. Whether that condition holds is decided entirely by the CSS, so reading the CSS is the ground truth.
- **Safe-area / `dvh` / `overflow` / gesture** behaviors are similarly determined by specific declarations (`env(safe-area-inset-*)`, `100dvh` vs `100vh`, `overflow-y-auto`, `touch-action`), all of which are verifiable in source.

The audit fanned out across four surfaces in parallel — (1) navigation/layout shell, (2) forms/inputs/dialogs, (3) horizontal overflow / wide content, (4) games & full-screen apps — followed by first-hand verification of every Critical/High finding.

**Live-rendering attempt (and why it was bounded).** Per the recommendation, an attempt was made to boot the site in a 390px viewport via Playwright/Chromium. Dependencies installed, but **Prisma client generation is blocked in this sandbox** (the engine fetch is severed at the network layer before reaching the egress proxy), so the SSR dev server — whose root loader hits the database on every request — cannot start. Separately, **Playwright's Chromium cannot reproduce iOS Safari's focus-zoom** (an iOS-only behavior), so a live desktop-Chromium pass would not have validated the headline finding regardless. Given both constraints, the audit relies on authoritative source analysis, which fully determines the issue classes in question. *If a staging URL or a seeded database is available, a confirmatory device pass (real iOS Safari + Android Chrome) is recommended as a Phase-1 acceptance step.*

### Severity scale

- **Critical** — A class of users (e.g. all touch users on a given page) cannot use core functionality, with no fallback or messaging.
- **High** — Frequent, cross-cutting friction on primary flows (forms, modals, navigation); usable but visibly broken/janky.
- **Medium** — Noticeable degradation on specific pages/components; workaround usually exists.
- **Low / polish** — Cosmetic, edge-case, or low-traffic.

---

## 3. Findings — prioritized index

| ID | Area | Finding | Severity | Blast radius | Fix effort |
|---|---|---|---|---|---|
| **F1** | Gesture | Horizontal scroll on overflow opens the sidebar | High | Site-wide (any inner h-scroll) | S (1 handler) |
| **F2** | Forms | Form controls < 16px → iOS focus-zoom | High | ~230–260 fields | S (1 global rule) |
| **F3** | Dialogs | Shared `Dialog` has no `max-h` + scroll | High | All `<Dialog>` callers | S (1 line) |
| **F4** | Nav | Fixed bottom nav ignores home-indicator safe area | High | Every mobile page | S |
| **F5** | Games | Forest Explorer: pointer-lock only, no touch/no warning | Critical | Forest Explorer route | M |
| **F6** | Games | Breakpoint mobile CRCH/RELOAD buttons at screen edge | Medium | Rochester Offensive | S |
| **F7** | Dialogs | Custom modals without height cap / body scroll | Medium | ~6 modals | M |
| **F8** | Tables | RMHCode info tables lack `overflow-x-auto` | Medium | `/rmhcode` page | S |
| **F9** | Tables | Admin user table columns squeeze name block | Medium | Admin only | S |
| **F10** | Layout | Raw `100vh`/`100vw` bypass the `dvh` override | Medium | A few game routes | S |
| **F11** | Forms | `Select` primitive 36px tall (< 44px touch target) | Low | All `<Select>` | S |
| **F12** | Forms | `.coming-soon-input-shell input` hard-coded 14px | Low | Coming-soon page | S |
| **F13** | Layout | Two non-responsive stat grids (cramped, not overflowing) | Low | 2 components | S |
| **F14** | Content | Blog/news inline code & long URLs lack `break-words` | Low | Article bodies | S |
| **F15** | Forms | Numeric fields missing `inputMode` hints | Low | Price/BPM fields | S |
| **F16** | Nav | User-menu popover positioning math can drift | Low | Drawer menu | S |
| **F17** | Tech debt | Duplicate `useIsMobile` hook; under-used site-wide | Low | n/a | S |

---

## 4. Critical & High findings (detailed)

### F1 — Horizontal scroll on an overflow opens the sidebar instead *(High, user-reported, root-caused)*

**Where:** `components/feed/MobileSidebarShell.tsx`

**What happens.** The mobile push-drawer attaches `touchstart`/`touchmove`/`touchend` listeners to the **entire page panel** (`panelRef`, line 236), and the panel is marked `touch-pan-y` (line 242), which tells the browser *only vertical* panning is native — horizontal gestures are reserved for JavaScript. The gesture-classification logic then claims **any** horizontal-dominant swipe as a drawer drag:

```ts
// MobileSidebarShell.tsx:144-151
d.decided = true;
d.mode = Math.abs(dx) > Math.abs(dy) || isOpenRef.current ? 'drag' : 'scroll';
...
if (d.mode !== 'drag') return;        // (vertical → let page scroll)
if (e.cancelable) e.preventDefault(); // ← cancels native horizontal scroll of inner containers
```

Because the handler never checks whether the touch **started inside a horizontally-scrollable element**, a sideways swipe over a code block, a table wrapped in `overflow-x-auto`, a tab strip, or a carousel is intercepted: `touch-pan-y` stops the browser from scrolling the child, and the JS handler converts the swipe into a drawer-open. This is exactly the reported behavior.

**Symptom.** Horizontally scrollable content (anything in `overflow-x-auto`) cannot be scrolled sideways on mobile — the swipe opens the navigation drawer.

**Recommended fix (targeted — preserves swipe-anywhere UX).** When classifying the gesture as horizontal, first walk up from the touch target to the panel and, if an ancestor can still scroll horizontally **in the swipe's direction**, classify the gesture as `scroll` (let the browser handle it) instead of `drag`:

```ts
function scrollableXAncestor(el: Element | null, dir: number, stop: Element): boolean {
  for (let n = el; n && n !== stop; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowX) && n.scrollWidth > n.clientWidth + 1) {
      const atStart = n.scrollLeft <= 0;
      const atEnd = n.scrollLeft >= n.scrollWidth - n.clientWidth - 1;
      if (dir < 0 ? !atStart : !atEnd) return true; // can still scroll this way
    }
  }
  return false;
}
// in onTouchMove, at decision time, when |dx| > |dy| and the drawer is closed:
if (scrollableXAncestor(e.target as Element, dx, panel)) { d.mode = 'scroll'; return; }
```

**Simpler alternative (platform-conventional).** Only begin a *drawer-open* drag when the touch starts within an edge zone (`startX <= 24`), matching iOS/Android edge-swipe conventions. Mid-screen horizontal swipes then fall through to native scrolling. (Drag-to-close while open can remain full-width via the scrim.)

> Related: `app/globals.css:2010-2012` sets `overscroll-behavior-x: none` on `<html>` specifically to free the left-edge swipe for the drawer — consistent with the current design. Either fix above is compatible with it.

---

### F2 — Form controls render below 16px → iOS auto-zoom on focus *(High, systemic)*

**Root cause.** The three shared form primitives hard-code `text-sm` (14px):

- `components/ui/input.tsx:14` — `<Input>` (`h-10 … text-sm …`)
- `components/ui/textarea.tsx:12` — `<Textarea>` (`min-h-[80px] … text-sm …`)
- `components/ui/select.tsx:13` — `<Select>` (`h-9 … text-sm …`)

There is **no global rule** forcing form controls to ≥16px on mobile (verified across `app/globals.css`). The viewport meta is healthy — `width=device-width, initial-scale=1, viewport-fit=cover` with **no** `maximum-scale`/`user-scalable=no` (`app/routes/__root.tsx:108,121`) — so zoom is enabled and the bug is real (not accidentally suppressed).

**Symptom.** On iOS Safari, focusing any control whose computed `font-size < 16px` triggers an abrupt page zoom — the "jank when tapping a text box."

**Blast radius.** ~299 raw `<input>/<textarea>/<select>` across ~145 files, plus ~27 usages of the shared primitives. Excluding non-text types and the already-correct fields, an estimated **~230–260 visible text-entry controls render < 16px on mobile.** Representative high-traffic offenders (all `text-sm`/`text-xs`):

- `components/feed/ConversationView.tsx:705` — DM composer *(verified)*
- `components/feed/GroupChatView.tsx:483` — group-chat composer
- `components/feed/CommentThread.tsx:120`, `components/feed/CommentItem.tsx:386` (`text-xs`) — comment / reply boxes
- `components/feed/PostDetail.tsx:407` — "Post your reply"
- `components/feed/SearchColumn.tsx:112`, `components/feed/MessagesColumn.tsx:299,529` — search inputs
- `components/blog/BlogList.tsx:161`, `components/news/NewsList.tsx:169` — blog/news search
- `components/feed/ProfileEditModal.tsx:391,437,453,469,482` — entire profile-edit form
- `components/feed/ComposeBox.tsx:312,328,369,463` — poll question/options/`<select>`/datetime

**Already-correct patterns to emulate (verified — not bugs):**
- `components/feed/ComposeBox.tsx:266` & `ComposeModal.tsx:266` — main post composer uses **`text-base`** (16px).
- `components/rideshare/LocationSearch.tsx:174` & `RideChat.tsx:87` — **`text-base … sm:text-sm`** (16px on phones, 14px on ≥640px). This is the textbook mobile-first fix.

**Recommended fix (one global rule clears the bulk).** Add to `app/globals.css`:

```css
/* Prevent iOS Safari from auto-zooming when focusing a form control.
   16px is the threshold; ≤640px (phones) only so desktop density is unchanged. */
@media (max-width: 640px) {
  input, select, textarea { font-size: 16px; }
}
```

This neutralizes essentially all ~230–260 fields without editing component code. (Optionally *also* change the three primitives to `text-base md:text-sm` so the intent is explicit at the source; the global rule remains the safety net for raw elements.)

---

### F3 — Shared `Dialog` has no max-height or scroll → tall modals are unscrollable *(High)*

**Where:** `components/ui/dialog.tsx:42-47` *(verified)*

```tsx
"fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%]
 gap-4 border bg-background p-6 shadow-lg … sm:rounded-lg"
```

`DialogContent` is vertically centered with `translate-y-[-50%]` but sets **no `max-height` and no `overflow-y-auto`.** When content is taller than the viewport — common on phones, and worse when the on-screen keyboard halves the available height — the top and bottom of the dialog (including action buttons) render off-screen with **no way to scroll to them.** This is the "unscrollable when necessary" symptom in the site's *shared* modal primitive.

**Callers that inherit the gap and can grow tall:** `components/feed/EditPostModal.tsx:57`, `components/moderation/ReportDialog.tsx:74`, `components/feed/CommunityColumn.tsx:270,359`, `components/economy/TipDialog.tsx:55`, `components/economy/GiftSubDialog.tsx:59`, `components/game/SongLibrary.tsx:328`.

**Recommended fix (one line, fixes all callers).** Add a `dvh`-based cap and scroll to the base class:

```diff
- … grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 …
+ … grid w-full max-w-lg max-h-[85dvh] overflow-y-auto translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 …
```

`dvh` (not `vh`) is important so the cap shrinks when the iOS keyboard opens. Width is already fine (`w-full max-w-lg` shrinks on small screens).

**Good patterns already present (emulate):** `components/site/FeedbackModal.tsx:193` (`max-h-[85vh] flex flex-col` + scrolling body) and `components/feed/ProfileEditModal.tsx:324,340` (capped height, `overflow-y-auto` body, body-scroll-lock effect). Consider upgrading their `85vh`/`90vh` to `dvh`.

---

### F4 — Fixed bottom navigation ignores the iOS home-indicator safe area *(High)*

**Where:** `components/feed/MobileNav.tsx:58` *(verified)*

```tsx
<nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 vibe-glass vibe-mobile-nav border-t border-site-border">
  … <div className="flex items-center justify-around h-12"> … </nav>
```

The site sets `viewport-fit=cover`, so on notched iPhones the page extends behind the home indicator. The body's `padding-bottom: env(safe-area-inset-bottom)` (`app/globals.css:2028`) does **not** help a `position: fixed; bottom-0` element — fixed elements anchor to the viewport, not the padded body box. The tab row's bottom ~34px therefore sits under the home indicator, shrinking the (fixed `h-12`) touch targets and making the bar awkward to tap.

**Recommended fix.** Apply the existing `.pb-safe` utility (`app/globals.css:1148`) and let the inset add height rather than be clipped:

```diff
- <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 vibe-glass vibe-mobile-nav border-t border-site-border">
+ <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 vibe-glass vibe-mobile-nav border-t border-site-border pb-safe">
```

(and prefer `min-h-12` over fixed `h-12` on the tab row so the inset extends the bar). See **F10/related** for the matching FAB offset.

---

### F5 — Forest Explorer is unusable on touch with no fallback or warning *(Critical, scoped to that route)*

**Where:** `components/forest-explorer/story/StoryGame.tsx` (≈ lines 173-175, 205-216, 231) and the sibling `ExploreGame` (≈ 82-92, 170-175).

The 3D first-person mode uses `requestPointerLock()` for mouse-look plus WASD/Shift/Space/E/F/Tab keyboard controls. There is **no touch detection, no touch controls, and no "best on desktop / use a computer" messaging.** A mobile visitor reaches a screen they cannot operate and is given no explanation.

**Why Critical (for this surface):** unlike the other games, there is neither a touch path nor a graceful message — it's a dead end for all touch users.

**Recommended fix (lowest-effort acceptable bar):** detect touch with the existing `hooks/useIsMobile.ts` (or `matchMedia('(pointer: coarse)')`) and render a "This experience needs a keyboard & mouse — open it on a desktop" interstitial instead of the pointer-lock canvas. A fuller fix would add on-screen touch controls, but messaging is the minimum to remove the dead end.

> **Contrast — games that handle mobile well (no action needed):** **Altair** (`components/altair/screens/GameScreen.tsx:71` touch detection via `matchMedia('(hover: none) and (pointer: coarse)')`, D-pad in `components/altair/mobile/MobileDPad.tsx`, `100dvh`, safe-area-aware controls), **VELUM 2099** (`components/velum2099/game/ui/MobileControls.ts:44-46` touch detect, full joystick + buttons), **Kowloon Knockout** (`useIsMobile()` + thumbstick/punch controls, `vw`-based HUD). These confirm a good in-house pattern exists to apply to Forest Explorer.

---

## 5. Medium findings

### F6 — Breakpoint (Rochester Offensive) mobile action buttons sit at the screen edge *(Medium)*

**Where:** `components/breakpoint/breakpoint.css:284-285` *(verified)*

```css
.bp-m-actions .bp-m-btn:nth-of-type(4) { left: 6px;  bottom: -10px; } /* CRCH */
.bp-m-actions .bp-m-btn:nth-of-type(5) { left: 78px; bottom: -6px; }  /* RELOAD */
```

The action cluster `.bp-m-actions` is anchored `bottom: 24px` (line 277), so the negative offsets place CROUCH/RELOAD ~14–18px from the physical bottom — on notched phones they fall under the home-indicator safe area, making them hard or impossible to tap during play. (The game otherwise has proper touch controls via `useIsMobile()` and a thumbstick.)

**Fix.** Use positive offsets (e.g. `bottom: 8px`) and/or add `env(safe-area-inset-bottom)` to the cluster's bottom anchor.

### F7 — Custom (non-`Dialog`) modals lack a height cap / body scroll *(Medium)*

Independent of F3, several bespoke modals can exceed the viewport (especially with the keyboard up) with no internal scroll:

- `components/feed/ComposeModal.tsx:158` — no height cap or body scroll; images + poll + composer can run off-bottom. Fix: `flex flex-col max-h-[90dvh]` with an `overflow-y-auto` body (mirror `ProfileEditModal`).
- `components/feed/ImageCropModal.tsx:68` — has `max-h-[90vh]` but the crop stage is a fixed `h-64 sm:h-80 shrink-0`; header + crop + controls can exceed it with no column scroll. Fix: add `overflow-y-auto` and make the crop area fluid (`h-[clamp(150px,40dvh,320px)]`).
- `components/rmhtube/AddMediaModal.tsx:49`, `components/rmhtube/InviteLinkModal.tsx:65`, `components/predictions/CreatePredictionModal.tsx:66` — no `max-h`/scroll (content short today; risk rises with keyboard). Fix: add `max-h-[85dvh] overflow-y-auto`.

> *Note (verified):* these custom modals do **not** overflow horizontally — `w-full max-w-*` inside a flex-centered, padded overlay shrinks to fit. The issue is purely vertical.

### F8 — RMHCode info tables lack horizontal scroll wrappers *(Medium)*

**Where:** `app/routes/rmhcode/index.tsx` — the Binaries table (≈ 217-222), AI Providers table (≈ 272-277), and CLI Commands table (≈ 339-345) are `<table className="w-full text-sm">` inside `overflow-hidden` wrappers. At 390px the columns cramp/clip with long command strings.

**Fix.** Wrap each table in `<div className="overflow-x-auto">` (and give the table a sensible `min-w`), or switch to a stacked card layout on mobile.

### F9 — Admin user-table columns squeeze the name/handle/email block *(Medium, admin-only)*

**Where:** `components/admin/users.tsx` — each row is `flex` with a `flex-1 min-w-0` identity block followed by fixed `w-20` + `w-28` + `w-24` (≈ 288px of fixed columns). At 390px that leaves ~70px for name/handle/email (aggressively truncated, barely usable; saved from true overflow only by `min-w-0`/`truncate`).

**Fix.** Wrap the list in `overflow-x-auto` with `min-w-[480px]` rows, **or** stack on mobile (`flex-col sm:flex-row`, action columns `w-auto sm:w-28`).

### F10 — Raw `100vh`/`100vw` bypass the global `dvh` override *(Medium → Low)*

The project helpfully redefines the Tailwind `.h-screen`/`.min-h-screen` utilities to `100dvh` (`app/globals.css:1134-1142`), so component `h-screen` usages are dvh-safe. But **inline styles and arbitrary values bypass that override**:

- `app/routes/kowloon-knockout.tsx:5` and `app/routes/rmh-farming-sim.tsx:5` — inline `width: '100vw', height: '100vh'`. `100vh` reintroduces the URL-bar resize jank; `100vw` ignores the scrollbar gutter and can force a horizontal scrollbar.
- `components/synapse-storm/SynapseStorm.css` — multiple `height: 100vh; width: 100vw`.
- `components/altair/screens/*` — `min-h-[calc(100vh-56px)]` (arbitrary value → not overridden). Minor, since Altair is otherwise mobile-aware.

**Fix.** Replace `100vh`→`100dvh` and `100vw`→`100%` (or the `.h-screen` utility) in these spots. **VELUM 2099** already models the right call: `style={{ width: '100vw', height: '100dvh' }}` (`components/altair/screens/GameScreen.tsx:448`).

---

## 6. Low / polish findings

- **F11 — `Select` touch target (Low).** `components/ui/select.tsx:13` is `h-9` (36px), under the 44px guideline (and `text-sm`, see F2). Consider `h-10`/`min-h-11` on mobile.
- **F12 — Coming-soon input hard-codes 14px (Low).** `app/globals.css:2442-2448` (`.coming-soon-input-shell input { font-size: 0.875rem }`) — same zoom trigger as F2 in raw CSS. Set to `16px`.
- **F13 — Two non-responsive stat grids (Low; cramped, not overflowing).** `components/feed/DeckStudyColumn.tsx:181` (`grid-cols-4` grade buttons) and `components/feed/StakingCard.tsx:91` (`grid-cols-3` stat boxes). Match the sibling pattern `grid-cols-2 sm:grid-cols-3/4`.
- **F14 — Article inline code / long URLs (Low).** `app/routes/blog.$slug.tsx` & `app/routes/news.$slug.tsx` (via `components/blog/MDXAnimations.tsx`): `<pre>` blocks are correctly `overflow-x-auto`, but inline `` `code` `` and bare long URLs in prose have no force-break. Add `break-words prose-code:break-words` to the `prose` wrappers.
- **F15 — `inputMode` hints (Low, enhancement).** Numeric fields (e.g. unlock-price in `ComposeBox`, BPM in `components/studio/StudioShell.tsx:88,151`) would benefit from `inputMode="numeric"`/`"decimal"` for the right mobile keypad. No incorrect `type` usage was found.
- **F16 — User-menu popover positioning (Low).** `components/feed/LeftSidebar.tsx:228-253` computes a `fixed` popover position from `window.innerHeight/innerWidth`; can drift if the visual viewport changes (keyboard/URL bar) between open and render. It clamps to an 8px margin so it won't leave the screen.
- **F17 — Duplicate `useIsMobile` hook (tech debt).** `hooks/useIsMobile.ts` (breakpoint `max-width: 767px`) and `lib/studio/hooks/useIsMobile.ts` both exist; the shared hook is referenced in only ~4 files. Consolidate and apply more broadly (see F5).

> **Out of scope but noted:** `components/rmhcoins/BlackjackSessionStats.tsx` and `HoldemSessionStats.tsx` have unwrapped 5-column tables (genuine overflow) reached only inside the in-game casino UI. Wrap in `overflow-x-auto` if these become user-facing on mobile.

---

## 7. What's already done well (no action needed)

Acknowledging the strong baseline so remediation stays focused:

- **Viewport meta is correct** — zoom is *enabled* (no `maximum-scale`/`user-scalable=no`) and `viewport-fit=cover` is set for notch handling (`app/routes/__root.tsx:121`).
- **Global `dvh` override** for `.h-screen`/`.min-h-screen` (`app/globals.css:1134-1142`) — most full-height layouts avoid the mobile URL-bar bug automatically.
- **Mobile push-drawer is robust** (`MobileSidebarShell.tsx`) — locks body scroll while open, `overscroll-contain` prevents scroll-chaining, uses `h-dvh`, and dismisses via scrim tap / swipe-back / navigation / Escape. (Its only flaw is the F1 gesture conflict.)
- **Bottom-nav accessibility** — 48px touch targets (`p-3` around 24px icons), `aria-current`, per-tab `aria-label`, and a non-color-only active indicator (`MobileNav.tsx`).
- **Apps ship dedicated mobile layouts** — RMHTube, RMHStudy, RMHBox collapse desktop sidebars into bottom tab bars below their breakpoints; **RMHType** is exemplary (`@supports (height: 100dvh)`, a `@media (max-height: 32rem)` rule that compacts the HUD when the keyboard is up, and cursor auto-scroll).
- **Content pages are mobile-safe** — consistent `min-w-0` + `truncate` on flex children, `break-words` on user text, `flex-wrap` on control rows, responsive `grid-cols-2 sm:grid-cols-3`, `overflow-x-auto` on code blocks and tab strips, and full-width carousel slides. No unwrapped `<table>` exists in any `_site` route.
- **`prefers-reduced-motion`** is honored globally (`app/globals.css:1948+`), disabling expensive background effects and animations.
- **Login page** is a clean mobile example — `min-h-screen`→dvh, `px-4` gutters, `max-w-md` card, 48px-tall fields that inherit 16px (no zoom).

---

## 8. Recommended remediation roadmap

Phased so the highest user-perceived impact lands first with the least code.

### Phase 1 — Central, high-ROI fixes (resolve the bulk; ~4 edits)
1. **F2** — Add the `@media (max-width: 640px) { input, select, textarea { font-size: 16px } }` rule. *Kills the form-zoom jank across ~230–260 fields.*
2. **F3** — Add `max-h-[85dvh] overflow-y-auto` to `DialogContent`. *Fixes modal scrolling everywhere.*
3. **F1** — Add the scrollable-ancestor guard (or edge-activation) to `MobileSidebarShell`. *Fixes scroll-vs-sidebar site-wide.*
4. **F4** — Add `pb-safe` (+ `min-h`) to the fixed bottom nav, and offset the FAB by the safe area.

*Acceptance:* if a staging URL / seeded DB becomes available, validate Phase 1 on real iOS Safari + Android Chrome (focus a `text-sm` field → no zoom; open a long modal → scrolls; swipe a code block → scrolls; bottom bar clears the home indicator).

### Phase 2 — Per-surface fixes
5. **F5** — Add touch detection + "desktop recommended" interstitial to Forest Explorer.
6. **F6** — Reposition Breakpoint CRCH/RELOAD buttons off the screen edge.
7. **F7** — Add height caps + body scroll to ComposeModal, ImageCropModal, AddMediaModal, InviteLinkModal, CreatePredictionModal.
8. **F8 / F9** — Wrap RMHCode tables and the admin user list in `overflow-x-auto` (or stack on mobile).
9. **F10** — Replace raw `100vh`/`100vw` with `dvh`/`%` in the listed game routes/CSS.

### Phase 3 — Polish
10. **F11–F17** — Select touch target, coming-soon input, non-responsive grids, article `break-words`, `inputMode` hints, popover positioning, `useIsMobile` consolidation.

---

## 9. Appendix — proposed code changes (for sign-off)

> These are the concrete diffs implied by Phase 1 + the most mechanical Phase-2 items. **Not yet applied** — included so changes can be approved precisely.

**A. F2 — global form-control font floor** (`app/globals.css`, base/utilities area):
```css
@media (max-width: 640px) {
  input, select, textarea { font-size: 16px; }
}
```

**B. F3 — Dialog scroll** (`components/ui/dialog.tsx:45`): insert `max-h-[85dvh] overflow-y-auto` into the `DialogContent` class string.

**C. F4 — bottom nav safe area** (`components/feed/MobileNav.tsx:58`): add `pb-safe` to the `<nav>`; change the tab row `h-12` → `min-h-12`. FAB (`:50`): replace `bottom-18` with `style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}`.

**D. F1 — gesture guard** (`components/feed/MobileSidebarShell.tsx`): add `scrollableXAncestor(...)` and bail to `mode = 'scroll'` at the decision point (snippet in F1), **or** gate drawer-open on `startX <= 24`.

**E. F10 — dvh in game shells**: `kowloon-knockout.tsx:5` and `rmh-farming-sim.tsx:5` → `height: '100dvh'`, `width: '100%'`; `SynapseStorm.css` `100vh`→`100dvh`.

---

### Coverage note
This audit reviewed the layout shell and navigation, the shared UI primitives (`components/ui/*`), the public `_site/*` content surfaces, the messaging/compose flows, and ~15 game/app routes. Game *internals* (canvas rendering loops, physics) were assessed for mobile *input/layout* viability only, not gameplay. Findings are source-verified; Critical/High items were additionally confirmed first-hand against the cited lines.
