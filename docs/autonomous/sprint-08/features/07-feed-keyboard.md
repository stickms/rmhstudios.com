# 07 — Move through the feed with the keyboard

Surface: every list of posts on the site tier (home, explore, tags, profiles,
communities, series, threads, saved) and the keyboard overlay. Wave 7.
Namespace `feed-keyboard`.

## User story

As a member who reads with the keyboard — by preference, or because a mouse
is hard for me — I want `j` and `k` to move from post to post and single keys
to open, like, reply, repost and save the one I am on, so that reading a long
feed does not mean tabbing through forty controls per post.

## Requirements elicitation

- **What exists (verified):**
  - The site's shortcuts are data in `lib/shortcuts/registry.ts`
    (`SITE_SHORTCUTS`: `mod+k`, `/`, `c`, `?` and the `g …` sequences, scope
    `feed`), bound by `components/site/KeyboardShortcuts.tsx`, listed in the
    `?` overlay, and governed by sprint 02 11's settings
    (`components/settings/KeyboardSettings.tsx`: On / Off / "With Alt" for
    character keys, remapping, conflict checks via `findShortcutConflicts`).
  - There is no post-to-post navigation: no `j`/`k` binding anywhere
    (`grep -n "'j'" lib/shortcuts components/site` finds nothing).
  - Posts render through `components/feed/RMHarkCard.tsx` — directly, inside
    `FeedRow.tsx` (home), or in `VirtualPostList.tsx`
    (`useWindowVirtualizer`, overscan 6), used by tags, explore, profiles,
    communities, series and threads; `RMHarkActions.tsx` holds like, reply,
    repost and save.
- **Decisions:**
  - **Bindings** (scope `feed`, character keys, so the existing mode and
    remapping apply automatically): `j` next post, `k` previous post, `o` or
    `Enter` open the current post, `l` like / unlike, `r` reply (opens the
    reply composer for that post), `t` repost menu, `s` save, `x` reveal or
    cover a content warning, `Escape` leave post navigation. All appear in the
    `?` overlay and in `/settings/keyboard` with their own label keys.
    `findShortcutConflicts` must stay clean (the `g s` sequence is a
    sequence, not a bare `s`; the implementer proves it in the registry test).
  - **The current post** is a real focus target: each post's root gets
    `data-feed-post` and `tabIndex={-1}`; `j`/`k` move DOM focus to the next or
    previous `[data-feed-post]` inside the page's `main` landmark, in document
    order, and call `scrollIntoView({ block: 'nearest' })` (no smooth scroll:
    nothing animates, R5). Focus shows the global focus ring (K10); nothing
    else is drawn. Screen readers hear the post's existing accessible name.
  - **Windowed lists:** the virtualiser's overscan keeps the neighbours
    mounted; when the next row is not mounted (fast repeat at the edge) the
    handler calls `focusIndex(i)` on a small context exposed by
    `VirtualPostList.tsx`, which calls the virtualiser's `scrollToIndex(i,
    { align: 'auto' })` and records `pendingFocusId`; the row's ref callback
    focuses itself when it mounts with that id and clears it. No timer and
    **no `requestAnimationFrame`** (the rAF allowlist,
    `lib/__tests__/raf-loop-allowlist.test.ts`, fails any new file that calls
    it, one-shot or not, and the briefs forbid rAF for focus).
  - **Where it is off:** while focus is in a text field, a dialog or a menu,
    and on full-screen app routes (scope `feed` already excludes them). The
    keys act on the focused post only; with no post focused, `j` focuses the
    first post in view.
  - **Actions** call the same handlers the buttons call (exported from
    `RMHarkActions.tsx` through a per-post action registry keyed by post id),
    so quiet counts, blocks, locked posts and signed-out prompts behave
    exactly as a click would. A signed-out `l` opens the same sign-in prompt.
  - A one-line hint ("Press j and k to move between posts") appears in the
    `?` overlay only; no new banners.

## Functional requirements

1. FR-1 The nine bindings in the registry with labels in `feed-keyboard`.
2. FR-2 Focus movement across every post list named above, windowed or not.
3. FR-3 The six post actions through the existing handlers.
4. FR-4 The modes and remaps of `/settings/keyboard` apply (no new setting).

## Non-functional requirements

- **Accessibility:** WCAG 2.1.4 (character key shortcuts can be turned off or
  remapped — inherited), 2.4.3 focus order (DOM order), 2.4.7 visible focus
  (the global ring). Tested with a screen reader in the browser pass.
- **Performance:** no listener per post; one keydown handler (the existing
  one) and one `querySelectorAll` per key press, scoped to `main`.
- **Steel:** nothing new is drawn; R5 (no smooth scroll, no highlight
  animation); M9 unaffected.
- **i18n:** `feed-keyboard` for the nine labels and the hint; plain `t` with
  literal keys (no computed key from the binding id).

## Data model and API

- No schema or API change.
- New `lib/shortcuts/feed-nav.ts` (pure: `nextIndex`, `prevIndex`,
  `isTypingTarget`), `components/feed/feed-nav.tsx` (the handler and the
  per-post action registry context), edits to `lib/shortcuts/registry.ts`,
  `components/site/KeyboardShortcuts.tsx`, `components/feed/RMHarkCard.tsx`,
  `RMHarkActions.tsx`, `VirtualPostList.tsx`, `FeedRow.tsx`, the keyboard
  overlay and `components/settings/KeyboardSettings.tsx` labels.

## Testing requirements

- Product suite `lib/shortcuts/__tests__/feed-nav.product.test.ts` (index
  maths, typing targets).
- Main suite `components/feed/__tests__/feed-nav.test.tsx` (jsdom): `j`/`k`
  move focus in a plain list and a windowed one; `l` calls the like handler;
  keys ignored in an input and in a dialog; mode Off disables; With Alt
  requires Alt.
- Existing: `lib/__tests__/shortcut-registry.test.ts`,
  `raf-loop-allowlist`, `design-consistency`, the RMHarkCard tests.

## Acceptance criteria

- [ ] On the home feed, `j` five times lands on the fifth post with the focus
      ring; `l` likes it and the count follows the quiet-count rule.
- [ ] On a 300-post tag page, holding `j` walks past the window without losing
      focus.
- [ ] With character shortcuts Off, none of the keys does anything.
- [ ] Day and Night, 390 px (with a hardware keyboard) and 1280 px, `ar`.

## Out of scope

Keyboard navigation of notifications and messages, a "selected" visual other
than the focus ring, vim-style counts, game keybindings.
