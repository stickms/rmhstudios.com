# 18 — Listing photos from the site only, their erasure, and a gate for picture columns

Surface: the home listing write paths, the listing form, account erasure's listing photos, a new schema gate for the
media sweep. Wave 7. No namespace (no interface strings; one refusal uses a new `ERROR_CODES` entry). Hardening.

## User story

As the site's owner, before I turn the media sweep on, I want community listings to show only photos their author
uploaded to the site, an erased member's listing photos to leave storage with them, and every column that names an
uploaded picture to be known to the sweep, so that a listing can never load an image from a stranger's server, an
erasure leaves no photos behind, and a new picture column cannot be swept by accident.

## Requirements elicitation

- **What exists (verified against the sprint 10 tip, after its integration):**
  - **The sweep already keeps listing and e-mail pictures.** Sprint 10 integration (`a0a545c0a`, "Keep listing, email
    and museum pictures out of the media sweep") added `homeListing.images`, `emailCampaign.imageUrls` and
    `siteEra.imageUrl` to `referencedUrls` and `SweepDeps` (`lib/media/sweep.server.ts`), to `mediaSweepDeps()` in
    `lib/media/sweep-jobs.server.ts`, and to the `post` surface's reason in `lib/media/sweep-surfaces.ts`, with tests in
    `lib/__tests__/media-sweep.test.ts` and `lib/media/__tests__/sweep-surfaces.test.ts`. This feature does not redo it
    (the design pass's FR-1 is dropped).
  - **Listing photos are not `Media` rows.** The homes uploader (`components/homes/ImageUploader.tsx`) posts to
    `/api/rmharks/image` (`lib/media/api/rmharks.image.server.ts`), which calls `ingest(file, 'post', { userId })`
    without `record`, and `IngestCtx.record` is off by default ("load-bearing", `lib/media/ingest.server.ts`), so no
    `Media` row is written. The generated listing photo (`lib/homes/ai-image.server.ts`) is a bare `putObject` with no
    row either. Both are named `<userId>-…` in the feed space (`feedImageKey`, `feedImageUrl` in `lib/storage/keys.ts`),
    which `ownsFeedImageUrl(url, userId)` there already checks. Sprint 10 19's code comments (and its review) say the
    photos are `Media` rows owned by the member; the code says they are not, and the code is the authority.
  - **So the erasure deletes no listing photo.** `deleteMemberListingImageObjects`
    (`lib/account/erasure-follows.server.ts`, called after the transaction from `lib/account/deletion.server.ts`) finds
    objects through
    `prisma.media.findMany({ where: { userId, url: { in: urls }, key: { startsWith: FEED_IMAGE_PREFIX } } })`, which
    matches nothing for these uploads: every erased member's listing photos stay in storage, and the comments on the
    file header and `readListingImageUrls` state the wrong mechanism.
  - **Listing photos accept any address:** both schemas take `images: z.array(z.string().max(1000)).max(12)` and
    `aiImages` alike (`lib/homes/api/homes.listings.$id.server.ts`, `app/routes/api/homes/listings.ts`), so a community
    listing can name a photo on any host (every viewer's browser then fetches it, telling that host who looked) or
    another member's upload. External listings get their photos from the scraper, a different writer.
  - Nothing checks that a new column holding upload URLs is known to the sweep; `sweep-surfaces.test.ts` checks the
    listed delegates by a substring of the source.
- **Decisions:**
  - **Community listings name their author's own site photos only:** on create and update, every `images` entry must
    satisfy `ownsFeedImageUrl(url, authorId)` (a feed-space URL in either form `feedImageFilename` accepts, whose
    filename starts with the author's id: an upload or a generated photo). Otherwise the write is refused with a new
    taxonomy code `LISTING_PHOTO_NOT_SITE` (`http: 400`, `errors:listingPhotoNotSite`, "Use photos uploaded to this
    listing"), sent with `refusalBody('LISTING_PHOTO_NOT_SITE', { count })` where `count` is how many photos fail (a
    `PARAM_NAMES` param; the English carries no placeholder). `aiImages` must stay a subset of `images`, as today. The
    update path checks against the listing's `authorId`, never the caller's. Existing rows are not rewritten; a listing
    with an outside photo keeps it until it is next saved, when the form marks each failing photo (the same pure check
    in the browser) and says to replace it.
  - **The erasure deletes the member's own listing photos by URL:** `deleteMemberListingImageObjects(userId, urls)`
    keeps its signature and call site. For each URL with `ownsFeedImageUrl(url, userId)` (never another member's object,
    never a third-party URL) it derives the key (`feedImageKey(feedImageFilename(url))`) and its variants
    (`variantKeysFor`); it skips every URL that `referencedUrls(mediaSweepDeps(), urls)` still finds (the member's
    listings are gone by then, so a hit is a post, message, card or campaign that re-used the picture: when in doubt,
    keep); it deletes the objects, purges the CDN, and drops any `Media` row with those keys. `referencedUrls` is
    exported for this (one definition of "still in use"). The wrong comments are corrected.
  - **A schema gate:** `lib/media/__tests__/sweep-reference-columns.test.ts` reads every `prisma/schema/*.prisma` file
    (comments stripped) and finds each `String`, `String?` or `String[]` column whose name matches
    `/(image|images|imageUrls?|thumbnailUrl|coverUrl|bannerUrl|mediaUrls?|soundUrl|avatarUrl)$/i`. Each must be named as
    a field in a Prisma `where` inside `referencedUrls` (found by parsing `sweep.server.ts` with the TypeScript compiler
    API, never by a substring or a comment) or listed in `SWEEP_REFERENCE_EXEMPT` (`lib/media/sweep-surfaces.ts`, keyed
    `Model.field`) with a reason a reviewer can check (a third-party URL, its own key space the sweep never deletes
    from, a data URL, a key not a URL). An exempt entry whose column no longer exists, or that `referencedUrls` also
    names, fails. Every column found at wave start gets a real classification; none is "todo".

## Functional requirements

1. FR-1 `lib/homes/photo-origin.ts` (pure, client-safe): `foreignListingPhotos(images, authorId)` returns the entries
   that fail `ownsFeedImageUrl`; both listing write paths call it for community listings and refuse as above.
2. FR-2 `LISTING_PHOTO_NOT_SITE` in `lib/errors/codes.ts` and `locales/en/errors.json`, its literal case in
   `components/errors/useRefusalText.ts`, both under the Wave 0 anchors; `ListingForm.tsx` renders the refusal with
   `useRefusalText()` and marks each failing tile from `foreignListingPhotos`.
3. FR-3 `deleteMemberListingImageObjects` deletes by URL as above; `referencedUrls` exported from `sweep.server.ts` with
   no behaviour change.
4. FR-4 The schema gate and `SWEEP_REFERENCE_EXEMPT`.

## Non-functional requirements

- **Safety:** when in doubt, keep. The erasure deletes only objects whose filename carries the erased member's id and
  that nothing else names; a failed delete is swallowed and leaves the object, as today.
- **Performance:** the erasure adds one chunked `referencedUrls` call for at most 12 photos per listing; the write paths
  add a pure check; no index.

## Data model and API

- No schema change, no new endpoint.
- Edits `lib/homes/api/homes.listings.$id.server.ts`, `app/routes/api/homes/listings.ts`, `lib/errors/codes.ts` and
  `components/errors/useRefusalText.ts` (anchors), `locales/en/errors.json`, `components/homes/ListingForm.tsx`,
  `lib/account/erasure-follows.server.ts`, `lib/media/sweep.server.ts` (one `export`), `lib/media/sweep-surfaces.ts`.
  New `lib/homes/photo-origin.ts` and the gate.

## Testing requirements

- Main suite `lib/homes/__tests__/listing-photo-origin.test.ts`: a third-party URL and another member's feed URL refused
  on create and update with the code and `count`; the author's upload and generated photo accepted; an update checked
  against the listing's author; a scraped listing untouched.
- Main suite `lib/account/__tests__/follows-erasure.test.ts` (extended): an owned feed URL's object and variants are
  deleted with no `Media` row present; another member's URL and a third-party URL are never deleted; a URL a post still
  names is kept; a failed delete is swallowed.
- Main suite `lib/media/__tests__/sweep-reference-columns.test.ts`: the gate, plus fixtures proving a new unlisted
  column fails, a comment naming it does not satisfy it, and a stale exempt entry fails.
- The error-code catalogue test and the `serverError` ratchet (no new call site).

## Acceptance criteria

- [ ] Saving a community listing with a photo address on another host, or another member's upload, is refused and says
      why; the form marks the photo.
- [ ] Erasing a member who listed two uploaded photos deletes both objects and their variants (a recorded
      `deleteObject`).
- [ ] Adding a `heroImageUrl String?` column to any model without listing it fails the gate.

## Out of scope

Recording `Media` rows for `/api/rmharks/image` (it changes every composer's upload), GIN indexes on image arrays,
rewriting existing listings, the sweep's own rules (unchanged).
