<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Endpoint reference

Every endpoint in the public `v1` API — 53 across 11 groups. Paths are relative to `https://rmhstudios.com`. The same registry generates the [OpenAPI 3.1 document](https://rmhstudios.com/api/v1/openapi.json), so the two never disagree.

| Group | Endpoints | Covers |
| ----- | --------- | ------ |
| [Account](./account.md) | 5 | `read:profile`, `read:notifications`, `read:bookmarks` |
| [Posts](./posts.md) | 4 | `read:posts`, `write:posts` |
| [Engagement](./engagement.md) | 6 | `write:likes`, `read:feed`, `write:comments`, `write:bookmarks` |
| [Feed](./feed.md) | 1 | `read:feed` |
| [Users](./users.md) | 6 | `read:users`, `write:follows` |
| [Media](./media.md) | 1 | `write:media` |
| [Content](./content.md) | 7 | `read:builds`, `read:content`, `read:leaderboards` |
| [Games](./games.md) | 6 | `read:games` |
| [Webhooks](./webhooks.md) | 5 | `manage:webhooks` |
| [Meta](./meta.md) | 1 | no scope required |
| [Study](./study.md) | 11 | `read:study`, `write:study` |

```{toctree}
:maxdepth: 2
:hidden:

account
posts
engagement
feed
users
media
content
games
webhooks
meta
study
```
