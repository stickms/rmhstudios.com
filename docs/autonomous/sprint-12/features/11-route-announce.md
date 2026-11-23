# 11 — Say where you are after every page change

Surface: every route (site tier and app tier): a polite announcement of the new page after client-side navigation,
focus moved to the page's content after a keyboard-started navigation on the site tier, and a gate that every page has
a title of its own. Wave 7. Namespace `route-announce`. Both tiers.

## User story

As someone who uses a screen reader, I want to hear the name of the page I land on when I follow a link, and to start
reading from the new page rather than from wherever focus was left, so that moving around the site works as it does on
any page that reloads.

## Requirements elicitation

- **What exists (verified):**
  - The site is a single-page app (TanStack Router, `app/router.tsx`): following a link swaps content without a page
    load (Steel section 11: "Route changes swap content with no transition"). A screen reader hears nothing on a route
    change. The only live region in the shell is the globe's label (`components/shell/GlobeNav.tsx`,
    `aria-live="polite"`, the hovered section while the globe is open), which is not a page announcement.
  - The shell has a skip link (`components/shell/SkipLink.tsx`, A5) to `#main-content`, and the `<main id="main-content"
    tabIndex={-1}>` in `components/shell/SiteShell.tsx` can take focus. After a navigation, focus stays on the link
    that was activated (in the sidebar, which persists) or falls to `<body>` when the activated element is removed.
  - The router installs history helpers at creation (`installHistoryTrail` in `lib/router/history-trail.ts`, subscribed
    to `router.history`; `installNotFoundHeadGuard` in `lib/router/not-found-head.ts`).
  - Each route sets its title in `head()` through `buildMeta` (`lib/seo`), held for public pages by
    `lib/__tests__/og-page-coverage.test.ts`; there is no check that a page's title differs from the site default or
    from the page it nests under.
  - Performance rule B3: no `MutationObserver` and no decorative observer on the site tier; R5: nothing moves at rest.
- **Decisions:**
  - **Announce:** after a navigation resolves with a changed pathname (not a search- or hash-only change: games and
    filters change those constantly), the new document title, without the " | RMH Studios" suffix, is written into one
    visually hidden polite live region mounted once in `app/routes/__root.tsx`, cleared and rewritten so a repeat is
    heard. Read from the router's resolved event, never by observing the DOM.
  - **Focus (site tier only):** when the navigation was started from the keyboard (the last input before it was a key
    press) or focus is on `<body>` after it, focus moves to `#main-content` (`preventScroll`, since the router restores
    scroll). A pointer-started navigation keeps focus where it is. App-tier routes (`html.app-route`) manage their own
    focus and are not moved.
  - **Titles:** a gate checks that every page route file under `app/routes/` declares `head()` with a title, and that no
    two static page routes share one title; existing duplicates go into a named, shrinking baseline.
  - **No setting:** announcements are for assistive technology only and are not visible.

## Functional requirements

1. FR-1 `lib/router/route-announce.ts` (pure: the announcement text from a title, the "pathname changed" test, the
   keyboard-start tracker's reducer).
2. FR-2 `lib/router/route-announce-client.ts`: `installRouteAnnouncer(router)` subscribing to the router's `onResolved`
   event, with one `keydown`/`pointerdown` listener pair (capture, passive) recording the last input kind; no observer,
   no timer at rest.
3. FR-3 `components/shell/RouteAnnouncer.tsx` (the live region, `role="status"`, the `sr-only` utility), mounted in
   `app/routes/__root.tsx`; the focus move uses `document.getElementById('main-content')?.focus({ preventScroll:
   true })` in the resolved handler, never `requestAnimationFrame` (the rAF allowlist gate).
4. FR-4 Gate `lib/__tests__/route-titles.test.ts`: every page route has a `head()` title; static duplicates are listed
   in `ROUTE_TITLE_DUPLICATES` (each with its two paths), which only shrinks; the announcer is mounted once in
   `__root.tsx` and the files of FR-1 to FR-3 contain no `MutationObserver` or `requestAnimationFrame`.
5. FR-5 Fix the duplicate titles the gate finds where the fix is a title change only (a new literal through `buildMeta`;
   no wording of a shipped interface string changes), and leave the rest in the baseline with their paths.

## Non-functional requirements

- **Performance:** two passive listeners and one subscription; nothing runs between navigations (B3, R5).
- **Accessibility:** announcements are polite (never interrupt), once per navigation; focus is moved only by keyboard
  navigation, so a pointer user's focus ring never appears (K10's ring shows only for keyboard focus).
- **Both editions:** nothing visible changes.

## Data model and API

None.

## Testing requirements

- Product suite `lib/router/__tests__/route-announce.product.test.ts`: suffix removal, pathname-only rule, the input
  tracker.
- Main suite `lib/router/__tests__/route-announce-client.test.ts`: with a fake router and fake document (no jsdom): a
  resolved navigation writes the title; a search-only change writes nothing; keyboard-started focuses `#main-content`;
  pointer-started does not; an app-route does not.
- `lib/__tests__/route-titles.test.ts` (the gate), with a test that it fails a fixture route without a title.
- Gates: rAF allowlist, Steel flat, iOS edge contract (the region is not fixed or edge-pinned), islands.

## Acceptance criteria

- [ ] With a screen reader, following a sidebar link to Settings announces "Settings".
- [ ] Tabbing to a link and pressing Enter moves focus to the new page's content; clicking it does not.
- [ ] Changing a filter that only updates the query string announces nothing.
- [ ] The title gate passes with its baseline, and fails a new page without a title.

## Out of scope

Announcing in-page tab changes (the tabs primitive does), focus management inside full-screen games.
