<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# RMHCharacters

4 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/me/characters` | `read:characters` | List your characters |
| `GET /api/v1/me/characters/{id}` | `read:characters` | Get one of your characters |
| `GET /api/v1/me/parties` | `read:characters` | List your parties |
| `GET /api/v1/me/parties/{id}` | `read:characters` | Get one of your parties |

## Reference

### `GET /api/v1/me/characters`

Your RMHCharacters sheets, most recently edited first. `summary` is the one a party sees, computed by the site's own rules engine: armor class, hit points, conditions, Perception (passive in 5e), speed and initiative. A sheet the rules data can no longer read is left out. Never cached (`Cache-Control: private, no-store`).

**Scope:** `read:characters` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listMyCharacters`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `limit` | query | integer | no | Page size, 1–50 (default 25). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "0b9f6c1e-5d1a-4a0e-9d57-6a3f1d2c8e11",
      "system": "dnd5e",
      "name": "Brienne",
      "level": 5,
      "summary": {
        "system": "dnd5e",
        "name": "Brienne",
        "level": 5,
        "ancestry": null,
        "classes": [
          {
            "name": "Fighter",
            "level": 5
          }
        ],
        "ac": 18,
        "hp": {
          "current": 38,
          "max": 44,
          "temp": 0
        },
        "conditions": [
          "Poisoned"
        ],
        "perception": 13,
        "speed": 30,
        "initiative": 2
      },
      "updatedAt": "2026-11-24T19:30:00.000Z"
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/me/characters/{id}`

One of your characters: the list fields plus `sheet`, the stored sheet as the site keeps it, without the `portrait` image (it is large); `portrait` says whether the sheet had one. Your own `notes` are part of the sheet. Another member's character is `404 not_found`. Never cached.

**Scope:** `read:characters` · **Success:** `200` · **Operation id:** `getMyCharacter`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The character id. |

**Example response** (`200`)

```json
{
  "data": {
    "id": "0b9f6c1e-5d1a-4a0e-9d57-6a3f1d2c8e11",
    "system": "dnd5e",
    "name": "Brienne",
    "level": 5,
    "summary": {
      "system": "dnd5e",
      "name": "Brienne",
      "level": 5,
      "ancestry": null,
      "classes": [
        {
          "name": "Fighter",
          "level": 5
        }
      ],
      "ac": 18,
      "hp": {
        "current": 38,
        "max": 44,
        "temp": 0
      },
      "conditions": [
        "Poisoned"
      ],
      "perception": 13,
      "speed": 30,
      "initiative": 2
    },
    "updatedAt": "2026-11-24T19:30:00.000Z",
    "portrait": false,
    "sheet": {
      "id": "0b9f6c1e-5d1a-4a0e-9d57-6a3f1d2c8e11",
      "system": "dnd5e",
      "name": "Brienne",
      "notes": ""
    }
  }
}
```

### `GET /api/v1/me/parties`

The parties you run (`role` `gm`) or play in (`player`), most recently changed first, with the game master's name and the number of players. Never cached.

**Scope:** `read:characters` · **Success:** `200` · **Operation id:** `listMyParties`

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "clparty1",
      "name": "Thursday table",
      "system": "dnd5e",
      "role": "player",
      "gm": "Ada",
      "members": 4
    }
  ]
}
```

### `GET /api/v1/me/parties/{id}`

One party as the site shows it to you: each member's name and the summary of the character they brought, the turn order and `turnIndex`, the line whose turn it is. A member's `summary` is `null` when the sheet cannot be read. Never another player's sheet or notes, and never the invite code. A party you are not in, or have left, is `404 not_found`. Never cached.

**Scope:** `read:characters` · **Success:** `200` · **Operation id:** `getMyParty`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The party id. |

**Example response** (`200`)

```json
{
  "data": {
    "id": "clparty1",
    "name": "Thursday table",
    "system": "dnd5e",
    "role": "player",
    "gm": "Ada",
    "members": [
      {
        "userId": "cluser1",
        "name": "Ada",
        "joinedAt": "2026-11-01T18:00:00.000Z",
        "isGm": true,
        "summary": {
          "system": "dnd5e",
          "name": "Brienne",
          "level": 5,
          "ancestry": null,
          "classes": [
            {
              "name": "Fighter",
              "level": 5
            }
          ],
          "ac": 18,
          "hp": {
            "current": 38,
            "max": 44,
            "temp": 0
          },
          "conditions": [
            "Poisoned"
          ],
          "perception": 13,
          "speed": 30,
          "initiative": 2
        }
      }
    ],
    "order": [
      {
        "id": "line2",
        "kind": "extra",
        "userId": null,
        "name": "Goblin",
        "value": 12
      },
      {
        "id": "line1",
        "kind": "member",
        "userId": "cluser1",
        "name": "Ada",
        "value": 17
      }
    ],
    "turnIndex": 0
  }
}
```
