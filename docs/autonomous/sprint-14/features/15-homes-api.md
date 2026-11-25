# 15 — Saved homes and saved searches in the developer API

Surface: `/api/v1/me/homes/*` (four endpoints), two explicit scopes (`read:homes`, `write:homes`), the API reference,
the explorer and the generated SDK, the changelog. Wave 3. No UI namespace (the developer API's English JSON and
docs).

## User story

As a member hunting for a place to live who keeps a spreadsheet, I want my saved homes — price, beds, my note and how
the price moved — and my saved searches available to my own script through an API key, so that I can compare them my
way and save a home from my own tools.

## Requirements elicitation

- **What exists (verified):**
  - Saved homes: `HomeFavorite` (`prisma/schema/hearth.prisma`: `userId`, `listingId`, `createdAt`, `priceAlerts`,
    `priceNoticeAt`, `note` (sprint 12 10), unique `[userId, listingId]`), read for the site by `listFavorites`
    (`lib/homes/listings.server.ts`) and exported by `exportSavedHomes` (`lib/homes/saved-export.server.ts`); price
    history in `HomeListingPriceChange` (`lib/homes/prices.server.ts`); saved searches in `HomeWatch`
    (`lib/homes/watches.server.ts`: `listWatches`, `createWatch`, `setWatchActive`, `deleteWatch`).
  - The developer API (`app/routes/api/v1/**` with `withDeveloperApi`; shapes and schemas in `lib/api/v1/*`; the
    endpoint catalogue `ENDPOINTS` in `lib/api/registry.ts`; scopes in `lib/api/scopes.ts`; `scripts/generate-sdk.ts`
    with `NULLABLE`; the explorer's `DOCUMENTED_GROUPS` in `lib/developer/explorer.ts`; the changelog
    `docs/developer-api/changelog.md`). Sprint 13 10 added the first private reads as **explicit** scopes
    (`read:ladder`, `write:ladder`), kept out of `*`, `read:*` and a new key's default grant (`READ_SCOPES` filters
    `explicit`), with `app/routes/api/v1/me/ladder/*` as the model.
  - No developer API scope reaches RMH Homes.
- **Decisions:**
  - **Scopes:** `read:homes` (saved homes with notes and price history, saved searches) and `write:homes` (save,
    update the note and price alerts, unsave), both `explicit: true`, group "RMH Homes".
  - **Endpoints:**
    - `GET /api/v1/me/homes/saved?cursor=&limit=` (`read:homes`): newest saved first, keyset on (`createdAt`, `id`),
      up to 50; each item `{ listingId, savedAt, note, priceAlerts, listing: { title, listingType, propertyType,
      priceCents, beds, baths, sqft, city, state, status, url, available }, priceChanges: { oldCents, newCents,
      changedAt }[] }` (the newest 10 changes). A listing removed by a moderator, deleted, or by an author blocked
      either way reads `available: false` with `title` and figures `null`, the saved row and the note kept.
    - `PUT /api/v1/me/homes/saved/{listingId}` (`write:homes`): save (idempotent) and set `note` (1,000 characters) and
      `priceAlerts`; refuses an unavailable listing (`404`, the developer API's envelope); it calls the site's own
      `favorite` and `setFavoriteNote` (`lib/homes/listings.server.ts`) and the price-alert write in `lib/homes/prices.server.ts`, so the site's checks
      apply.
    - `DELETE /api/v1/me/homes/saved/{listingId}` (`write:homes`): unsave through `unfavorite`, idempotent.
    - `GET /api/v1/me/homes/searches` (`read:homes`): `{ id, label, listingType, propertyTypes, locationLabel,
      radiusKm, minPriceCents, maxPriceCents, minBeds, minBaths, petsRequired, active, createdAt }[]`. **No
      coordinates** (`lat`, `lng` are left out: a search's centre is often the member's own street; the label
      names it well enough for a script).
  - **Never in a response:** `priceNoticeAt` (an internal throttle), another member's id, the listing's address or
    coordinates (the site shows them on the listing page; the API gives the `url`).
  - **Additive only:** no existing field or scope changes; the default grant is pinned by sprint 13's test and must not
    gain either scope. Both scopes are reachable only by naming them on a key (the key manager shows them with its
    existing "explicit" note, `keys-scope-explicit`).
  - **Writes:** `PUT` and `DELETE` are idempotent and bounded by the developer API's write limit; `PUT` validates its
    body with zod (`note` at most 1,000 characters, trimmed, empty → `null`; `priceAlerts` boolean). `favorite` (`lib/homes/listings.server.ts`) checks only that the listing exists and is not moderated
    (there is no saved-homes cap on the site, and none is added); the v1 module adds the block check (an author
    blocked either way answers `404` like a missing listing) before calling it.

## Functional requirements

1. FR-1 `lib/api/v1/homes-schema.ts` and `lib/api/v1/homes.server.ts` (new): the shapes, the cursor, the reads and the
   writes through `lib/homes/*` functions (save, note, alerts, unsave).
2. FR-2 Route files `app/routes/api/v1/me/homes/saved.ts`, `app/routes/api/v1/me/homes/saved/$listingId.ts`,
   `app/routes/api/v1/me/homes/searches.ts` (new) with `withDeveloperApi` and the scopes.
3. FR-3 Under the Wave 0 anchors: the two scopes in `lib/api/scopes.ts`; the four endpoints in `ENDPOINTS`
   (`lib/api/registry.ts`); `NULLABLE` entries for the nullable fields in `scripts/generate-sdk.ts` (checking each name
   is not already used elsewhere in the SDK); the changelog entry; `RMH Homes` in `DOCUMENTED_GROUPS`.
4. FR-4 `pnpm sdk:generate` and `pnpm docs:api` output committed.

## Non-functional requirements

- **Privacy:** explicit scopes only; no coordinates; blocked authors' listings read as unavailable.
- **Rate limits and errors:** the developer API's standard limits and error envelope; no new error vocabulary.
- **Query shapes (verify against the schema):** `HomeFavorite.note` and `HomeListing.sqft`, `availableFrom`,
  `moderatedAt` are optional; `HomeListing.authorId` is optional (scraped listings have none), so the block filter is
  `authorId: { notIn: blocked }` only when `authorId` is not null — write it as an `OR` with `authorId: null`; price
  changes by `listingId` ordered by `changedAt desc` (indexed `[listingId, changedAt]`).

## Data model and API

No schema change. Four endpoints, two scopes (above).

## Testing requirements

- Main suite `lib/api/v1/__tests__/homes.test.ts`: scopes enforced per endpoint; own rows only; unavailable listings;
  no coordinates, address or `priceNoticeAt` in any response; cursor paging; idempotent PUT and DELETE.
- Main suite `lib/api/__tests__/scopes-explicit.test.ts` (sprint 13's pin of `READ_SCOPES`, extended): neither
  scope in `*`, `read:*`, `write:*`, `WILDCARD_SCOPES` (the key manager's "Select all",
  `components/developer/KeysManager.tsx`), `READ_SCOPES` or `DEFAULT_SCOPES` (a new key's grant when no scopes are
  sent, `lib/developer/api/developer.keys.server.ts`); a key created with `["*"]` is refused on all four endpoints.
- `lib/developer/__tests__/explorer.product.test.ts`, the registry and OpenAPI tests in `lib/api/__tests__/`,
  `pnpm sdk:check` (or the SDK freshness test).

## Acceptance criteria

- [ ] A key with `read:homes` lists the member's saved homes with notes and the last price changes.
- [ ] A key with `write:homes` saves a home with a note, and the site shows the note.
- [ ] A key without the scope is refused; `read:*` does not include it.
- [ ] Saved searches come back without coordinates.

## Out of scope

Listing search through the API, posting listings, roommate profiles, webhooks for price drops.
