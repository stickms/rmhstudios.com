# 03 — What this site keeps on your device, and clearing it

Surface: a new page `/settings/device`, the account menu's sign-out, and the
account-deletion flow. Wave 5. Namespace `device-data`.

## User story

As a member who uses a shared or borrowed computer, or who just deleted their
account, I want to see what the site has stored in this browser — Studio
samples, book pages, drafts, game saves — and clear it, all of it or one thing
at a time, so that the next person on this computer does not find my
recordings and my unfinished posts.

## Requirements elicitation

- **What exists (verified):**
  - Sprint 05's summary lists "Studio samples staying on the device" as an open
    erasure follow-up. The samples live in IndexedDB `rmh-studio-db`
    (`lib/studio/project-store.ts`: `projects`, `samples` with raw
    `ArrayBuffer`s, `presets`), never on the server.
  - Other IndexedDB stores, found with `grep -rln "openDB(\|indexedDB"`:
    `rmh-library-reader` (`lib/library/reader-store.ts`, cached book pages),
    `lib/tf2-hud/local-drafts.ts` (HUD drafts), Balatro's runtime, rejoin and
    replay stores (`features/balatro/engine/runtime.ts`,
    `mp/rejoin/rejoin-store.ts`, `mp/replay/store.ts`), the rmhOS home
    (`features/rmhos/engine/home-store.ts`) and Hearthworks saves
    (`features/hearthworks/engine/save/idb.ts`). Unsent drafts use
    `localStorage` through `hooks/useDraft.ts`. The service worker keeps
    `rmh-static-*`, `rmh-images-*` and asset caches (`public/sw.js`).
  - Signing out (`components/shell/AccountMenu.tsx`,
    `components/shell/GlobeBar.tsx`, `components/site/CommandPalette.tsx`,
    `components/settings/SignInMethodsPanel.tsx`) calls `authClient.signOut()`
    and clears nothing. Deleting the account
    (`components/site/DeleteAccountPanel.tsx`) signs out and clears nothing.
  - No settings page says what is stored locally.
- **Decisions:**
  - **One registry of every local store**, `lib/device-data/registry.ts`
    (client-safe, no imports from the stores): id, kind (`indexeddb`,
    `localstorage-prefix`, `cache-prefix`), the database name / key prefix /
    cache prefix, an i18n label key and a "personal" flag (whether it holds the
    member's own content, as opposed to static site assets). A source-scan test
    fails when any file under `lib/`, `features/`, `components/`, `hooks/` or
    `stores/` opens an IndexedDB database or writes a `localStorage` key whose
    name or prefix is not in the registry — the same read-path-registry pattern
    as sprint 04's, so a new store cannot appear without a line here.
  - The page lists each store that exists in this browser with what it holds
    (count of records for IndexedDB object stores, number of keys for a prefix,
    entries for a cache) and its size where the browser can say
    (`navigator.storage.estimate()` for the total; per-store sizes are summed
    from record byte lengths only for the Studio samples and library pages,
    where the bytes are the point). Each row has "Clear" (`useConfirm`, naming
    what goes); the page has "Clear everything on this device".
  - Clearing deletes the database (`indexedDB.deleteDatabase`), removes the
    prefix's keys, or deletes the caches. Site preferences that are not
    personal (theme, language, a remembered tab) stay unless the member chooses
    "Clear everything", which also clears them and reloads.
  - **Sign-out offers to clear.** A switch on the page, "Clear this device when
    I sign out", stored locally (it is a per-device choice); when on, every
    sign-out path calls one `clearPersonalDeviceData()` before
    `authClient.signOut()`. The four sign-out call sites go through one helper
    `signOutAndMaybeClear(confirm)` in `lib/device-data/sign-out.ts` (it takes
    the caller's `useConfirm` function, so it stays a plain module).
  - **Never destroy unsynced work without asking.** The Studio's local store
    (`lib/studio/project-store.ts`) records no sync state — a local project
    may or may not match its server copy, and samples exist only here — and
    `useDraft` drafts are unsent by definition. So before an automatic clear
    on sign-out, the helper counts local Studio projects, samples and drafts;
    if any exist it shows one confirm naming them ("3 Studio projects, 12
    samples and 1 unsent draft exist only on this device") with **"Sign out
    and keep them"** (the default focus, clears everything else that is
    personal) and **"Sign out and delete them"** (danger), plus Cancel. The
    switch is off by default; with it off nothing changes from today.
    "Clear" on the Studio row of `/settings/device` names the same counts in
    its confirm.
  - **Deleting the account clears this device's personal data**, after the
    server confirms the deletion and before the sign-out, through the same
    helper as a sign-out with the switch on (whatever the switch says). Because
    deletion is scheduled with a grace period and can be cancelled
    (`lib/account/deletion.server.ts`), Studio projects, samples and drafts
    get the same keep-or-delete confirm, defaulting to keep; everything else
    personal is cleared. The deletion panel's copy gains one sentence about
    other devices (which cannot be reached) pointing to this page.
  - A blocked delete (another tab holds the database open) is reported per row
    ("Close other tabs of this site and try again"), never ignored.
  - No server change: this page never sends what it finds to the server.

## Functional requirements

1. FR-1 `/settings/device` (signed-in or not: device data exists for visitors
   too; the sign-out switch shows only when signed in) listing every registered
   store present in this browser, its contents summary and size where known.
2. FR-2 Per-row Clear and "Clear everything on this device", each confirmed
   with `useConfirm`; the list refreshes; a polite announcement says what was
   cleared.
3. FR-3 The "Clear this device when I sign out" switch and the shared sign-out
   helper used by all four sign-out call sites.
4. FR-4 `DeleteAccountPanel` clears personal device data after a successful
   deletion and before signing out, and its copy gains the one sentence about
   other devices.
5. FR-5 A settings-nav entry "This device" (group: account).
6. FR-6 Stores absent from this browser are not listed; an empty state says
   "Nothing from this site is stored on this device".

## Non-functional requirements

- **Correctness:** clearing is complete: after "Clear" on Studio, reopening the
  Studio shows no local projects or samples; the test proves the database is
  deleted, not emptied store by store.
- **No observer or loop:** the page reads once on open and after each clear
  (React Query with `staleTime: 0`, no polling, no `ResizeObserver` or timers).
- **SSR:** the page renders its frame server-side and reads storage only in the
  browser; the list arrives after paint through `components/ui/arrive.tsx`.
- **Steel:** rows on rules, `t-meta` sizes; the Clear buttons are the danger
  variant, and the page has no ink primary (R4 is "at most one").
- **Accessibility:** each Clear button names its row; results announced.
- **i18n:** `device-data`; sizes through the site's locale number formatter.

## Data model and API

None. New client-only modules: `lib/device-data/registry.ts`,
`lib/device-data/inspect.ts` (per-kind readers), `lib/device-data/clear.ts`,
`lib/device-data/sign-out.ts`; page `app/routes/_site/settings/device.tsx`;
`components/settings/DeviceDataPanel.tsx`. Changed: the four sign-out call
sites and `DeleteAccountPanel.tsx`.

## Testing requirements

- Main suite `lib/device-data/__tests__/device-registry.test.ts`: the source
  scan (every `openDB(`/`indexedDB.open(` name and every `localStorage.setItem`
  key literal or prefix resolves to a registry entry; template keys are matched
  by their literal prefix), and every entry is used somewhere (no dead lines).
- Main suite `lib/device-data/__tests__/clear.test.ts` with `fake-indexeddb`
  if it is already a dev dependency (check `package.json`; if not, mock
  `indexedDB.deleteDatabase` and assert the calls): clear one, clear all,
  blocked delete reported, personal-only clear on sign-out keeps the theme.
- Component test: the sign-out helper clears before signing out only when the
  switch is on; with Studio projects, samples or a draft present it asks
  first, "keep" leaves `rmh-studio-db` and the drafts intact and clears the
  rest, Cancel signs nothing out; with none present it does not ask; the
  deletion panel clears after a successful delete (asking the same way) and
  not after a failed one.
- Gate tests: settings-nav labels, sitemap coverage (`/settings/device` in
  `EXCLUDED_ROUTES`), OG coverage, `useeffect-fetch-ratchet`.

## Acceptance criteria

- [ ] After recording samples in the Studio, the page shows the Studio row
      with its sample count and size; Clear removes them and the Studio opens empty.
- [ ] With the sign-out switch on and Studio samples present, signing out asks
      first; "Sign out and delete them" leaves no Studio, library or draft data
      behind, "Sign out and keep them" leaves only the Studio data and drafts;
      the theme is kept either way.
- [ ] Deleting the account clears this browser's personal data, asking before
      it deletes Studio work or drafts.
- [ ] A new IndexedDB store added without a registry line fails the test.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Clearing other devices remotely, uploading Studio samples (sprint 05 rejected:
an owner decision), browser cookies other than the session, the operating
system's own caches.
