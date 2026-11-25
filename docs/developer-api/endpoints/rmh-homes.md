<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# RMH Homes

4 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/me/homes/saved` | `read:homes` | List your saved homes |
| `PUT /api/v1/me/homes/saved/{listingId}` | `write:homes` | Save a home |
| `DELETE /api/v1/me/homes/saved/{listingId}` | `write:homes` | Unsave a home |
| `GET /api/v1/me/homes/searches` | `read:homes` | List your saved searches |

## Reference

### `GET /api/v1/me/homes/saved`

Your saved homes, newest saved first. Each carries your private note, whether the price-drop alert is on, the listing’s title, type, price in cents, beds, baths, size, city, state, status and page on the site (`url`; the address and map are there, not here), and the newest 10 recorded price changes. A listing a moderator removed, or one posted by someone you have blocked or who has blocked you, reads `available: false` with its figures `null` and no price changes; the saved row and your note stay. Only your own saved homes are returned. Never cached (`Cache-Control: private, no-store`). Needs the explicit `read:homes` scope, which `*`, `read:*` and a new key’s default grant do not include.

**Scope:** `read:homes` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listMySavedHomes`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `limit` | query | integer | no | Page size, 1–50 (default 25). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "listingId": "cm4homelisting0003",
      "savedAt": "2026-11-24T19:30:00.000Z",
      "note": "Landlord stopped answering.",
      "priceAlerts": true,
      "listing": {
        "title": null,
        "listingType": null,
        "propertyType": null,
        "priceCents": null,
        "beds": null,
        "baths": null,
        "sqft": null,
        "city": null,
        "state": null,
        "status": null,
        "url": "https://rmhstudios.com/homes/listing/cm4homelisting0003",
        "available": false
      },
      "priceChanges": []
    },
    {
      "listingId": "cm4homelisting0001",
      "savedAt": "2026-11-20T10:00:00.000Z",
      "note": "Quiet street, ask about parking.",
      "priceAlerts": true,
      "listing": {
        "title": "Sunny two-bedroom near campus",
        "listingType": "RENT",
        "propertyType": "APARTMENT",
        "priceCents": 135000,
        "beds": 2,
        "baths": 1,
        "sqft": 820,
        "city": "Rochester",
        "state": "NY",
        "status": "ACTIVE",
        "url": "https://rmhstudios.com/homes/listing/cm4homelisting0001",
        "available": true
      },
      "priceChanges": [
        {
          "oldCents": 140000,
          "newCents": 135000,
          "changedAt": "2026-11-22T08:00:00.000Z"
        },
        {
          "oldCents": 138000,
          "newCents": 140000,
          "changedAt": "2026-11-10T08:00:00.000Z"
        }
      ]
    }
  ],
  "nextCursor": null
}
```

### `PUT /api/v1/me/homes/saved/{listingId}`

Save a listing, through the site’s own save, and set your note and price-drop alert on it. Saving a home you already saved is not an error and changes only what you send: leave `note` out to keep the note, send `null` or an empty string to clear it (at most 1,000 characters, trimmed), and `priceAlerts` turns the alert on or off (a newly saved home has it on). A request with no body just saves. Send `Idempotency-Key` so a retry never acts twice. A listing that does not exist, that a moderator removed, or that someone you have blocked (or who has blocked you) posted is `404 not_found`. Answers with the saved home as `GET` returns it. Needs the explicit `write:homes` scope, which `*` and `write:*` do not include.

**Scope:** `write:homes` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `saveMyHome`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `listingId` | path | string | yes | The listing id. |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `note` | `string` | no | Your private note, up to 1,000 characters; `null` or an empty string clears it. |
| `priceAlerts` | `boolean` | no | Tell you when the price drops. |

```json
{
  "priceAlerts": false
}
```

**Example response** (`200`)

```json
{
  "data": {
    "listingId": "cm4homelisting0001",
    "savedAt": "2026-11-20T10:00:00.000Z",
    "note": null,
    "priceAlerts": false,
    "listing": {
      "title": "Sunny two-bedroom near campus",
      "listingType": "RENT",
      "propertyType": "APARTMENT",
      "priceCents": 135000,
      "beds": 2,
      "baths": 1,
      "sqft": 820,
      "city": "Rochester",
      "state": "NY",
      "status": "ACTIVE",
      "url": "https://rmhstudios.com/homes/listing/cm4homelisting0001",
      "available": true
    },
    "priceChanges": [
      {
        "oldCents": 140000,
        "newCents": 135000,
        "changedAt": "2026-11-22T08:00:00.000Z"
      }
    ]
  }
}
```

### `DELETE /api/v1/me/homes/saved/{listingId}`

Remove a listing from your saved homes, through the site’s own unsave; your note on it goes with it. Unsaving a home you have not saved is not an error: the answer is `204` either way. Send `Idempotency-Key` so a retry is replayed. Needs the explicit `write:homes` scope, which `*` and `write:*` do not include.

**Scope:** `write:homes` · **Success:** `204` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:** `unsaveMyHome`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `listingId` | path | string | yes | The listing id. |

### `GET /api/v1/me/homes/searches`

Your saved searches (the alerts that tell you about new listings), newest first, up to 50. Each carries its label, the criteria you set (listing type, property types, place label and radius, price range in cents, minimum beds and baths, pets) and whether it is on. A search’s centre (`lat`, `lng`) is never returned: it is often your own street, and the label names it. A criterion you did not set is `null`. Never cached (`Cache-Control: private, no-store`). Needs the explicit `read:homes` scope, which `*`, `read:*` and a new key’s default grant do not include.

**Scope:** `read:homes` · **Success:** `200` · **Operation id:** `listMyHomeSearches`

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "cm4homewatch0002",
      "label": "Anything near campus",
      "listingType": null,
      "propertyTypes": [
        "APARTMENT",
        "ROOM"
      ],
      "locationLabel": null,
      "radiusKm": null,
      "minPriceCents": null,
      "maxPriceCents": null,
      "minBeds": null,
      "minBaths": null,
      "petsRequired": false,
      "active": true,
      "createdAt": "2026-11-22T09:00:00.000Z"
    },
    {
      "id": "cm4homewatch0001",
      "label": "Two beds under 1,500",
      "listingType": "RENT",
      "propertyTypes": [
        "APARTMENT"
      ],
      "locationLabel": "Rochester, NY",
      "radiusKm": 8,
      "minPriceCents": 90000,
      "maxPriceCents": 150000,
      "minBeds": 2,
      "minBaths": 1,
      "petsRequired": true,
      "active": true,
      "createdAt": "2026-11-10T09:00:00.000Z"
    }
  ]
}
```
