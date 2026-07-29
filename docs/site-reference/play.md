# Games & apps

The catalogs themselves are generated — [Games](./games.md) and [Apps](./apps.md) list every entry, including the unlisted ones. This page explains how a game or app is *wired into* the site, which is the part that isn't obvious from a catalog.

## The catalog is the source of truth

`lib/games.ts` and `lib/apps.ts` are the single source of truth for what appears on the site. The homepage sections and the `/games` and `/apps` browse pages all read from them; nothing hardcodes a card. An entry carries its route, description, tags, status, whether it needs sign-in (`authGate`), and whether it is `unlisted`.

Adding a game means adding a catalog entry **and** a route. Adding only the route produces a game that exists but that nothing links to.

## Anatomy of a game

A typical game spans four places:

| Layer | Location |
| ----- | -------- |
| Route | `app/routes/<game>.tsx` (top-level — full-screen, no site shell) |
| Components | `components/<game>/` |
| Client logic | `lib/<game>/` |
| Server (multiplayer only) | `server/<hub>/` plus `lib/<game>/socket.ts` and `lib/<game>/events.ts` |

Full-screen apps share a chrome tier in `components/shared/`: `AppShell`, `AppHeader`, `AppToaster`, `ConnectionStatus`, and the `--app-*` token contract in `app-theme.css`. Use them rather than rebuilding a header — `ConnectionStatus` in particular already handles the reconnect banner and the peer-wait overlay, which are easy to get subtly wrong.

## Realtime

Multiplayer games talk to Node hubs over Socket.io, not to the web tier:

| Hub | Port | Serves |
| --- | ---- | ------ |
| `socket-server` | 7001 | The general hub, including RMHMusic |
| `rmhbox` | 7676 | RMHBox party games |
| `rmhtube` | 7003 | Watch-party sync |

Every client socket is built on `lib/shared/realtime/client.ts` — the factory that handles fast reconnect, wake signals, per-attempt auth and an opt-in outbox. Event names belong in `lib/<app>/events.ts` so client and server import the same constants instead of trading string literals.

```{important}
State that decides an outcome — scores, turn order, who won — must be
authoritative on the server. The client renders it; it does not own it.
```

`PEER_GRACE_MS` in `lib/shared/realtime/types.ts` (15s) is read by both the client and the server's `PresenceGrace`, so the two cannot disagree about when a peer has actually left rather than briefly dropped.

## Audio, 3D and performance

- Audio: `howler`/`tone`. Always obtain a context via `getAudioContext()` from `lib/shared/platform.ts` — never `new AudioContext()` — so the page doesn't end up with several competing contexts.
- 3D: `@react-three/fiber` with `@react-three/rapier` for physics.
- `lib/performance-tier.ts` and `lib/motion-features.ts` scale effects to the device. Respect `useReducedMotion` — the global `MotionConfig` already sets `reducedMotion="user"`, so framer-motion animations honour it, but imperative animation loops need to check.

## Cross-cutting surfaces

| Route | What it is |
| ----- | ---------- |
| `/games`, `/apps` | Browse pages, rendered from the catalogs. |
| `/arcade` | Arcade Pass — per-game daily challenges. |
| `/saves` | Cross-game saves. |
| `/replays/:id` | A saved replay. |
| `/ranked` | The ranked ladder. |

Leaderboards are served by `lib/leaderboard.server.ts` and exposed publicly through the API (`read:leaderboards`) at `/api/v1/leaderboards/{game}` — so a game's leaderboard is readable programmatically without scraping the page.

## Unlisted games

Some games are reachable by URL but deliberately absent from the browse pages — the `secret/*` routes among them. They are marked `unlisted` in the catalog and listed in a dedicated section of the generated [game catalog](./games.md). Unlisted is a discovery decision, not a security boundary: an unlisted game with an auth gate is protected by the gate, not by being hard to find.
