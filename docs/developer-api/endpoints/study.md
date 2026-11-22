<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Study

11 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint                                                      | Scope         | Summary                                |
| ------------------------------------------------------------- | ------------- | -------------------------------------- |
| `GET /api/v1/me/decks`                                        | `read:study`  | List your decks                        |
| `POST /api/v1/me/decks`                                       | `write:study` | Create a deck                          |
| `GET /api/v1/me/decks/{id}`                                   | `read:study`  | Get a deck                             |
| `PATCH /api/v1/me/decks/{id}`                                 | `write:study` | Update a deck                          |
| `DELETE /api/v1/me/decks/{id}`                                | `write:study` | Delete a deck                          |
| `GET /api/v1/me/decks/{id}/cards`                             | `read:study`  | List a deck’s cards                    |
| `POST /api/v1/me/decks/{id}/cards`                            | `write:study` | Add cards                              |
| `PATCH /api/v1/me/decks/{id}/cards/{cardId}`                  | `write:study` | Update a card                          |
| `DELETE /api/v1/me/decks/{id}/cards/{cardId}`                 | `write:study` | Delete a card                          |
| `PUT /api/v1/me/decks/{id}/cards/by-external-id/{externalId}` | `write:study` | Create or update a card by external id |
| `GET /api/v1/me/decks/{id}/due`                               | `read:study`  | Get due counts                         |

## Reference

### `GET /api/v1/me/decks`

Your flashcard decks, newest change first. `dueCount` is how many cards are due now; `suspended` is how many the key
owner has set aside (not in `dueCount`). Only your own decks are listed.

**Scope:** `read:study` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation
id:** `listMyDecks`

| Parameter | In    | Type    | Required | Description                                                        |
| --------- | ----- | ------- | -------- | ------------------------------------------------------------------ |
| `limit`   | query | integer | no       | Page size, 1–100 (default 20).                                     |
| `cursor`  | query | string  | no       | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "cldeck1",
      "title": "Spanish verbs",
      "description": null,
      "isPublic": false,
      "cardCount": 2,
      "dueCount": 2,
      "suspended": 0,
      "updatedAt": "2026-11-20T21:14:00.000Z"
    }
  ],
  "nextCursor": null
}
```

### `POST /api/v1/me/decks`

Create an empty deck. At most 200 decks per account.

**Scope:** `write:study` · **Success:** `201` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:**
`createMyDeck`

**Request body** (`application/json`)

| Field         | Type      | Required | Description                                              |
| ------------- | --------- | -------- | -------------------------------------------------------- |
| `title`       | `string`  | yes      | 1–100 characters.                                        |
| `description` | `string`  | no       | Up to 500 characters.                                    |
| `isPublic`    | `boolean` | no       | List the deck in the public marketplace (default false). |

```json
{
  "title": "Spanish verbs",
  "description": null,
  "isPublic": false
}
```

**Example response** (`201`)

```json
{
  "id": "cldeck1",
  "title": "Spanish verbs",
  "description": null,
  "isPublic": false,
  "cardCount": 2,
  "dueCount": 2,
  "suspended": 0,
  "updatedAt": "2026-11-20T21:14:00.000Z"
}
```

### `GET /api/v1/me/decks/{id}`

One of your decks. A deck that is not yours is 404.

**Scope:** `read:study` · **Success:** `200` · **Operation id:** `getMyDeck`

| Parameter | In   | Type   | Required | Description  |
| --------- | ---- | ------ | -------- | ------------ |
| `id`      | path | string | yes      | The deck id. |

**Example response** (`200`)

```json
{
  "id": "cldeck1",
  "title": "Spanish verbs",
  "description": null,
  "isPublic": false,
  "cardCount": 2,
  "dueCount": 2,
  "suspended": 0,
  "updatedAt": "2026-11-20T21:14:00.000Z"
}
```

### `PATCH /api/v1/me/decks/{id}`

Change the title, description or visibility. An empty description clears it.

**Scope:** `write:study` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:**
`updateMyDeck`

| Parameter | In   | Type   | Required | Description  |
| --------- | ---- | ------ | -------- | ------------ |
| `id`      | path | string | yes      | The deck id. |

**Request body** (`application/json`)

| Field         | Type      | Required | Description                            |
| ------------- | --------- | -------- | -------------------------------------- |
| `title`       | `string`  | no       | 1–100 characters.                      |
| `description` | `string`  | no       | Up to 500 characters; empty clears it. |
| `isPublic`    | `boolean` | no       | Public in the marketplace.             |

```json
{
  "title": "Spanish verbs, set 1"
}
```

**Example response** (`200`)

```json
{
  "id": "cldeck1",
  "title": "Spanish verbs",
  "description": null,
  "isPublic": false,
  "cardCount": 2,
  "dueCount": 2,
  "suspended": 0,
  "updatedAt": "2026-11-20T21:14:00.000Z"
}
```

### `DELETE /api/v1/me/decks/{id}`

Permanently delete the deck, its cards and their review history.

**Scope:** `write:study` · **Success:** `204` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:**
`deleteMyDeck`

| Parameter | In   | Type   | Required | Description  |
| --------- | ---- | ------ | -------- | ------------ |
| `id`      | path | string | yes      | The deck id. |

### `GET /api/v1/me/decks/{id}/cards`

The cards you wrote, in deck order. Cards generated from them (the reverse side of a reversible card, one card per cloze
deletion) are not listed.

**Scope:** `read:study` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation
id:** `listMyDeckCards`

| Parameter | In    | Type    | Required | Description                                                        |
| --------- | ----- | ------- | -------- | ------------------------------------------------------------------ |
| `id`      | path  | string  | yes      | The deck id.                                                       |
| `limit`   | query | integer | no       | Page size, 1–100 (default 20).                                     |
| `cursor`  | query | string  | no       | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "clcard1",
      "kind": "basic",
      "front": "hablar",
      "back": "to speak",
      "position": 0,
      "externalId": null
    }
  ],
  "nextCursor": null
}
```

### `POST /api/v1/me/decks/{id}/cards`

Add 1 to 100 cards in one request, all or nothing: one invalid card, a duplicate `externalId`, or a deck over its
2,000-card limit (generated cards count) writes nothing. Reversible and cloze cards get their generated cards exactly as
in the editor. `kind` is `basic`, `reversible` or `cloze` (a cloze card has only `front`, with `{{c1::answer}}`
deletions).

**Scope:** `write:study` · **Success:** `201` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:**
`createMyDeckCards`

| Parameter | In   | Type   | Required | Description  |
| --------- | ---- | ------ | -------- | ------------ |
| `id`      | path | string | yes      | The deck id. |

**Request body** (`application/json`)

| Field   | Type       | Required | Description                                                                                                                                                                       |
| ------- | ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cards` | `object[]` | yes      | 1–100 cards: `{ kind?, front, back?, externalId? }`. `front` and `back` up to 500 characters (a cloze `front` up to 1000); `externalId` up to 100 characters, unique in the deck. |

```json
{
  "cards": [
    {
      "front": "hablar",
      "back": "to speak",
      "externalId": null
    },
    {
      "kind": "reversible",
      "front": "comer",
      "back": "to eat"
    }
  ]
}
```

**Example response** (`201`)

```json
{
  "data": [
    {
      "id": "clcard1",
      "kind": "basic",
      "front": "hablar",
      "back": "to speak",
      "position": 0,
      "externalId": null
    }
  ],
  "cardCount": 2
}
```

### `PATCH /api/v1/me/decks/{id}/cards/{cardId}`

Change a card’s kind, front or back. Its review history stays; its generated cards are regenerated in place. A generated
card is 404.

**Scope:** `write:study` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:**
`updateMyDeckCard`

| Parameter | In   | Type   | Required | Description  |
| --------- | ---- | ------ | -------- | ------------ |
| `id`      | path | string | yes      | The deck id. |
| `cardId`  | path | string | yes      | The card id. |

**Request body** (`application/json`)

| Field   | Type     | Required | Description                            |
| ------- | -------- | -------- | -------------------------------------- |
| `kind`  | `string` | no       | `basic`, `reversible` or `cloze`.      |
| `front` | `string` | no       | The front (a cloze card’s whole text). |
| `back`  | `string` | no       | The back.                              |

```json
{
  "back": "to talk, to speak"
}
```

**Example response** (`200`)

```json
{
  "id": "clcard1",
  "kind": "basic",
  "front": "hablar",
  "back": "to speak",
  "position": 0,
  "externalId": null
}
```

### `DELETE /api/v1/me/decks/{id}/cards/{cardId}`

Delete a card with its generated cards and review history.

**Scope:** `write:study` · **Success:** `204` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:**
`deleteMyDeckCard`

| Parameter | In   | Type   | Required | Description  |
| --------- | ---- | ------ | -------- | ------------ |
| `id`      | path | string | yes      | The deck id. |
| `cardId`  | path | string | yes      | The card id. |

### `PUT /api/v1/me/decks/{id}/cards/by-external-id/{externalId}`

Create the card keyed by your own id in this deck, or update it. The same body sent twice changes nothing the second
time. 201 when created, 200 when the card already existed.

**Scope:** `write:study` · **Success:** `200` · **Idempotent:** accepts `Idempotency-Key` · **Operation id:**
`upsertMyDeckCard`

| Parameter    | In   | Type   | Required | Description                                                         |
| ------------ | ---- | ------ | -------- | ------------------------------------------------------------------- |
| `id`         | path | string | yes      | The deck id.                                                        |
| `externalId` | path | string | yes      | Your own id for the card, up to 100 characters, unique in the deck. |

**Request body** (`application/json`)

| Field   | Type     | Required | Description                                 |
| ------- | -------- | -------- | ------------------------------------------- |
| `kind`  | `string` | no       | `basic` (default), `reversible` or `cloze`. |
| `front` | `string` | yes      | The front.                                  |
| `back`  | `string` | no       | The back (not used by cloze cards).         |

```json
{
  "front": "hablar",
  "back": "to speak"
}
```

**Example response** (`200`)

```json
{
  "id": "clcard1",
  "kind": "basic",
  "front": "hablar",
  "back": "to speak",
  "position": 0,
  "externalId": "verbs-001"
}
```

### `GET /api/v1/me/decks/{id}/due`

How many cards in the deck are due now and in the next 24 hours (suspended cards are not counted), for a “you have 40
cards due” widget. No card content. Reviews are made in the app and cannot be written through the API.

**Scope:** `read:study` · **Success:** `200` · **Operation id:** `getMyDeckDue`

| Parameter | In   | Type   | Required | Description  |
| --------- | ---- | ------ | -------- | ------------ |
| `id`      | path | string | yes      | The deck id. |

**Example response** (`200`)

```json
{
  "deckId": "cldeck1",
  "dueNow": 40,
  "dueNext24h": 12,
  "asOf": "2026-11-20T21:14:00.000Z"
}
```
