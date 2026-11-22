<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Media

1 endpoint. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `POST /api/v1/images` | `write:media` | Upload an image |

## Reference

### `POST /api/v1/images`

Upload one image (multipart/form-data, field `image`, max 5 MB) and receive an opaque `media_id` to attach to a post via `media_ids`, or, with `surface=flashcard`, to set on a flashcard side as `{ media_id, alt }`. Unattached media expires ~24h after upload.

**Scope:** `write:media` · **Success:** `201` · **Operation id:** `uploadImage`

**Request body** (`multipart/form-data`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `image` | `file` | yes | png/jpg/webp/gif, max 5 MB (png/jpg/webp only with `surface=flashcard`). |
| `surface` | `string` | no | Optional. `flashcard` stores the picture for a flashcard side: still images only, metadata stripped. Omit it for a post image. |

**Example response** (`201`)

```json
{
  "id": "media_abc",
  "type": "image",
  "expires_at": "2026-07-01T10:00:00.000Z"
}
```
