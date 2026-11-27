# Rate limits

Limits are enforced **per key**, per minute:

| Tier | Requests / minute |
| ---- | ----------------- |
| Pro | 120 |
| Max / higher | 600 |

A key can be given a lower per-minute limit than its tier (Developer, API keys). Its `X-RateLimit-Limit` then shows that number, and the request that exceeds it takes the usual `429`.

An admin can also cap a key (1 to 600 a minute) while it is being abused. The limit that applies is the lowest of the tier's, the key's own and the admin's cap, and `X-RateLimit-Limit` shows it. A cap is lifted by an admin; the owner cannot raise it.

Image uploads have a tighter dedicated budget (15/min) and a tier-scaled daily quota on top of the per-minute limit.

## Headers

**Every** response carries rate-limit headers — not just `429`s — so a client can pace itself without waiting to be rejected:

| Header | Meaning |
| ------ | ------- |
| `X-RateLimit-Limit` | Your per-minute ceiling. |
| `X-RateLimit-Remaining` | Requests left in the current window. |
| `X-RateLimit-Reset` | Unix time (seconds) when the window resets. |

A `429 Too Many Requests` also includes `Retry-After` (seconds). Back off and retry after that delay rather than retrying immediately — a tight retry loop burns the next window too.

```{tip}
Reading `X-RateLimit-Remaining` and slowing down as it approaches zero keeps a
batch job under the limit without ever taking a `429`.
```
