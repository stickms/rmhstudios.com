# 10 — Notes on saved homes, and comparing them side by side

Surface: `/homes/manage` "Saved" tab (a private note on each saved listing, "Compare" on up to four), `/homes/compare`
(new), the listing page (your note). Wave 1. Namespace `homes-compare`. Site tier (Steel).

## User story

As a member hunting for a place to live, I want to write a private note on each listing I saved ("landlord replied,
viewing Thursday", "no dishwasher") and put up to four saved listings side by side — price, price per square foot,
bedrooms, distance to where I need to be, pets, availability, what I can afford — so that I can decide without
switching between tabs.

## Requirements elicitation

- **What exists (verified):**
  - `HomeFavorite` (`prisma/schema/hearth.prisma`: `userId`, `listingId`, `createdAt`, `priceAlerts`,
    `priceNoticeAt` from sprint 11 13; `@@unique([userId, listingId])`). Saved listings are listed by `listFavorites`
    (`lib/homes/listings.server.ts`, newest 500) through `GET /api/homes/listings?scope=favorites`
    (`listMyHomeListingsApi` in `lib/homes/homes.contract.ts`, `app/routes/api/homes/listings.ts`) and shown by the
    "Saved" tab of `app/routes/_site/homes/manage.tsx`. Saving is `POST`/`DELETE /api/homes/listings/$id/favorite`
    (`lib/homes/api/homes.listings.$id.favorite.server.ts`).
  - Per-listing helpers that a comparison needs already exist: affordability (`lib/homes/affordability.ts`:
    `assessListing`, `maxAffordableRent`, the income profile stored on the device under `INCOME_STORAGE_KEY`), distance
    (`lib/homes/distance.ts`: `straightLineKm`, `formatDistance`, `DistanceUnit`), price history (sprint 11 13:
    `HomeListingPriceChange`, `components/homes/PriceHistory.tsx`), rent split (`lib/homes/rent-split.ts`).
  - Sprint 11's design pass named "saved notes and side-by-side comparison of favourite listings" a candidate for the
    next sprint (sprint 11 README, "Rejected ideas").
  - `HomeFavorite` is erased with the account (`lib/account/erasure-private.server.ts`); the data export does not list
    saved listings.
- **Decisions:**
  - **Notes:** a nullable `note String? @db.VarChar(1000)` on `HomeFavorite`, private to the member, plain text
    (`dir="auto"`, never rendered as HTML), edited inline on the saved row and on the listing page while saved;
    unsaving deletes the note with the row (the confirmation says so when a note exists).
  - **Compare:** up to four saved listings (checkboxes on the Saved tab; the choice kept in the URL,
    `/homes/compare?ids=a,b,c`, one comma-separated parameter, validated with zod). Rows: price (and per square foot
    when `sqft` is known), the last price change, beds, baths, square feet, property type, pets, available from,
    amenities (each amenity a row with a tick per listing), distance to a place the member enters (straight-line, in
    the member's unit), affordability against the device's income profile (shown only if the member has set one), and
    the member's note. A listing no longer active stays in its column marked "No longer listed". Columns are divided by
    a 1px vertical rule (Steel section 5); on a phone the table scrolls inside itself with the row names fixed.
  - **Whose:** only the member's own saved listings; an id that is not saved by the member is dropped from the view
    with one line ("1 listing is not in your saved homes").
  - **Export:** the member's saved listings with their notes and alert setting, under the sprint 12 export anchor (the
    export never listed favourites).

## Functional requirements

1. FR-1 Migration `20261202010200_s12_homes_compare`: `ALTER TABLE "home_favorite" ADD COLUMN "note" VARCHAR(1000)`.
2. FR-2 `lib/homes/compare.ts` (pure: the comparison rows from listing DTOs, the ids parser, the amenity union);
   `compare-schema.ts`; `compare.contract.ts`.
3. FR-3 `lib/homes/listings.server.ts`: `listFavorites` returns the note; `setFavoriteNote`; `compareFavorites(userId,
   ids)` (saved-by-member filter in the query, at most four).
4. FR-4 Endpoints: `PUT /api/homes/listings/$id/favorite/note` (registered module, `rateLimit: 'write'`, 404 when not
   saved) and `GET /api/homes/compare?ids=` (`rateLimit: 'read'`).
5. FR-5 UI: `components/homes/FavoriteNote.tsx` (inline edit, save on blur or Enter, the length counter),
   `components/homes/CompareTable.tsx`, `app/routes/_site/homes/compare.tsx` (`EXCLUDED_ROUTES` personal under the Wave
   0 sitemap anchor), the Compare selection on the Saved tab, the note on `ListingDetailView.tsx`.
6. FR-6 The distance place is entered with the existing `LocationSearch.tsx` and kept on the device (a new key, listed
   in `lib/device-data/registry.ts` under the Wave 0 anchor, through `lib/core/persist`).
7. FR-7 Refusal: `HOME_COMPARE_TOO_MANY` ("Compare at most {{max}} homes at a time").

## Non-functional requirements

- **Privacy:** a note is never in another member's response, a listing's public read, the developer API or an author's
  view; a test covers the listing read for another member.
- **Accessibility:** the comparison is a real `<table>` with row and column headers; ticks have text.
- **Design:** no boxes or cards; one ink primary (none needed on the compare page); no new CSS beyond existing utilities
  (B5).

## Data model and API

`HomeFavorite.note String? @db.VarChar(1000)`. `GET /api/homes/compare?ids=a,b` →
`{ listings: Listing[], notes: Record<id, string | null>, missing: number }`.

## Testing requirements

- Main suite `lib/homes/__tests__/favorite-notes.test.ts`: a note on a listing not saved is 404; another member's read
  of the listing carries no note; unsave removes it; the length rule.
- Product suite `lib/homes/__tests__/compare.product.test.ts`: rows, per-square-foot, amenity union, the ids parser
  (duplicates, more than four, bad ids).
- `components/homes/__tests__/compare-table.test.tsx` (`renderToStaticMarkup`): table headers, "No longer listed", notes
  `dir="auto"`.
- Export test (`lib/account/__tests__/export-sprint-12.test.ts` key `savedHomes`), device registry, sitemap coverage,
  user-text direction, design consistency, Steel flat.

## Acceptance criteria

- [ ] A member notes "viewing Thursday" on a saved listing and sees it on the Saved tab and the listing page.
- [ ] Three saved listings compare side by side with prices, distances to the member's place and their notes.
- [ ] A fifth checkbox cannot be ticked; a crafted URL with five ids is refused with the code.
- [ ] Another member opening the listing sees no note.

## Out of scope

Sharing a comparison, notes on listings not saved, travel time by mode (the straight-line provider only).
