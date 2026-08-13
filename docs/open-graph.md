# Open Graph cards & link previews

How a link to rmhstudios.com looks when it is pasted somewhere else: what the
image is, where it comes from, and how to add one for a new kind of page.

The short version: **every card is the liquid globe design language, in ink on
white, and every card says something about the specific page it points at.**
Both halves of that were previously untrue.

---

## 1. The design

A card is 1200×630, and it is the same three things the site is
([`design.md`](../design.md) §1, §3):

| Layer      | On the card                                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| The scene  | White canvas, the ring backdrop radiating from a centre off the right edge, two very faint aurora blobs. Nothing above 5% ink — it sits behind text. |
| The glass  | Content on a `.glass-pane`-equivalent: 72% white fill, hairline rim, specular top edge. Genuinely translucent, so the scene shows through it.        |
| The globe  | The navigation globe as the mark, drawn from the same cage `components/radial/LiquidGlobe.tsx` draws — six meridians, seven parallels, same weights. |
| The picture | When the page has one — a post's attachments, a game's key art — it takes the right ~40% of the pane, rounded and hairlined like every other surface. |

The palette is the **default theme's `--site-*` block, restated by hand** in
`lib/og/shared.server.ts`, because satori cannot read CSS custom properties.
That file is the only place in the codebase allowed to restate those tokens;
keep it in sync when the default theme moves.

Geometry goes through `SCALE = 2`. A card is displayed at roughly half its
rendered size in every unfurl that matters (Discord ~500px, Twitter ~600px,
iMessage ~340px), so the site's 22px radius and 1px hairline are drawn at 44px
and 2px in order to *arrive* at 22 and 1.

### What replaced what

The previous cards were a dark `#0b0d12` canvas with an amber `#f5a623` accent
(and, on the stat card, a seven-hue accent palette), plus a default image on a
purple gradient. None of that matched a theme the site has shipped since the
rewrite — the default theme is strict monochrome glass, and "restraint in the
palette is what lets the optics be loud". The per-kind hues are gone with it;
what a card *is* still reads, because the kicker says so in words, which is also
the rule that colour may never be the only carrier of meaning (`design.md` §7).

---

## 2. The modules

| File                             | What it is                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `lib/og/shared.server.ts`        | Fonts (Inter, fetched once with a failure cooldown), the avatar fetcher, `stripEmoji`/`truncate`, the palette and `SCALE`      |
| `lib/og/media.server.ts`         | **Pictures.** Resolves a stored object / `public/` path / remote URL to bytes, then re-encodes to the exact box the card draws  |
| `lib/og/collage.ts`              | The 1–4 photo grid, as geometry. Client-safe, so the "every tile is inside the box" rule is testable                            |
| `lib/og/post-visibility.ts`      | **The one rule** deciding whether a post's card, description and title may show the post. Client-safe                           |
| `lib/og/chrome.server.tsx`       | The design system: `globeMark`, `cardFrame`, `pane`, `inset`, `statChips`, `avatarDisc`, `framedImage`, `mediaTag`, `verifiedBadge`, `kicker`, `fitText`, `frameMetrics` |
| `lib/og/page-card.server.tsx`    | **The generic card.** Kicker + title + subtitle + byline + stats + optional `art`, landscape or story. Most cards are this      |
| `lib/og/post-image.server.tsx`   | The post card — author, text, **the attached pictures**, poll, quote, engagement                                                |
| `lib/og/post-story.server.tsx`   | The 1080×1920 post card for stories                                                                                            |
| `lib/og/profile-image.server.tsx`| The profile card — avatar, name, bio, followers/posts                                                                          |
| `lib/og/stat-card.server.tsx`    | Shared moments; a thin mapping onto the generic card                                                                           |
| `lib/og/static-cards.ts`         | **Data**: which path prefixes get which pre-rendered card. Client-safe                                                          |
| `scripts/gen-og-cards.tsx`       | Renders the static cards into `public/images/og/` (`pnpm og:cards`)                                                             |
| `lib/seo.ts`                     | `buildMeta`, `buildCanonical`, `ogCardPath`, `absoluteUrl`, and the section-card lookup                                        |

### Card routes

Dynamic cards are `GET /api/og/<kind>/<id>`, all `auth: 'none'`, all returning
`image/png` with a long `Cache-Control`:

`post` · `post/$id/story` · `profile` · `replay` · `moment` · `game` · `app` ·
`blog` · `job`

Reference them through **`ogCardPath(kind, id)`** rather than by writing the
path — that keeps the set of pages with a real card greppable, and stops a route
pointing at an endpoint that no longer exists.

---

## 2b. Pictures on a card

A card that says "2 photos" where the photos go is describing the page instead
of showing it, and for a social post — where the picture very often *is* the
post — that is the single most wrong thing an unfurl can do. Cards draw the
real image now. Three things make that safe:

1. **One resolver, three sources.** `readImageSource` takes any reference the
   site produces. A feed image (`/api/feed/image/x.png` **or** its
   `cdn.rmhstudios.com/rmharks/x.png` form) and an uploaded avatar are read out
   of object storage with `getObject` — no HTTP, because the process rendering
   the card is the process that serves those bytes. A `public/`-relative path
   (game and app key art) is read off disk, from `public/` or `.output/public`.
   Anything else is a user-supplied URL and goes through `safeFetch` with a byte
   cap on top of its timeout.
2. **Always re-encoded, never passed through.** Every picture goes through sharp
   and comes back at exactly the pixel box it will be drawn in — cropped with
   the attention strategy, EXIF-rotated, flattened onto card white, JPEG (PNG
   when alpha has to survive, i.e. avatars). Handing satori a 2048px source for
   a 200px tile would base64 the whole thing into the SVG and rasterise it at
   full size before scaling it back down, per image, per render. Cropping first
   also means the layout can trust the size it asked for instead of relying on
   `objectFit`.
3. **The grid is geometry, not a guess.** `collageTiles` in `lib/og/collage.ts`
   returns the boxes: one fills, two split, three is tall-plus-stacked, four is
   2×2. It is client-safe so `lib/__tests__/og-cards.test.ts` can assert the one
   thing satori will not — that every tile is inside the box — and tiles are
   laid out from both edges so integer rounding widens the gutter rather than
   overhanging the pane.

The count is still drawn when the pictures can't be: an attachment that has been
swept from storage re-lays the grid for the survivors, and a post whose images
all fail falls back to the "2 photos" line it used to show unconditionally.

## 3. Two satori rules that will bite you

satori renders a React tree to SVG with a **subset** of CSS. Two of its
behaviours have already cost real bugs here:

1. **Never pass a fragment as `children`.** satori collapses `<>…</>` into one
   anonymous flex box with the default **row** direction, so a column pane lays
   its children out side by side with no warning. Pass a keyed **array**.
2. **There is no emoji font, and nothing clips.** Emoji render as tofu (run user
   text through `stripEmoji`, and label figures with words — "replies", not
   "💬"), and text that overflows its box paints straight over the rows around
   it. Size type with **`fitText`** against **`frameMetrics`**, and cap the input
   length as well: the estimate protects the layout, the cap protects the
   estimate.

---

## 4. How a page gets its card

In order of preference:

1. **A dynamic card**, when the page has content, figures or art worth showing:
   `image: ogCardPath('game', id)`. This is now the answer for anything with a
   picture *of its own* too — pass the picture to the card as `art` (or, for a
   post, as its attachments) rather than pointing `og:image` at it. A rendered
   card declares its dimensions, says which site it came from, and exists even
   for the entries that have no art; a raw asset does none of those. The apps
   were the last catalog entries pointing `og:image` straight at a screenshot,
   and the several with no `imagePath` unfurled indistinguishably from each
   other as a result.
2. **A raw picture**, when there is genuinely nothing to frame it with — a
   devlog hero image, an album cover. Pass it as `image` and `imageSize: null`,
   since it is not 1200×630.
3. **A section card**, automatically. `buildMeta` resolves the route's `path`
   against `lib/og/static-cards.ts` by longest matching prefix, so everything
   under `/library/…` shares the library card without any route knowing.
4. **The site default**, `/images/og/default.png`.

`buildMeta` also guarantees three things no route has to remember:

- `og:image` is **absolute** (a relative one is ignored by crawlers — several
  routes were emitting them, so those links unfurled with no image at all);
- `og:image:width`/`height` are declared, so consumers pick the large-image
  layout immediately instead of reflowing when the fetch lands;
- `twitter:card` follows the **image size**, not the route — a
  `summary_large_image` pointing at a 400px avatar renders as a blurry crop.

### Adding a section card

Add an entry to `STATIC_CARDS`, run `pnpm og:cards`, commit the PNG. No route
changes. `lib/__tests__/og-cards.test.ts` fails if a declared card has no file
on disk — which is the exact bug (`default.png` referenced for months while
`public/images/og/` did not exist) that made every uncustomised share broken.

### Adding a dynamic card

1. Add a route under `app/routes/api/og/<kind>/`, using `defineHandler({ auth: 'none' })`.
2. Build a `PageCardData` and call `renderPageCard` — reach for a bespoke
   renderer only when the layout genuinely isn't kicker/title/subtitle/stats.
3. Add the kind to `ogCardPath`'s union in `lib/seo.ts`.
4. Point the page's `head()` at it via `ogCardPath`.

**Cache keys must contain everything drawn.** Most callers use an id plus an
`updatedAt`; the post and profile cards bucket their engagement counts so
ordinary churn doesn't re-render a card whose visible figure hasn't changed.

---

## 5. Privacy

Card routes are public and uncredentialed, so they apply the page's own
visibility rules and then some:

- **Posts**: the text, the poll and **the attached pictures** are rendered only
  for posts that are public, free, not deleted **and not marked sensitive** — an
  unfurl is exactly the surface a content warning exists to gate. Everything else
  gets the card with the author and the counts but no content. That is one
  function, `postCardShowsContent`, and not a condition re-typed per caller:
  the landscape card, the story card and the post page's own `head()` all ask
  it, which is what makes "the images are hidden under the same rule as the
  text" true rather than aspirational. (The page `head()` was the one that had
  drifted — it hid a *paid* post's body from `og:description` but quoted a
  *sensitive* one verbatim, two tags below the card image that was hiding it.)
  A quoted post is a different post with a different audience, so it is asked
  separately: quoting something does not republish it.
- **Replays**: non-public replays 404 rather than rendering.
- **Moments**: deleting the moment 404s its card.
- **Jobs**: the route goes through `getJobDetail`, so an expired, unverified or
  non-early-career posting 404s here exactly as it does on the page.

---

## 6. oEmbed

`/api/embed/oembed` is the oEmbed *provider* for posts. Its payload carries
`thumbnail_url` pointing at the post's own card, so a consumer that will not run
our iframe still gets a picture.

`/api/oembed` and `/api/rmhtube/oembed` are the opposite direction — they scrape
*other* sites' OG tags for link previews inside posts, and have nothing to do
with this system.
