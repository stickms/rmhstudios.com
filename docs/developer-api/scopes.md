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
| `read:games` | Games | Read your game playtime and achievements, and the playtime other members share with you. |
| `read:study` | Study | Read your flashcard decks, authored cards and due counts. |
| `write:study` | Study | Create, edit and delete your flashcard decks and cards. Reviews cannot be written. |
| `manage:webhooks` | Webhooks | Create and manage webhook subscriptions. |
| `read:events` | Events | Read events you can see and your RSVPs. |
| `write:events` | Events | RSVP to events and cancel your RSVP. |
| `read:communities` | Communities | Read communities you can see, their rules and posts, and your memberships. |
| `write:communities` | Communities | Post into communities you are a member of. |
| `read:reading` | Reading | Read your highlights, notes, shelves and reading goal. |
| `write:reading` | Reading | Edit, publish, unpublish and delete your highlights and notes, and edit your shelves. |
| `read:tournaments` | Tournaments | Read public tournaments and brackets, and your own entries and matches. |
| `write:tournaments` | Tournaments | Check yourself in and report, confirm or withdraw your match results. Never registers or moves coins. |
| `read:scheduled` | Scheduled | Read your drafts, scheduled posts and time capsules. |
| `write:scheduled` | Scheduled | Save, change, discard and publish your drafts and scheduled posts. Community posts also need write:communities; time capsules are never changed. |
| `read:search` | Search | Search public posts and people by keyword. Each search counts as 3 requests against the daily quota. |

<!-- END GENERATED: scopes -->

```{note}
This table is generated from `lib/api/scopes.ts` by `pnpm docs:api` — the same
module the API and the key-creation UI read. If a scope exists in the product it
is in this table.
```

## Scheduled posts

`write:scheduled` saves, changes, discards and publishes your drafts and scheduled posts. A post that goes into a
community needs `write:communities` as well, exactly as `POST /api/v1/posts` does; a key with only
`write:scheduled` gets `403 insufficient_scope` for those. Time capsules can be read with `read:scheduled` and are
never changed through the API.

## Search

`read:search` covers `GET /api/v1/search/posts` and `GET /api/v1/search/people`. Each search counts as 3 requests
against the key's daily quota. Search is keyword search only; results depend on your blocks, so they are never shared
between keys.
