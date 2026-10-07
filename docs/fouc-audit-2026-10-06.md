# FOUC audit — 2026-10-06

Triggered by: **"Do a full enterprise-grade robust and substantial FOUC audit.
Ensure it tests all pages, no FOUCs should be in the final website."**

This pass built the thing that was missing rather than reasoning about the code:
a harness that drives the **built** site in Chromium and measures what every page
looked like, frame by frame, across nine stored-preference profiles. How it works
and why each detector asks its question the way it does is in
[`fouc.md`](./fouc.md); this document is what it found.

## Method

- `testing/e2e/fouc.mjs` against `.output` (a real `pnpm build`, served by
  `node .output/server/index.mjs`) on a 4-core box with a migrated Postgres, a
  signed-in session, and **CPU throttled 4×**.
- Route set **parsed** from `app/routeTree.gen.ts`: **287 pages audited, 18
  excluded** (RSS/XML/JSON/`text/plain`/redirect server routes), **0
  unaccounted**. `lib/__tests__/fouc-contract.test.ts` fails if that third number
  is ever non-zero.
- Six gated detectors: wrong ground at first paint · root-level restyle after
  first paint · a stylesheet that restyled live content · a web font that swapped
  under visible text · hydration mismatch · post-paint layout shift. Plus a
  compositor-frame detector on real `Page.startScreencast` frames.
- **The detectors are proven, not assumed.** `--self-test` sabotages a real page
  five ways and asserts each matching detector fires. Run it before trusting a
  green result.

### The caveat that matters

Chromium in this container does not fetch `fonts.gstatic.com` from a page
context, so the **`font-swap` detector never had a real swap to find**. A clean
`font-swap` column below is _absence of evidence_, not evidence of absence —
see [Not verified here](#not-verified-here). Everything else was measured.

## The headline

**Every game and full-screen app on the site flashed on every load, and had been
since `html.app-route` existed.**

That class is applied by a `useEffect` in `components/Providers.tsx`, so it
landed after hydration. `app/globals.css` keys three visible things off it:

- `--site-surface` and its family resolve to their **opaque** twins, because the
  aurora is gated off on these routes and a translucent surface there has no
  shared scene to sample — the CSS block's own comment records that light-theme
  apps composited to ≈`#8a8a8a` and "lost all their contrast";
- `scrollbar-gutter: stable` is **withheld**, because an app route does not scroll
  the document;
- the `.site-aurora` layers paint nothing.

So every game loaded with the site's translucent surfaces over its own backdrop,
a reserved scrollbar gutter, and a live aurora — then snapped out of all three at
once. Measured **~1.9s after first contentful paint on `/isleworks`** at 4×
throttle: a full-width horizontal jog plus a contrast pop, on ~34 routes.

It is now stamped pre-paint by `themeScript`, from the same `app` boolean that
already picks the ground. The effect stays — it is the client-navigation path
(the script runs once per document, not once per route) and the recovery path if
the script throws — but it is a no-op on a hard load, which is where the flash
was.

## Findings

| #   | Page(s)                                                         | Measured                                                                                                                                     | Status                                                                       |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | ~34 game/app routes                                             | `html.app-route` applied ~1.9s after FCP → surfaces, gutter and aurora all change                                                            | **fixed, verified**                                                          |
| 2   | `/temple-of-joy`                                                | document ground `#0b0b0b` → `#fbf9f4`, **Δluma 0.945**, full viewport, every load                                                            | **fixed, verified**                                                          |
| 3   | `/daily/lights-out`, `/lights-out`                              | **0.182** of layout shift after FCP (budget 0.1)                                                                                             | **fixed, verified**                                                          |
| 4   | `/kowloon-knockout`                                             | restyle under `high-contrast`                                                                                                                | **fixed by #1, verified**                                                    |
| 5   | `/laundry-sort`                                                 | **0.443** of layout shift after FCP — geometric only, 0.0000 pixel change                                                                    | **allowlisted, capped, with the measurement**                                |
| 6   | `/discord/`, `/discord/rmhbox`, `/discord/lights-out`           | ground `#fff` → `#000` (**Δluma 1.000**) plus theme class, accent, surface, `color-scheme` and root font size all landing after FCP          | **open — reported, not fixed**                                               |
| 7   | `/slice-it/player/$handle` (404 branch)                         | ground `#16161a` → `#ffffff`, and **30.5% frame divergence** — a real transient flash                                                        | **open — reported**                                                          |
| 8   | `/slice-it/` under `comfort`                                    | every root attribute set before paint is CLEARED after hydration (`"app-route readable-font"` → `""`, `data-density` → absent) + 0.201 shift | **open — reported**                                                          |
| 9   | `/daily/lights-out` under `comfort`                             | residual **0.109** (was 0.182); the scrollbar cause is verified gone                                                                         | **open — reported**                                                          |
| 10  | six decorative families site-wide, `MedievalSharp` on `/altair` | not measurable here                                                                                                                          | **reported**                                                                 |
| 11  | `/dunesday`                                                     | ground `#0b1a3a` → `#bfe6ff`, **Δluma 0.738**, every first load                                                                              | **fixed, verified**                                                          |
| 12  | `/daily/globeset`                                               | **7.3%** frame divergence, signed in and out                                                                                                 | **partly fixed** — the scrollbar re-centring is gone; the rest is finding 13 |
| 13  | `/daily/globeset`, `/rmhtype` (signed in)                       | the server-rendered page is **replaced by a spinner** for ~750–800ms, then returns                                                           | **open — reported**                                                          |

Verified by re-running the affected routes across **all nine profiles** after the
fixes (189 runs): findings 1–4 are gone, and what is left is 6–9 plus the
allowlisted 5.

### 2. `/temple-of-joy` — a full-viewport black-to-cream flash

The temple paints the document itself, from `useDocumentTheme` in
`components/temple-of-joy/hooks.ts`, and for a good reason the hook explains:
`.toj` is `position: fixed; inset: 0`, so the strips behind the status bar and
the overscroll gutter are the document's to paint, and on a game route no
`style-*` class applies so `--site-bg` would keep its light default. The hook is
right. It is an **effect**, so it ran after hydration, and the pre-paint script
had already painted `APP_THEME_BG` near-black under a page whose ground is
Dawn's cream `#fbf9f4`.

`APP_ROUTE_THEME_BG` is the existing mechanism for exactly this — it is how Slice
It, the PF2e board and the dossier avoid the same flash — and the temple needed
two things it could not yet express:

- **`darkWhen`** — the temple stores a _named_ theme (`theme: 'dawn' | 'vespers'`,
  at the top level of `temple_of_joy_save_v2` rather than under a zustand
  `state`), where every other entry stores a boolean.
- **`defaultDark`** — the temple **opens light**. The map assumed dark when
  nothing is stored, which is right for the `--app-*` tier and exactly backwards
  here.

Both default to the old behaviour, so no existing entry changed. A returning
Vespers player now gets `#16130e` pre-painted too, because the temple already
mirrors its save into `localStorage`.

### 3. `/daily/lights-out` — the cause was the scrollbar, not the height

0.182 of post-paint shift, attributed to `div.max-w-lg.mx-auto`. The first
hypothesis — that the page collapsed from the Suspense fallback's `h-screen` to
the column's natural height — was **wrong**: adding `min-h-screen` changed
nothing and the shift stayed at 0.182.

The real cause: `/daily` is in the games catalog, so `html.app-route` withholds
`scrollbar-gutter: stable`. When the puzzle's content grew past the window the
document gained a scrollbar, the viewport narrowed by its width, and `mx-auto`
re-centred the **whole column sideways** in front of the reader.

`.app-page` is the documented contract for precisely this shape — a full-screen
screen that is a _document_ — and `html.app-route:has(.app-page)` takes the
gutter back. It also brings `100svh` rather than `100vh` as the floor (so a short
puzzle fills the window without inventing a scrollbar on a phone) and the
home-indicator inset. Lights Out was the only one of the seven daily puzzles that
needed it; the other six render inside the full-screen 3D desk scene.

### 4. `/laundry-sort` — a real shift with no visible cost

0.443, the largest measured anywhere, from Laundry Sort's 16:9 stage
(`components/laundry-sort/AspectStage.tsx`): a ResizeObserver sizes it, so it is
0×0 in the server HTML and grows to the letterbox once JS has measured the
container.

Three measurements say the reader sees none of it: the box is `bg-black` inside a
`bg-black` parent, it renders **no children** until the measurement lands
(`size.width > 0 ? children : null`), and the compositor frames across the shift
show **0.0000 divergence and 0.0000 late-unsettling**.

Every way to remove the geometry change costs more than it saves:

- CSS `aspect-ratio` with both max-constraints is **explicitly rejected** in that
  file's own docblock, because browsers disagree when the container is the
  constrained axis — and the pixel size is load-bearing regardless (the WebGL
  drawing buffer and the pointer mapping both read it);
- a layout effect does not help: the 0×0 box is in the **SSR HTML** and is painted
  long before hydration;
- not server-rendering the stage trades an invisible geometric shift for a real
  blank frame.

So it is in `KNOWN_SHIFTS` in the harness, with that reasoning and a **0.5 cap** —
a worse shift still fails the audit, and a new route cannot join the list by
accident. That list is one-directional, like the allowlists in
`design-consistency.test.ts`.

### 6. `/discord/*` — no pre-paint script at all

`__root.tsx`'s `head()` returns a deliberately minimal head for a Discord
Activity: `scripts: []`, no fonts, one stylesheet. The reason is recorded there —
Discord's CSP blocks inline scripts, and a blocked `themeScript` was causing a
hydration mismatch. The consequence is that on `/discord/*` **nothing is applied
before paint**, so the whole appearance lands after hydration: measured
`#ffffff` → `#000000` (Δluma 1.000) on the ground, plus `style-graphite`,
`--site-accent` `#000` → `#2997ff`, `--site-surface` `#ffffffb8` → `#1c1c1eb8`,
`color-scheme` light → dark, and under `comfort` the root font size `16px` →
`20px`.

**Reported rather than fixed, and the reason is the measurement's own limits.**
The audit loads these routes as top-level documents; in production they only ever
run inside Discord's Activity iframe, where two things the harness cannot
reproduce change the picture — the iframe's CSP (which decides whether any fix
works) and partitioned storage (which decides whether the stored theme the flash
reveals is even reachable). Shipping a change to a production surface on a
measurement taken outside it is how you trade a known flash for an unknown
breakage.

Two candidates, in order of preference:

1. **Register `/discord` as app-tier** (`THEME_EXCLUDED_ROUTES`). These routes are
   full-screen games — `/discord/rmhbox`, `/discord/lights-out` — and every other
   game route is app-tier. That alone removes the theme-class, accent, surface and
   `color-scheme` half of the flash, because `Providers` would stop applying the
   site theme there at all.
2. **Give the Discord head the ground without a script.** A `backgroundColor` on
   `<html>`/`<body>` is an attribute, not an inline `<style>` or a script, so no
   `script-src` or `style-src` directive can block it. The Discord head already
   carries a stylesheet link, so the tier's CSP is not absolute.

What to check first: whether Discord's Activity CSP permits a same-origin external
script. If it does, the whole pre-paint stack can be served as a file and the
Discord head stops being a special case.

### 7. `/slice-it/player/$handle` — the 404 shell under an app ground

Audited with a handle nobody holds (`fidelity: 'shell'`), so the loader throws
`notFound()` and the **shared site `NotFound` component** renders: white, Daylight,
`--site-*`. The pre-paint script had already painted Slice It's `#16161a` and set
`data-app-dark="1"`, because the path matches the `/slice-it` prefix. The result is
a dark-to-white flash plus `data-app-dark` going from `1` to absent.

**Not fixed**, because it is a design question rather than a bug with one right
answer: either `notFoundComponent` for an app-tier route keeps the app's chrome
(so a missing player reads as part of the game), or the pre-paint script learns
that a 404 is always site-tier (which it cannot know before the loader runs). The
first is the better product answer and belongs with whoever owns the app tier's
error states. It affects only the not-found branch of app-tier sub-routes.

### 8. `/slice-it/` under `comfort` — the root attributes are cleared, not corrected

The one finding the audit surfaced that it cannot yet explain, recorded with its
evidence because a half-diagnosed flash is still a flash.

On `/slice-it/` (which 307s to `/slice-it?q=&sort=recent&view=grid`) with the
`comfort` profile, every root-level attribute the pre-paint script set is **cleared**
after first paint rather than changed: `<html>` class `"app-route readable-font"` →
`""`, `data-density` `"compact"` → absent, `data-app-dark` `"1"` → absent,
`color-scheme` dark → light, `--site-surface` `#fff` → `#ffffffb8` (the opaque
app-tier twin back to the translucent site one). Plus 0.201 of layout shift.

`readable-font` and `data-density` going away at the same time as `app-route` rules
out the `isAppThemeRoute` path on its own — those three have different writers. The
shape is consistent with the appearance store applying its DEFAULTS before it
rehydrates from `localStorage`, which would be a site-wide mechanism that only
shows where the rehydration is late enough to catch. Reproducing it in a browser
and finding the writer is the next step; the profile and route above do it
reliably.

### 9. `/daily/lights-out` under `comfort` — a residual 0.109

After the `.app-page` fix the shift is 0.182 → **0.109** and appears only under
`comfort` (a 125% root font scale). The original cause is verified gone: measured
on the built page, `html` carries `app-route` before paint, `.app-page` is present,
`scrollbar-gutter` computes to `stable`, and `documentElement.clientWidth` equals
`window.innerWidth` — the gutter is reserved and the column no longer re-centres.

The residual is content reflow at the larger font scale, and it is 1.09× the
budget. It is **not** allowlisted: `KNOWN_SHIFTS` requires evidence that a shift
costs the reader nothing, and there is none for this one.

### 10. Deferred decorative fonts

`deferredFontsScript` loads six families from Google Fonts after the page is
interactive, and `/altair` loads `MedievalSharp` the same way through
`gameRouteHead`'s `fontsUrl`. All six are used in the site's CSS, and `/altair`
has **visible text whose first-choice family is `MedievalSharp`** — on a real
network that text paints in Georgia and reflows.

This is a deliberate, documented trade (the alternative was a render-blocking
third-party request that `lib/seo-catalog.ts` records as having made games paint
_nothing_ until `fonts.googleapis.com` answered). The audit flags it rather than
changing the site's font strategy unilaterally. If it is to be removed, the
levers are metric-matched fallbacks (`size-adjust` / `ascent-override` on a local
fallback face, so the swap costs no reflow) or preloading the one family a page
actually uses above the fold — not reverting to render-blocking.

### 11 & 12 — the two `main` brought in, caught the same hour

The branch merged `main` (18 commits, two new routes) and the audit found a flash in
**both** new pages on the first run against them. Neither needed a new idea; each was
a second instance of something this pass had already fixed, which is the argument for
the gates below in its strongest form.

**`/dunesday` — Δluma 0.738, every first load.** `main` added the planner _with_ an
`APP_ROUTE_THEME_BG` entry, correctly naming both grounds. What the entry could not
say — because the option did not exist when it was written — is **which way the page
opens**. The map's old behaviour was to assume dark when nothing is stored, so a first
visit pre-painted deep night blue `#0b1a3a` under a page whose default is Aero day
`#bfe6ff` (`night: false` in `lib/dunesday/state.ts`). `defaultDark: false` is the
whole fix.

That makes twice — Temple of Joy and Dunesday — that a silent default produced a
full-viewport flash, so the default is no longer inheritable: a new gate requires
**every** entry to carry either `system: true` or an explicit `defaultDark`, and the
pre-existing entries now state theirs. A reviewer adding a page has to look up what
its store defaults to, which is the step both bugs skipped. Verified to fail, naming
`/dunesday`, when that one line is removed.

**`/daily/globeset` — 7.3% frame divergence, signed in and out.** Byte-for-byte the
Lights Out bug: a bare `mx-auto max-w-5xl` column on an app-tier route, where
`html.app-route` withholds `scrollbar-gutter: stable`, so the board outgrowing the
window added a scrollbar, narrowed the viewport, and `mx-auto` re-centred the whole
column sideways. Same fix: `.app-page`.

Worth noting what caught these. The route set is **derived** from
`app/routeTree.gen.ts`, so `/dunesday` and `/daily/globeset` were in the audit the
moment the merge landed — 287 pages became 289, with no list to update and nothing
silently unaudited. That is the property the coverage gate exists to protect.

### 13 — the worst thing the audit found: a finished page replaced by a spinner

Not a flash of _unstyled_ content — a flash of **no** content, and the only finding
here a reader would describe as the page breaking.

On `/daily/globeset`, and on `/rmhtype` while signed in, the sequence measured from
the compositor frames is: the **server-rendered page paints complete** (title,
controls, stats row, leaderboards) and stays up for ~1.1s and ~1.5s respectively —
then the whole page is **replaced by `GameLoadingFallback`**, a blank sheet with a
spinner, for **~750ms** and **~800ms** — then the page returns.

Measured as 7.3% and 10.3% of frame divergence, with `stillMoving` at 0.0000 and
0.0001: both pages are fully settled by the end, so this is not an animation the
detector mistook for a flash. The filmstrips show it plainly.

**Mechanism.** Both routes render a `React.lazy` component inside a `<Suspense>`
whose fallback is `GameLoadingFallback`. React 19 server-renders the real component,
so the HTML is complete and paints. On the client, hydration reaches the boundary,
the chunk has not arrived, the boundary **suspends**, and React swaps in the
fallback — discarding markup the reader is already looking at. When the chunk lands
it renders again.

**Why only these two.** `/isleworks` uses the identical `lazy()` + `GameLoadingFallback`
shape and measures 0.000 divergence, settled at +0ms. The difference is what the
server renders: a client-only game SSRs to the fallback anyway, so there is nothing
to lose. These two SSR a _populated_ page. `/daily/alibi` (0.004),
`/daily/lights-out` (0.000) and `/laundry-sort` (0.006) are clean too, so this is not
a property of the pattern — it is the pattern **plus** real server-rendered content
**plus** a chunk slow enough to suspend.

**Reported, not fixed**, because every fix is a bundle-strategy decision this audit
should not make alone:

- The direct fix is a `<link rel="modulepreload">` for the inner chunk in the route's
  `head()`, so it downloads in parallel with the entry bundle and hydration never
  suspends. The obstacle is getting the hashed chunk URL into `head()` — a Vite
  manifest lookup or an `import.meta.url` trick, neither of which should be invented
  in a FOUC PR.
- Dropping the inner `lazy()` and letting TanStack's route-level split carry the game
  is cleaner, but these route modules are statically imported by `routeTree.gen.ts`,
  so it moves code toward the entry graph — straight into `check:bundle-budget` and
  `check:entry-composition`, which is why the inner `lazy()` is there in the first
  place.

What is not in doubt is the measurement: two pages show finished content, blank it
for the better part of a second, and bring it back.

## Not verified here

| Thing                                | Why                                                                                                                                                                                                                                                                        | What would verify it                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `font-swap` on any page              | Chromium in this container does not fetch `fonts.gstatic.com` from a page context, so no font ever loaded late. The detector is proven by `--self-test` (which loads the site's own self-hosted Inter under a new family after paint) but had no production swap to catch. | Re-run the audit on a box with outbound access to Google Fonts. |
| The 9th profile × the full route set | A whole-site pass is ~2300 runs. The breadth pass reached **923 runs across 8 profiles** before it was stopped to pick up the fixes; the affected routes were then re-run across **all nine**.                                                                             | `node testing/e2e/fouc.mjs` with no flags, ~60 min.             |
| Client-side navigation               | Every measurement here is a **hard load**. A soft nav has its own ordering (the route chunk and its CSS arrive while the previous page is still on screen) and the `.lib__shelf` guard in `globals.css` exists because of it.                                              | A soft-nav mode driving the router rather than `page.goto`.     |
| iOS WebKit                           | `platformScript`'s `ios-webkit` tier, the `theme-color` omission and the mobile aurora mirroring are all Safari-specific.                                                                                                                                                  | The same harness against WebKit.                                |

## What the audit's own bugs taught

Worth recording, because each one is a way a FOUC audit can be _confidently
wrong_, and the first three produced a clean report on a site that was flashing.

1. **A dead instrument reads exactly like a clean site.** A regex escape eaten by
   the template literal that carries the in-page script killed it, and every page
   came back green. A missing `window.__fouc` is now itself a finding, the source
   is parse-checked by the gate, and `--self-test` exists.
2. **The right question at the wrong time inverts the answer.** Asked after the
   page settled, every lazily-loaded game's stylesheet looked like a flash. Asked
   at the frame the sheet joined the cascade, none of them were: Vite's
   `__vitePreload` awaits a chunk's CSS before executing the chunk. Measured on
   `/isleworks` — stylesheet applied at **553ms**, first `.isw` element at
   **1020ms**.
3. **Chromium stops screencasting a page that stops changing.** ~26 frames over
   ~700ms, then silence — so a flash at 1.1s was invisible to the pixel detector
   while being plainly visible to a human. Fixed with a one-pixel opacity
   heartbeat (105 frames / 3521ms); the three variants measured are in `fouc.md`.
4. **An unthrottled audit under-reports.** `/daily/lights-out` reported 0.182 of
   shift in one run and nothing in the next, on the same build — the difference
   was only how loaded the box was. CPU is now throttled 4× by default, which is
   also the device class that actually suffers FOUC.
5. **A redirect will absorb a page silently.** `page.goto` follows redirects, so a
   signed-out run called ~40 `/admin/*` pages clean having loaded the home page
   instead. The report now separates "visited as themselves" from "redirected
   away", and a `signed-in` profile closes the gap.

## What stops this from coming back

`lib/__tests__/fouc-contract.test.ts`, in `GATE_TESTS` — no browser, runs on every
commit:

- **Every root-level visual token written to `<html>` from client code must also be
  written by the pre-paint scripts.** This is the `app-route` bug as a rule.
- **Every writer of the document ground must be a pre-paint script, the one shared
  helper, or a route registered in `APP_ROUTE_THEME_BG`.** This is the Temple of
  Joy bug as a rule, and it is scanned across the whole tree — the temple's flash
  was in a per-game hook, nowhere near the shared appearance modules the first
  rule watches. Verified to fail, with the file named, when the temple's entry is
  removed.
- **Every page in the generated route tree is audited or excluded with a reason**,
  and an exclusion reason must name a mechanism.
