# Developer API

Build on RMH Studios programmatically — read your account and the public feed, post on your own behalf, manage social actions, browse builds, blog, news and leaderboards, and subscribe to real-time webhooks.

| | |
| --- | --- |
| **Base URL** | `https://rmhstudios.com` |
| **Version** | `v1` — breaking changes ship under a new version prefix |
| **Format** | JSON request/response bodies, UTF-8. Writes accept `application/json` |
| **Availability** | An active **Starter** subscription or higher. Entitlement is re-checked on **every** request, so access tracks your subscription in real time |
| **OpenAPI** | [`/api/v1/openapi.json`](https://rmhstudios.com/api/v1/openapi.json) — point your codegen at it |

## Quickstart

```bash
# 1. Create a key at https://rmhstudios.com/developer and copy it (shown once).
export RMH_KEY=rmh_live_xxxxxxxxxxxxxxxxxxxxxxxx

# 2. Call the API.
curl https://rmhstudios.com/api/v1/me \
  -H "Authorization: Bearer $RMH_KEY"
```

Every response includes an `X-Request-Id` header — include it when contacting support.

## Guides

::::{grid} 1 2 2 3
:gutter: 3

:::{grid-item-card} Authentication
:link: authentication
:link-type: doc

Sending your key, and how keys are stored, scoped, rotated and revoked.
:::

:::{grid-item-card} Scopes
:link: scopes
:link-type: doc

The permission catalog, and how an endpoint decides whether your key qualifies.
:::

:::{grid-item-card} Rate limits
:link: rate-limits
:link-type: doc

Per-key budgets by tier, the headers on every response, and how to back off.
:::

:::{grid-item-card} Errors
:link: errors
:link-type: doc

The `type`/`code` taxonomy, the error envelope, and every code we return.
:::

:::{grid-item-card} Pagination
:link: pagination
:link-type: doc

Keyset paging: `limit`, `cursor`, and the `{ data, nextCursor }` envelope.
:::

:::{grid-item-card} Idempotency
:link: idempotency
:link-type: doc

Making writes safe to retry with the `Idempotency-Key` header.
:::

:::{grid-item-card} Webhooks
:link: webhooks
:link-type: doc

Subscribing to events, delivery semantics, and verifying HMAC signatures.
:::

:::{grid-item-card} Endpoint reference
:link: endpoints/index
:link-type: doc

Every endpoint, grouped, with parameters and worked examples.
:::

:::{grid-item-card} Changelog
:link: changelog
:link-type: doc

What changed in each version of the API.
:::

::::

```{toctree}
:hidden:
:maxdepth: 1

authentication
scopes
rate-limits
errors
pagination
idempotency
webhooks
endpoints/index
changelog
internals
```
