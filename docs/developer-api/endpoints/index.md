<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/api/registry.ts. Regenerate with `pnpm docs:api`.
-->

# Endpoint reference

Every endpoint in the public `v1` API — 127 across 24 groups. Paths are relative to `https://rmhstudios.com`. The same registry generates the [OpenAPI 3.1 document](https://rmhstudios.com/api/v1/openapi.json), so the two never disagree.

| Group | Endpoints | Covers |
| ----- | --------- | ------ |
| [Account](./account.md) | 6 | `read:profile`, `read:notifications`, `read:bookmarks`, `read:reading` |
| [Posts](./posts.md) | 4 | `read:posts`, `write:posts` |
| [Engagement](./engagement.md) | 6 | `write:likes`, `read:feed`, `write:comments`, `write:bookmarks` |
| [Feed](./feed.md) | 1 | `read:feed` |
| [Users](./users.md) | 6 | `read:users`, `write:follows` |
| [Media](./media.md) | 1 | `write:media` |
| [Content](./content.md) | 7 | `read:builds`, `read:content`, `read:leaderboards` |
| [Games](./games.md) | 6 | `read:games` |
| [Webhooks](./webhooks.md) | 5 | `manage:webhooks` |
| [Meta](./meta.md) | 1 | no scope required |
| [Study](./study.md) | 13 | `read:study`, `write:study`, `write:study-reviews` |
| [Events](./events.md) | 11 | `read:events`, `write:events`, `manage:events` |
| [Communities](./communities.md) | 4 | `read:communities` |
| [Reading](./reading.md) | 7 | `read:reading`, `write:reading` |
| [Tournaments](./tournaments.md) | 8 | `read:tournaments`, `write:tournaments` |
| [Scheduled](./scheduled.md) | 6 | `read:scheduled`, `write:scheduled` |
| [Search](./search.md) | 2 | `read:search` |
| [Feeds](./feeds.md) | 4 | `read:feeds`, `write:feeds` |
| [Practice](./practice.md) | 5 | `read:practice` |
| [Moderation](./moderation.md) | 5 | `manage:moderation` |
| [RMHTube](./rmhtube.md) | 7 | `read:rmhtube`, `write:rmhtube` |
| [RMHCharacters](./rmhcharacters.md) | 4 | `read:characters` |
| [RMHLadder](./rmhladder.md) | 4 | `read:ladder`, `write:ladder` |
| [RMH Homes](./rmh-homes.md) | 4 | `read:homes`, `write:homes` |

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
events
communities
reading
tournaments
scheduled
search
feeds
practice
moderation
rmhtube
rmhcharacters
rmhladder
rmh-homes
```
