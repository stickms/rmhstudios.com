<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Slice It

5 endpoints. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/slice-it/charts` | `read:slice-it` | List Slice It! charts |
| `GET /api/v1/slice-it/charts/{id}` | `read:slice-it` | Get a Slice It! song and its charts |
| `GET /api/v1/slice-it/leaderboard` | `read:slice-it` | Get a Slice It! leaderboard |
| `GET /api/v1/slice-it/players/{handle}` | `read:slice-it` | Get a Slice It! player’s public stats |
| `GET /api/v1/me/slice-it/runs` | `read:slice-it-runs` | List your Slice It! runs |

## Reference

### `GET /api/v1/slice-it/charts`

Public chart metadata for songs in the Slice It! library, most played first. A private or taken-down song is never listed. The chart itself (its notes) is not served; metadata, ratings and counts only. `rating` is the highest difficulty rating among the song’s charts and is `null` while none is rated. Pages with `limit` (1–100, default 25) and `offset`; `meta` carries the total. Cached privately for 30 seconds on the client (`Cache-Control: private, max-age=30`).

**Scope:** `read:slice-it` · **Success:** `200` · **Operation id:** `listSliceItCharts`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `limit` | query | integer | no | Page size, 1–100 (default 25). |
| `offset` | query | integer | no | Songs to skip (default 0). |
| `genre` | query | string | no | Only songs of this genre, for example `electronic`. An unknown genre is a 400. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "cm4slicesong0001",
      "title": "Untitled demo",
      "artist": "Ada",
      "album": null,
      "duration": 142.5,
      "bpm": null,
      "genre": null,
      "tags": [
        "chiptune"
      ],
      "rating": null,
      "plays": 312,
      "likes": 18,
      "scores": 47,
      "createdAt": "2026-11-02T18:30:00.000Z"
    }
  ],
  "meta": {
    "total": 1,
    "limit": 25,
    "offset": 0
  }
}
```

### `GET /api/v1/slice-it/charts/{id}`

One public song’s metadata (the fields of the list), its published charts (`id`, `difficulty`, `noteCount` and `revision`, the chart’s content hash: it changes when the notes do) and its chart reviews (`count`, and the averages `fit` and `fun` from 1 to 5, `null` while there are no reviews). A song that is private, taken down or missing is `404 not_found`. The notes themselves are never served. Cached privately for 30 seconds on the client.

**Scope:** `read:slice-it` · **Success:** `200` · **Operation id:** `getSliceItChart`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `id` | path | string | yes | The song id. |

**Example response** (`200`)

```json
{
  "data": {
    "id": "cm4slicesong0001",
    "title": "Untitled demo",
    "artist": "Ada",
    "album": null,
    "duration": 142.5,
    "bpm": null,
    "genre": null,
    "tags": [
      "chiptune"
    ],
    "rating": null,
    "plays": 312,
    "likes": 18,
    "scores": 47,
    "createdAt": "2026-11-02T18:30:00.000Z",
    "charts": [
      {
        "id": "0192b3c4-5d6e-7f80-91a2-b3c4d5e6f708",
        "difficulty": "expert",
        "noteCount": 1184,
        "revision": "9f2c0e7a41d85b36c0a7e19d4b52f8630a1de7c94b2658f03ae1d7c4b9086f25"
      }
    ],
    "reviews": {
      "count": 0,
      "fit": null,
      "fun": null
    }
  }
}
```

### `GET /api/v1/slice-it/leaderboard`

One song’s board for one difficulty and modifier pool (a run with six modifiers is not ranked against a plain one). Players are handles, never ids (`player` is the handle, else the username, and `null` when the member has neither), and a member who left the leaderboards or is banned is not listed. `accuracy` is `null` on a score set before accuracy was recorded. A private, taken-down or missing song is `404 not_found`. `limit` is 1–100 (default 25). Cached privately for 30 seconds on the client (`Cache-Control: private, max-age=30`).

**Scope:** `read:slice-it` · **Success:** `200` · **Operation id:** `getSliceItLeaderboard`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `songId` | query | string | yes | The song id. |
| `difficulty` | query | string | no | One of `easy`, `normal`, `hard`, `expert` (default `normal`). |
| `modPool` | query | string | no | One of `none`, `standard`, `challenge` (default `none`). |
| `limit` | query | integer | no | Rows, 1–100 (default 25). |

**Example response** (`200`)

```json
{
  "song": {
    "id": "cm4slicesong0001",
    "title": "Untitled demo",
    "artist": "Ada"
  },
  "difficulty": "normal",
  "modPool": "none",
  "data": [
    {
      "rank": 1,
      "player": null,
      "score": 984210,
      "maxCombo": 612,
      "accuracy": null,
      "cleared": true,
      "achievedAt": "2026-11-20T21:14:00.000Z"
    }
  ]
}
```

### `GET /api/v1/slice-it/players/{handle}`

A member’s public Slice It! career (`career`, `null` until their first run), their best 20 rows on public songs (`lamp` is `none`, `failed`, `cleared`, `fc` or `perfect`; `accuracy` is `null` on a score set before accuracy was recorded) and how many public songs they uploaded. Addressed and named by handle: no member id is returned. A member who left the leaderboards, is banned, has no handle or is blocked either way with the key owner is `404 not_found`, the same as an unknown handle. Cached privately for 30 seconds on the client.

**Scope:** `read:slice-it` · **Success:** `200` · **Operation id:** `getSliceItPlayer`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `handle` | path | string | yes | The member’s handle. |

**Example response** (`200`)

```json
{
  "data": {
    "player": {
      "handle": "ada",
      "name": "Ada"
    },
    "career": null,
    "best": [
      {
        "songId": "cm4slicesong0001",
        "title": "Untitled demo",
        "artist": "Ada",
        "score": 984210,
        "accuracy": null,
        "difficulty": "expert",
        "modPool": "none",
        "lamp": "fc",
        "achievedAt": "2026-11-20T21:14:00.000Z"
      }
    ],
    "uploads": 3
  }
}
```

### `GET /api/v1/me/slice-it/runs`

Your own runs, newest first, 1 to 50 (default 25), paged with `cursor`. `songId` keeps only the runs on one song. `id` is a string (a 64-bit integer). `chartId` is `null` for a run of a song’s generated chart. `lamp` is `none`, `failed`, `cleared`, `fc` or `perfect`; `fullCombo` and `perfect` are what the game declared, not verified. Never cached (`Cache-Control: private, no-store`). Needs the explicit `read:slice-it-runs` scope, which `*`, `read:*` and a new key’s default grant do not include.

**Scope:** `read:slice-it-runs` · **Success:** `200` · **Paginated:** keyset — see [Pagination](../pagination.md) · **Operation id:** `listMySliceItRuns`

| Parameter | In | Type | Required | Description |
| --------- | -- | ---- | -------- | ----------- |
| `limit` | query | integer | no | Page size, 1–50 (default 25). |
| `cursor` | query | string | no | Opaque cursor from a previous `nextCursor` to fetch the next page. |
| `songId` | query | string | no | Only runs on this song. |

**Example response** (`200`)

```json
{
  "data": [
    {
      "id": "48211",
      "songId": "cm4slicesong0001",
      "chartId": null,
      "score": 984210,
      "accuracy": 0.9731,
      "maxCombo": 612,
      "difficulty": "expert",
      "modPool": "none",
      "lamp": "fc",
      "cleared": true,
      "fullCombo": true,
      "perfect": false,
      "playedAt": "2026-11-20T21:14:00.000Z"
    }
  ],
  "nextCursor": null
}
```
