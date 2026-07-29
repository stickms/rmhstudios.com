# Errors

Non-2xx responses use a stable envelope:

```json
{
  "error": {
    "type": "authorization_error",
    "code": "insufficient_scope",
    "message": "This endpoint requires the \"write:posts\" scope, which this key does not have.",
    "request_id": "req_…"
  }
}
```

- `code` is the precise, machine-stable reason — branch on this.
- `type` is the broad category, for clients that only need to know *what kind* of thing went wrong.
- `message` is human-readable and may change; don't parse it.
- `request_id` echoes the `X-Request-Id` header. Quote it when contacting support.

## Codes

<!-- BEGIN GENERATED: errors -->

| `code` | `type` | HTTP status |
| ------ | ------ | ----------- |
| `account_suspended` | `authorization_error` | `403` |
| `conflict` | `conflict_error` | `409` |
| `feature_not_available` | `authorization_error` | `403` |
| `forbidden` | `authorization_error` | `403` |
| `idempotency_conflict` | `conflict_error` | `409` |
| `insufficient_scope` | `authorization_error` | `403` |
| `internal_error` | `api_error` | `500` |
| `invalid_key` | `authentication_error` | `401` |
| `invalid_media` | `invalid_request_error` | `400` |
| `invalid_request` | `invalid_request_error` | `400` |
| `key_expired` | `authentication_error` | `401` |
| `method_not_allowed` | `invalid_request_error` | `405` |
| `missing_key` | `authentication_error` | `401` |
| `not_found` | `not_found_error` | `404` |
| `payload_too_large` | `invalid_request_error` | `413` |
| `quota_exceeded` | `rate_limit_error` | `429` |
| `rate_limited` | `rate_limit_error` | `429` |
| `subscription_required` | `authorization_error` | `403` |
| `unprocessable` | `invalid_request_error` | `422` |

<!-- END GENERATED: errors -->

An unrecognised code always maps to `api_error` / `500`, so a client that handles the categories above degrades safely if we add a code.

```{note}
Generated from `lib/api/errors.ts` by `pnpm docs:api`.
```
