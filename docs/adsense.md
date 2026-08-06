# Google AdSense

How advertising works on rmhstudios.com: what renders, what decides whether it
renders, what has to be configured, and what to check when a unit is blank.

Ads are **off by default**. A checkout with no `VITE_ADSENSE_CLIENT_ID` — every
dev machine, and any deploy that hasn't enabled them — renders no ad markup,
loads no Google script, and serves a 404 at `/ads.txt`. Everything below is
inert until that variable is set.

## The shape of the integration

**Manual placements, not Auto ads.** Auto ads let Google's page scan decide
where units go, which on this codebase means it may pick the inside of a
full-screen game canvas, the radial hub, or a checkout step — none of which
anyone gets to review before it ships. Every unit here is a named placement
written into a specific page.

**Nothing loads speculatively.** The `adsbygoogle.js` tag is deliberately _not_
in `__root.tsx`'s `head()`. It is injected by the first `<AdSlot>` that decides
it may render, and then only once the slot is within 400px of the viewport. A
member, a visitor who hasn't answered the cookie banner, a page with no ad unit
on it, and a reader who never scrolls to the bottom of an article all make zero
requests to Google.

## Files

| File                                        | What it is                                                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `lib/ads/adsense.ts`                        | Config + the pure gate (`adsAllowed`, `isAdFreeTier`, `resolveTier`, `adsPersonalized`, placements, the excluded-path list) |
| `lib/ads/loader.ts`                         | Lazy script injection, the personalisation flag, `pushAd()`                                                                 |
| `lib/entitlements/tiers.ts`                 | `hasAdFree()` — which tiers have paid for the site, and `parseTier()`                                                       |
| `lib/entitlements/features.ts`              | The `ad-free` member feature, which is what the membership page advertises                                                  |
| `hooks/useAdsEnabled.ts`                    | Resolves the live inputs (path, tier, whether the tier is KNOWN, consent, Discord)                                          |
| `components/ads/AdSlot.tsx`                 | The unit itself: viewport-deferred load, reserved height, unfilled collapse, the label                                      |
| `app/routes/ads[.]txt.ts`                   | `/ads.txt`, generated from the publisher id                                                                                 |
| `components/site/CookieConsent.tsx`         | The banner whose answer gates all of the above, plus `clearCookieConsent()`                                                 |
| `components/site/CookieConsentControls.tsx` | Settings → Privacy: change or withdraw that answer                                                                          |
| `lib/__tests__/adsense.test.ts`             | The gate's test — every "an ad must not appear here" rule is pinned there                                                   |

## When an ad may render

`adsAllowed()` fails closed on every axis. All of these must hold:

1. **A publisher id is configured.** No `VITE_ADSENSE_CLIENT_ID`, no ads.
2. **The cookie banner has been answered.** An _unanswered_ banner is not
   permission — the ad tag reads and writes storage the moment it loads, so it
   waits behind the choice the banner exists to collect. This is also why the
   gate can't be evaluated during SSR: the answer lives in `localStorage`, so
   slots appear after mount, in space the layout already reserved.
3. **The viewer's entitlement is known.** The session resolves _after_ the first
   client render, so for a moment a member is indistinguishable from a
   signed-out visitor. `sessionResolved: false` means "don't know yet", which is
   not "free" — see [Ad-free membership](#ad-free-membership) below.
4. **The viewer is not on a paid plan.** `starter`, `pro` and `enterprise` see
   no ads — including coin-funded gift memberships, which `getUserTier()`
   already folds into the same value.
5. **The path is not excluded.** `/login`, `/settings`, `/wallet`, `/checkout`,
   `/messages`, `/discord`, `/embed`, `/offline`, `/secret`, `/api`. Some of
   these are policy (Google prohibits ads behind a sign-in wall and beside
   payment forms), some are mechanical (Discord's iframe CSP blocks the tag
   outright), some are simply "there is no publisher content here".
6. **Not inside a Discord Activity iframe.**

Placements are explicit, so in practice a unit only exists where one was
written; the excluded-path list is the second lock, for the case where a
placement is added to a shared component that later appears somewhere new.

### Ad-free membership

Removing ads is one of the things a membership is sold on, so it is a registered
member feature (`ad-free` in `lib/entitlements/features.ts`) and not a private
list of tier names inside the ad code. That buys three things: the membership
page renders the "No ads" card from the same declaration the gate reads, the
gate and the card cannot drift apart (`lib/__tests__/member-features.test.ts`
pins them together), and a tier added above `starter` later is ad-free the day
it exists, because `hasAdFree()` is a rank comparison rather than a set.

The subtle half is **when the tier is known**, which is what `sessionResolved`
above is for. Three states, and only the first two are answers:

| State                                     | Ads           | Why                                                                               |
| ----------------------------------------- | ------------- | --------------------------------------------------------------------------------- |
| No user (`tier` absent, session ready)    | on            | A signed-out visitor. This is the traffic the free tier is funded by.             |
| A known tier                              | `hasAdFree()` | `free` sees ads; every paid tier does not.                                        |
| Session pending, or a tier we can't parse | off           | Not evidence of a free account. Guessing wrong here bills a paying member in ads. |

Two paths lead to that third row and both are real: the client session is still
in flight on first render, and `components/Providers` renders a persisted session
snapshot (`localStorage`) while it loads — a snapshot written by an older build
can lack the `tier` field entirely. Both read as "signed-in, entitlement
unknown", and both must show nothing.

#### Where the tier comes from

Failing closed on an unknown tier is only affordable if the tier is rarely
unknown, so `useAdsEnabled` reads it from two places and `resolveTier()`
reconciles them:

| Source                                           | Timely?                                      | Authoritative?                      |
| ------------------------------------------------ | -------------------------------------------- | ----------------------------------- |
| The live client session (`useSession`)           | No — resolves a round trip after first paint | Yes — reflects a sign-in or upgrade |
| The root loader payload (`__root.tsx`, from SSR) | Yes — arrives with the document              | As of document render               |

Live wins whenever it has an answer; the server's covers the window before that.
Gating on the live session alone would delay every ad on the site, including for
the signed-out majority who were never going to have a tier — so
`getInitialUser` sends `tier` down with the SSR-resolved user, and the first
client render already knows. Gating on the server's answer alone would keep
serving ads to someone who subscribed thirty seconds ago, since the root loader
holds its data for five minutes.

Both are read defensively. A payload that is missing, reshaped, or from a
session lookup that timed out yields "no answer" rather than a guess, and the
gate waits for the client session — the failure direction is _an ad is late_,
never _an ad leaks_.

### Personalisation

"Essential only" still serves ads, but sets
`adsbygoogle.requestNonPersonalizedAds = 1` before the tag executes, which is
Google's documented path for that answer. The creative is then chosen from the
page's content rather than from a profile of the reader.

> **If you are extending this for EEA/UK compliance:** non-personalised is not
> the same as cookie-less. NPA still uses storage for frequency capping and
> click-fraud detection. A full TCF v2 posture wants a certified CMP in front of
> this flag; the flag is the floor, not the ceiling.

## Placements

Declared in `AD_PLACEMENTS` (`lib/ads/adsense.ts`). Each reserves a `minHeight`
before the creative exists, so a unit that fills 800ms into the read doesn't
shove the paragraph out from under the reader — a filled slot has a CLS of zero.

| Placement      | Where it renders                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `article-end`  | Below the body of a blog post (`/blog/$slug`) and a news article (`/news/$slug`)                                                             |
| `index-footer` | Bottom of the library index, after the last row                                                                                              |
| `rail`         | The desktop live rail (`components/feed/RightSidebar.tsx`), above the footer links — dropped entirely on narrow screens with the rail itself |

Adding a placement: add an entry to `AD_PLACEMENTS`, create the matching unit in
the AdSense dashboard, add `<placement>=<slot id>` to `VITE_ADSENSE_SLOTS`, and
render `<AdSlot placement="…" />` where it goes. A placement absent from the slot
map is simply disabled, so units can be rolled out one at a time.

One thing to know before putting two units on the same page: `adsbygoogle.push({})`
claims the next un-processed `<ins>` in **document order**, not the one whose code
called it. Each element carries its own `data-ad-slot`, so every unit still gets
the right creative — but on a page with two units where only the second is ever
scrolled to, the single push fills the first. No page ships two units today.

The feed is deliberately **not** a placement. `FeedList` is window-virtualized
with measured row heights round-tripped across remounts for scroll restoration;
splicing a variable-height third-party iframe into that row set is a good way to
break back-navigation scroll position, and an in-feed ad unit that looks like a
post is also the placement most likely to be mistaken for site content.

## Configuration

Two build-time variables. Both are **baked into the client bundle** (`VITE_`
prefix), so changing either needs a rebuild, not a restart.

```bash
# Publisher id — either the `ca-pub-…` or `pub-…` spelling works.
VITE_ADSENSE_CLIENT_ID=ca-pub-0000000000000000

# Placement → ad-unit id map.
VITE_ADSENSE_SLOTS=article-end=1234567890,index-footer=2345678901,rail=3456789012
```

One map variable rather than one variable per placement, because every `VITE_`
value has to be threaded through four files to reach a production build. Those
files, for the two that exist:

- `Dockerfile` — `ARG` + `ENV` in the vite-builder stage ✅ done
- `docker-bake.hcl` — `variable` + the `frontend_args` map ✅ done
- `docker-compose.yml` — the shared `build.args` block ✅ done
- `.github/workflows/deploy.yml` — **not done; see below**

### The one remaining step: deploy.yml

Production builds happen in CI, so until `deploy.yml` passes these through,
setting the repository variables alone changes nothing — the bake step never
sees them and every production build ships with ads off.

The change could not be committed here: pushing a branch that touches
`.github/workflows/` needs a token with the `workflow` scope, which this one
does not have. Apply it by hand — in the **"Build + push both images (bake,
single graph)"** step's `env:` block, next to the other `VITE_*` lines:

```yaml
VITE_CDN_BASE_URL: ${{ vars.PROD_VITE_CDN_BASE_URL }}
# Google AdSense — OPTIONAL, and deliberately absent from the "Verify required
# deploy variables" step above. Unset means the build produces a site with no
# ads on it at all, which is a valid production state; failing the deploy over
# it would be wrong.
VITE_ADSENSE_CLIENT_ID: ${{ vars.PROD_VITE_ADSENSE_CLIENT_ID }}
VITE_ADSENSE_SLOTS: ${{ vars.PROD_VITE_ADSENSE_SLOTS }}
DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
```

Do **not** add them to that workflow's "Verify required deploy variables"
step. They are optional by design: a production build with ads off is a valid
state, and failing the deploy over a missing ad id would be wrong.

Then set `PROD_VITE_ADSENSE_CLIENT_ID` and `PROD_VITE_ADSENSE_SLOTS` under
Settings → Secrets and variables → Actions → **Variables** (not Secrets — both
values are public, and secrets are unavailable to some build contexts).

### CSP

`deploy/apache/rmhstudios.conf` (the enforced production policy) and
`server/nitro/security-headers.ts` (the report-only mirror) both name Google's
ad hosts in `script-src`, `frame-src`, `connect-src` and `fenced-frame-src`.
Enumerated hosts, not the `https://*.google.com` wildcard Google's own CSP
guidance suggests — a wildcard over `*.google.com` in `script-src` is a lot of
trust for one ad unit.

`fenced-frame-src` matters and is easy to miss: Protected Audience creatives
render in fenced frames, which do **not** inherit `frame-src`, so without it
those units are blocked with no obvious cause.

### /ads.txt

Generated from the publisher id rather than checked in as `public/ads.txt`,
because the record is per-environment — a static file would either ship a
placeholder pub id (an actively false claim about who may sell this domain) or
leak the production one into every dev checkout. With no publisher id it 404s,
which is what a domain that sells no ads should say.

## Debugging a blank unit

A blank slot is the normal outcome of several unrelated things. In order:

1. **Nothing in the DOM at all** — the gate said no. Check, in order: is
   `VITE_ADSENSE_CLIENT_ID` set _in the build_ (not just the running env)? Has
   this browser answered the cookie banner (`localStorage['rmh-cookie-consent']`)?
   Is the session on a paid tier? Is the path excluded? For a signed-in account
   that should be seeing ads, check `localStorage['rmh-auth-user']` actually
   carries a `tier` — a signed-in user whose entitlement can't be read is
   treated as unknown, and unknown shows nothing.
2. **`<ins>` present, no `data-ad-status`** — the tag never loaded. Almost
   always an ad blocker; also check the CSP report for a `script-src` violation.
   `AdSlot` treats this as an ordinary outcome and collapses the frame.
3. **`data-ad-status="unfilled"`** — Google had nothing to serve. Expected on
   low-traffic pages and for a brand-new account; the frame collapses so a
   labelled empty box doesn't hold open 280px of nothing.
4. **`data-ad-status="filled"` but nothing visible** — a CSP `frame-src` or
   `fenced-frame-src` problem. Check the browser console for a blocked frame.
5. **The slot renders but shows the previous page's ad** — an `<ins>` was reused
   across a client navigation. `AdSlot` keys its element by pathname to prevent
   exactly this; if it recurs, something is holding the node across the key change.

## Things that are true and worth not re-litigating

- **The gate is a pure function on purpose.** Every bug in it is invisible in
  review and expensive in production — the failure mode is always "an ad quietly
  appeared somewhere it must not", which nobody notices until a paying member or
  a regulator does. `lib/__tests__/adsense.test.ts` is where each rule is pinned.
- **The unit is labelled.** AdSense requires that units not be presented in a way
  that could be mistaken for site content, and this site's glass cards are
  exactly what a creative would otherwise be mistaken for.
- **Consent is withdrawable.** The banner used to be a one-way door: nothing
  anywhere dispatched the `rmh:cookie-consent-reset` event that three components
  listened for. Settings → Privacy now has the control, above that page's
  sign-in gate — cookie consent belongs to the browser, not the account.
