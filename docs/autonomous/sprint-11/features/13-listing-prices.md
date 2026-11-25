# 13 — Price changes on home listings

Surface: RMHHomes (`/homes`): a listing's detail view (price history), listing cards ("Reduced"), the browse filter
"Reduced in the last 30 days", the favourite button's alert switch, the inbox (a saved listing's price dropped). Wave 1.
Namespace `listing-prices`. Site tier (Steel).

## User story

As someone looking for a place to rent, I want to see when a listing's price has changed and be told when a listing I
saved gets cheaper, so that I can act on a reduction instead of checking every saved listing every day.

## Requirements elicitation

- **What exists (verified):**
  - `HomeListing` (`prisma/schema/hearth.prisma`) has one `priceCents` and nothing about its past. Community listings
    change price when their author edits them (`updateListing`, `lib/homes/listings.server.ts`, an `updateMany` of the
    whole form); external listings are re-read by the scraper on every run (`processSource`,
    `lib/homes/scrape/process-source.ts`, an `upsert` keyed by `(sourceRefId, externalId)` that overwrites the price).
  - Favourites (`HomeFavorite`, unique `(userId, listingId)`) and watches (`HomeWatch`, an alert for new matching
    listings, `lib/homes/watches.server.ts`, `notice('home-watch-rental' | 'home-watch-sale', …)`) exist. Nothing tells
    a member about a change to a listing they saved.
- **Decisions:**
  - **Every price change is recorded** in `HomeListingPriceChange` (old, new, when, `author` or `feed`) by both writers:
    `updateListing` compares inside a transaction (read the old price, update, insert the change only when it differs);
    the scraper reads the stored price for the listings in its batch before the upserts (one `findMany` by
    `(sourceRefId, externalId)`) and records the changes after.
  - **A drop** (new below old by at least 1%) also sets `HomeListing.priceDroppedAt`.
  - **Detail view:** "Price history" rows (date, old → new, the change in percent), newest first, up to 20; none shown
    when there has been no change.
  - **Cards:** "Reduced $X" (in the reader's currency format, the listing's USD) when the last change in 30 days was a
    drop.
  - **Browse filter:** "Reduced in the last 30 days" (`reduced=1` in the URL, validated with the other filters),
    `priceDroppedAt` within 30 days.
  - **Alerts:** favouriting a listing turns on "Tell me if the price drops" (a switch in the favourite menu, stored on
    `HomeFavorite.priceAlerts`, default on). A drop sends `notice('home-price-drop', …)` to each favouriter with the
    switch on, at most one per listing per member per 7 days (the last notice time on the favourite row), skipping the
    author, members blocked by or blocking the author, and banned accounts. Fan-out through `lib/async-pool.ts`, at most
    1,000 favouriters per drop, after the write commits.
  - **No erasure entry for the change rows:** `HomeListingPriceChange` has no member relation and goes with its listing
    (cascade); the two new `HomeFavorite` columns go with the favourite rows (already erased, sprint 10 19).

## Functional requirements

1. FR-1 Model `HomeListingPriceChange`; columns `HomeListing.priceDroppedAt`, `HomeFavorite.priceAlerts`,
   `HomeFavorite.priceNoticeAt`.
2. FR-2 `lib/homes/prices.ts` (pure): the drop rule, the percent, the 30-day window, the 7-day notice rule.
3. FR-3 `lib/homes/prices.server.ts`: record a change (both writers), the history read, the drop fan-out.
4. FR-4 `updateListing` and `processSource` record changes; `browseListings` takes `reduced`; the listing DTO carries
   `reducedByCents` when it applies.
5. FR-5 Endpoints: the history (`GET /api/homes/listings/$id/prices`, public for an active listing) and the switch
   (`PUT /api/homes/listings/$id/favorite/alerts`, `auth: 'required'`, `rateLimit: 'write'`, it updates only the
   caller's own `HomeFavorite` row and answers 404 when there is none), contracts in `lib/homes/prices.contract.ts`. The
   history answers 404 for a listing the public listing read would not show (inactive, removed, hidden).
6. FR-6 UI: `components/homes/PriceHistory.tsx`, the badge in `ListingCard.tsx`, the filter in `FiltersBar.tsx`, the
   switch in `FavoriteButton.tsx`.
7. FR-7 Notice key, label and preview under the anchors.

## Non-functional requirements

- **Performance:** the scraper adds one read per batch, not per listing; the history is one indexed query.
- **Accessibility:** the history is a list with dates in the reader's locale; the badge is text.
- **Design:** rows on rules (R3), no tinted badge box.

## Data model and API

- `HomeListingPriceChange` (`@@map("home_listing_price_change")`: `id`, `listingId` → `HomeListing` (cascade),
  `oldCents Int`, `newCents Int`, `source` `@db.VarChar(8)`, `changedAt DateTime @default(now())`,
  `@@index([listingId, changedAt])`) in `prisma/schema/hearth.prisma`. New nullable or defaulted columns:
  `HomeListing.priceDroppedAt DateTime?`, `HomeFavorite.priceAlerts Boolean @default(true)`,
  `HomeFavorite.priceNoticeAt DateTime?`. Migration `20261201010200_s11_listing_prices`. No index on an existing table.

## Testing requirements

- Product suite `lib/homes/__tests__/prices.product.test.ts`: the 1% rule, percent rounding, the windows.
- Main suite `lib/homes/__tests__/prices.test.ts`: an edit that changes the price records one change and an unchanged
  one none; the scraper records changes for its batch with one read; a drop notifies favouriters with the switch on,
  once per 7 days, skipping blocks and bans; the author is never notified.
- `lib/homes/scrape/process-source.test.ts` (extended) stays green with the change recording.
- Notice-key catalogue and preview ratchet, labels, route table.

## Acceptance criteria

- [ ] An author lowers their rent from $1,500 to $1,400; the detail view shows the change and the card says "Reduced
      $100".
- [ ] A member who saved the listing gets one notice; a second drop two days later sends none.
- [ ] "Reduced in the last 30 days" lists the listing.

## Out of scope

Price-rise alerts, price predictions, history for listings created before this feature (it starts empty).
