# Scopes

Each API key carries granular scopes; an endpoint accepts a key only if its scopes satisfy the endpoint's requirement.

Scopes are `<action>:<resource>` — `read:profile`, `write:posts`, `manage:webhooks`. `read` scopes are non-mutating; `write` and `manage` change state.

Three wildcards are accepted and stored literally on the key:

| Wildcard | Grants |
| -------- | ------ |
| `*` | Everything. |
| `read:*` | Every read scope. |
| `write:*` | Every write scope (likewise `manage:*`). |

Grant the least privilege an integration needs. A key that only reads the public feed should carry `read:feed` and nothing else — if it leaks, that is the whole blast radius.

A request whose key lacks the required scope fails with `403 insufficient_scope`; the message names the scope that was missing.

## Catalog

<!-- BEGIN GENERATED: scopes -->

| Scope | Group | Grants |
| ----- | ----- | ------ |
| `read:profile` | Account | Read your account summary, tier, and stats. |
| `read:posts` | Posts | Read your own posts. |
| `write:posts` | Posts | Create and delete posts on your account. |
| `read:feed` | Feed | Read the public global feed. |
| `read:users` | Users | Read public user profiles and the social graph. |
| `write:follows` | Users | Follow and unfollow other users. |
| `write:likes` | Engagement | Like and unlike posts. |
| `write:comments` | Engagement | Comment on posts. |
| `read:notifications` | Account | Read your notifications. |
| `read:bookmarks` | Account | Read your bookmarks. |
| `write:bookmarks` | Account | Add and remove bookmarks. |
| `write:media` | Media | Upload images for use in posts. |
| `read:builds` | Content | Read the public builds marketplace. |
| `read:content` | Content | Read blog posts and news articles. |
| `read:leaderboards` | Content | Read public game leaderboards. |
| `read:slice-it` | Content | Read Slice It! charts, leaderboards and public player stats. |
| `manage:webhooks` | Webhooks | Create and manage webhook subscriptions. |

<!-- END GENERATED: scopes -->

```{note}
This table is generated from `lib/api/scopes.ts` by `pnpm docs:api` — the same
module the API and the key-creation UI read. If a scope exists in the product it
is in this table.
```
