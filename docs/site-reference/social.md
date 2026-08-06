# Social

The social layer is the spine of the site: the feed is the homepage, and most other areas post into it or link out of it.

## The feed (RMHarks)

A post is an **RMHark**. The feed at `/` is the site's index route (`app/routes/_site/index.tsx`) — not a marketing page.

| Route | What it is |
| ----- | ---------- |
| `/` | The timeline. |
| `/thread/:rootId` | A post and its replies, threaded. |
| `/u/:userid/post/:postid` | A single post in the context of its author. |
| `/moments/:id` | A moment. |
| `/tag/:tag` | Everything tagged with a hashtag. |
| `/explore` | Discovery and universal search — one page (`/search` redirects here, carrying `q`/`tab`). |
| `/bookmarks` | Posts you saved. |
| `/lists`, `/lists/:id` | User-curated lists. |
| `/embed/post/:id` | Embeddable single-post view (top-level, no shell). |

**Where the code lives.** `lib/feed/` handles timeline assembly, ranking, personalization, cursors and mentions. `lib/feed-types.ts` defines the `FeedItem` contract the client renders against, and `lib/feed-sse.ts` is the event bus behind live updates. Components are in `components/feed/` — which also owns the site-wide layout system (`SiteShell`, `PageLayout`, `ContextRail`, `AnimatedMain`).

**Live updates** ride SSE over `createBus()` from `lib/realtime-bus.server.ts` — a local `EventEmitter` with optional Redis fan-out, so a single-process deployment works without Redis and a multi-process one stays coherent with it. `hooks/useFeedSSE` is the client half.

```{important}
Every engagement mutation — like, comment, bookmark, follow, post — goes through
`lib/social/engagement.server.ts`. It owns the counters, SSE fanout,
notifications, XP, quest progress, achievements and webhook emission that each
of those actions triggers. The in-app routes and the public API both call it, so
a post created through the API awards XP exactly like one from the composer.
Adding a side effect anywhere else silently creates two behaviours.
```

## Profiles and identity

| Route | What it is |
| ----- | ---------- |
| `/u/:userid` | A public profile. |
| `/settings` | Account, appearance, privacy, notifications. |
| `/achievements`, `/progress` | Progression surfaces. |
| `/wrapped`, `/recap` | Periodic personal summaries. |

Handles are allocated at signup (`lib/handle.ts`, wired into `lib/auth.ts`). Rendering a user anywhere goes through `userDisplaySelect` / `resolveUser` in `lib/user-display.ts` — the shared Prisma selection that includes cosmetics — with `useFreshUser`/`stores/userDisplayStore` on the client so names and avatars update live rather than going stale mid-session.

**Auth** is Better Auth (`lib/auth.ts`): Discord, Google and GitHub OAuth, email/password, and passkeys, with Stripe and a `customSession` plugin that injects the subscription `tier` into the session. Custom user fields are `username`, `handle`, `isAdmin`, `isVerified`.

## Messaging and groups

| Route | What it is |
| ----- | ---------- |
| `/messages`, `/messages/:conversationId` | Direct messages. |
| `/groups`, `/groups/:id` | Group chats. |
| `/communities`, `/c/:slug` | Communities. |
| `/spaces/:id` | A live space. |

`lib/messages.server.ts` and `lib/conversation.server.ts` back DMs; `lib/group-chat/` and `lib/group-chats.server.ts` back group chats; `lib/communities/` and `lib/community.server.ts` back communities. `/spaces` redirects to `/communities` — the surface was folded in, and the old URL was kept rather than broken.

## Notifications and presence

`lib/notifications.server.ts` is the single entry point for creating a notification. It respects the user's preference matrix and mirrors to web push via `lib/push/send.server.ts`, so a caller doesn't have to know whether the user wants push. Unread counts come from `lib/useUnreadCount.ts` and `lib/useNotificationCount.ts`.

Presence lives in `lib/presence.server.ts` with `lib/usePresenceHeartbeat.ts` on the client and the shared `PEER_GRACE_MS` grace window in `lib/shared/realtime/types.ts` — the same constant the realtime servers read, so a client and server never disagree about when a peer counts as gone.

## Moderation

`lib/moderation/` and `lib/moderation.server.ts` handle reports and enforcement; `lib/admin-review.server.ts` and `lib/admin-audit.server.ts` back the review queue and its audit trail. `UserStrike` and `UserMute` are the enforcement records. Admin surfaces live under `/admin` and are gated in one place — `app/routes/_site/admin/route.tsx` bounces anyone without `isAdmin`, so individual admin pages carry no gate of their own.
