<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Meta

1 endpoint. Paths are relative to `https://rmhstudios.com`.

| Endpoint | Scope | Summary |
| -------- | ----- | ------- |
| `GET /api/v1/openapi.json` | — | OpenAPI document |

## Reference

### `GET /api/v1/openapi.json`

The machine-readable OpenAPI 3.1 description of this API. No authentication required.

**Scope:** none — this endpoint is unauthenticated · **Success:** `200` · **Operation id:** `getOpenApi`

**Example response** (`200`)

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "RMH Studios API",
    "version": "v1"
  }
}
```
