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
| `already_canceled` | `conflict_error` | `409` |
| `automod_held` | `invalid_request_error` | `422` |
| `canceled` | `conflict_error` | `409` |
| `confirm_on_site` | `conflict_error` | `409` |
| `conflict` | `conflict_error` | `409` |
| `feature_not_available` | `authorization_error` | `403` |
| `feature_restricted` | `authorization_error` | `403` |
| `forbidden` | `authorization_error` | `403` |
| `idempotency_conflict` | `conflict_error` | `409` |
| `insufficient_scope` | `authorization_error` | `403` |
| `internal_error` | `api_error` | `500` |
| `invalid_dates` | `invalid_request_error` | `400` |
| `invalid_key` | `authentication_error` | `401` |
| `invalid_media` | `invalid_request_error` | `400` |
| `invalid_recurrence` | `invalid_request_error` | `400` |
| `invalid_request` | `invalid_request_error` | `400` |
| `invalid_venue_url` | `invalid_request_error` | `400` |
| `ip_not_allowed` | `authorization_error` | `403` |
| `item_resolved` | `conflict_error` | `409` |
| `key_expired` | `authentication_error` | `401` |
| `key_suspended` | `authorization_error` | `403` |
| `list_private` | `authorization_error` | `403` |
| `method_not_allowed` | `invalid_request_error` | `405` |
| `missing_key` | `authentication_error` | `401` |
| `not_a_timeline` | `conflict_error` | `409` |
| `not_found` | `not_found_error` | `404` |
| `not_host` | `authorization_error` | `403` |
| `not_moderator` | `authorization_error` | `403` |
| `party_closed` | `conflict_error` | `409` |
| `payload_too_large` | `invalid_request_error` | `413` |
| `quota_exceeded` | `rate_limit_error` | `429` |
| `rate_limited` | `rate_limit_error` | `429` |
| `rule_not_found` | `invalid_request_error` | `400` |
| `sanction_refused` | `conflict_error` | `409` |
| `subscription_required` | `authorization_error` | `403` |
| `sync_window_expired` | `invalid_request_error` | `410` |
| `unprocessable` | `invalid_request_error` | `422` |

<!-- END GENERATED: errors -->

A key is also suspended (`key_suspended`) when its owner asks for their account to be deleted, and its owner's webhooks are disabled. Signing back in within the grace period cancels the deletion and restores the same key and webhooks; a key an admin suspended stays suspended. The body never says which.

An unrecognised code always maps to `api_error` / `500`, so a client that handles the categories above degrades safely if we add a code.

```{note}
Generated from `lib/api/errors.ts` by `pnpm docs:api`.
```
