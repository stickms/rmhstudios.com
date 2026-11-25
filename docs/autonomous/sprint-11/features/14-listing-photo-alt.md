# 14 — Describe the photos on a home listing

Surface: RMHHomes: the listing form's photo manager (`/homes/submit`, `/homes/manage`), the listing detail gallery,
listing cards. Wave 5. Namespace `listing-photo-alt`. Site tier (Steel).

## User story

As someone who uses a screen reader, I want each photo on a home listing to say what it shows, and as a lister I want a
place to write that, so that I can judge a flat from its photos the way a sighted renter does.

## Requirements elicitation

- **What exists (verified):**
  - `HomeListing.images` is a `String[]` of photo URLs, the first the cover; `aiImages` marks the generated ones
    (`prisma/schema/hearth.prisma`). No description is stored anywhere.
  - The photos render with empty or generic text: `components/homes/ImageUploader.tsx` (`alt=""` on each tile),
    `ListingCard.tsx` (`alt=""` on the cover), `ListingDetailView.tsx` (the main photo `alt={listing.title}`, the
    thumbnails `alt=""`).
  - Image descriptions are a site-wide habit elsewhere: posts and messages (sprints 03 19 and 05 16; the member's
    `User.requireAltText` switch, read by `getRequireAltText` in `lib/feed/alt-text.server.ts` and served at
    `/api/settings/alt-text`, asks for descriptions before posting), card pictures (sprint 08 15,
    `CARD_IMAGE_ALT_MAX = 1000`), build screenshots (sprint 07 17).
- **Decisions:**
  - **`imageAlts`**, a `String[]` beside `images`, same order, `''` meaning "not described", each at most 1,000
    characters (the card pictures' limit), trimmed, control characters removed. The server pads or truncates it to the
    length of `images` on every write, so the two arrays can never drift.
  - **The form:** each photo tile gets a "Describe this photo" field (a labelled textarea, `dir="auto"`); reordering and
    removing photos move their descriptions with them (one pure helper owns both arrays). A line under the photos says
    how many have no description. An AI-generated photo keeps its disclaimer; its description is the lister's.
  - **The reminder:** when the member has `requireAltText` on (the existing Settings > Content switch, read through its
    existing contract), saving with undescribed photos asks once through `useConfirm` ("2 photos have no description.
    Save anyway?"). Nothing is required.
  - **Rendering:** every listing photo has a text alternative: the description, else "Photo 3 of 8: <listing title>"
    (translated, the title isolated). The cover on a card uses the first description, else the title. Purely decorative
    images stay `alt=""`; listing photos are content.
  - **External listings** (scraped) have no descriptions (third-party photos); they get the fallback.
  - **Erasure and export:** the descriptions are columns of the listing, erased and exported with it (sprint 10 19
    erases a member's listings); no registry change.

## Functional requirements

1. FR-1 Column `HomeListing.imageAlts String[] @default([])`.
2. FR-2 `lib/homes/photos.ts` (pure): `normalizeAlts(images, alts)`, `movePhoto`, `removePhoto`, `photoAlt(listing, i)`
   (the description or the fallback's parts).
3. FR-3 The listing create and update schemas (`app/routes/api/homes/listings.ts` and
   `lib/homes/api/homes.listings.$id.server.ts`) take `imageAlts`; `toCreateData` in `listings.server.ts` normalises it;
   the DTO (`lib/homes/types.ts`) carries it.
4. FR-4 UI: `ImageUploader.tsx` (the field per tile, the count line), `ListingForm.tsx` (state and the reminder),
   `ListingDetailView.tsx` and `ListingCard.tsx` (alternatives).

## Non-functional requirements

- **Accessibility:** WCAG 1.1.1 for every listing photo; the field has a visible label; the count line is text.
- **Compatibility:** existing listings (empty `imageAlts`) render with the fallback; no backfill.
- **Design:** Steel; pictures with a 1px border and the 8px radius (section 5).

## Data model and API

- `HomeListing.imageAlts String[] @default([])` in `prisma/schema/hearth.prisma`. Migration
  `20261201050300_s11_listing_photo_alt`.

## Testing requirements

- Product suite `lib/homes/__tests__/photos.product.test.ts`: normalisation pads and truncates, trims and strips control
  characters; move and remove keep pairs together; the fallback's parts.
- Main suite `lib/homes/__tests__/listing-alts.test.ts`: a write with mismatched lengths stores matching arrays; an
  over-long description is refused with a code.
- Component (`renderToStaticMarkup`) `components/homes/__tests__/listing-photos.test.tsx`: every photo in the detail
  view and the card has a non-empty `alt`; the field has a label.
- User-text direction (the field and the rendered description), design consistency.

## Acceptance criteria

- [ ] A lister describes three of four photos; the form says one has no description.
- [ ] A screen reader reads "Kitchen with a gas hob and a window over the sink" for the described photo and "Photo 4 of
      4: Sunny two-bed near the park" for the other.
- [ ] Reordering the photos keeps each description with its photo.

## Out of scope

Generated descriptions, descriptions for external listings, required descriptions.
