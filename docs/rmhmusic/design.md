# RMHMusic — Design Document

**Date**: 2026-03-02
**Status**: Approved

## Overview

RMHMusic is a Spotify-powered music player for rmhstudios.com. Users connect their Spotify Premium account to play full songs in-browser with a WebGL particle-flow visualizer as the dominant visual experience. Users can create lightweight listening rooms to enjoy music together in real-time.

## Decisions

- **Playback**: Spotify Web Playback SDK (requires Premium per user)
- **Visualizer**: WebGL particle flow via React Three Fiber + Web Audio API
- **Rooms**: Lightweight (shared queue, basic chat, host controls)
- **Layout**: Visualizer-dominant with slide-out panels and persistent bottom player bar
- **Architecture**: Dedicated socket server (port 7004), following RMHTube pattern

## Architecture

| Layer | Implementation |
|-------|---------------|
| Frontend | `app/rmhmusic/` pages + `components/rmhmusic/` |
| State | Zustand store at `lib/rmhmusic/store.ts` |
| Socket Server | `server/rmhmusic/` on port 7004 |
| Database | Prisma models: RmhMusicRoom, RmhMusicRoomMember, RmhMusicQueueItem, RmhMusicChatMessage |
| Spotify | OAuth Authorization Code flow with PKCE + Web Playback SDK |
| Visualizer | React Three Fiber, Web Audio AnalyserNode for frequency data |

The Web Playback SDK creates a virtual Spotify player in the browser. Its audio is piped through a Web Audio AnalyserNode to extract frequency/waveform data in real-time, feeding the Three.js particle visualizer. For rooms, each user runs their own SDK instance; the socket server syncs play/pause/seek/skip commands so everyone's playback stays aligned.

## Spotify OAuth & Playback

### Authentication Flow

1. User clicks "Connect Spotify"
2. Redirect to Spotify OAuth (Authorization Code flow with PKCE)
3. Scopes: `streaming`, `user-read-playback-state`, `user-modify-playback-state`, `user-read-currently-playing`
4. Callback to `/api/rmhmusic/spotify/callback`
5. Store access_token + refresh_token in encrypted httpOnly cookies
6. Auto-refresh when expired (1hr lifespan)

### Env Vars

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI`

### Web Playback SDK

- Creates a Spotify Connect device in the browser
- Emits: `player_state_changed`, `ready`, `not_ready`
- Audio output piped to Web Audio AnalyserNode for visualizer
- Controls: play, pause, seek, skip, volume, shuffle, repeat

### API Routes

| Route | Purpose |
|-------|---------|
| `POST /api/rmhmusic/spotify/authorize` | Generate OAuth URL with PKCE |
| `GET /api/rmhmusic/spotify/callback` | Handle OAuth callback, store tokens |
| `POST /api/rmhmusic/spotify/refresh` | Refresh expired access token |
| `GET /api/rmhmusic/spotify/search` | Search tracks/albums/artists/playlists |
| `DELETE /api/rmhmusic/spotify/disconnect` | Revoke tokens, disconnect |

The existing `/api/spotify/search` (Client Credentials for profile songs) remains untouched.

## Music Visualizer

### Audio Analysis Pipeline

```
Spotify Web Playback SDK
  -> MediaStream from <audio> element
  -> Web Audio API: AudioContext -> AnalyserNode
  -> getByteFrequencyData() (256 frequency bins, 60fps)
  -> Decompose into bands:
      bass (0-250Hz)     -> particle scale + bloom intensity
      mids (250-2kHz)    -> particle velocity + color shift
      highs (2k-16kHz)   -> particle spawn rate + sparkle
      volume (RMS)       -> global pulse + camera zoom
```

### Three.js Scene

```
Canvas (full viewport, behind all UI)
  |-- ParticleField (instanced mesh, 2000-5000 particles)
  |   |-- Curl noise flow field for organic movement
  |   |-- Audio-reactive: size, speed, color mapped to frequency bands
  |   +-- Smooth interpolation (lerp) to prevent jarring jumps
  |-- FlowRibbons (tube geometry following noise paths)
  |   |-- Width pulses with bass
  |   +-- Color gradient shifts with mids
  |-- BackgroundGlow (shader material)
  |   +-- Soft radial gradient that pulses with volume
  +-- Camera (subtle drift + zoom on beats)
```

### Performance Targets

- 60fps on mid-range hardware (M1 MacBook, GTX 1060)
- Instanced rendering for particles (single draw call)
- Float32BufferAttribute for position/color updates
- Throttle analysis to 30fps if frame budget exceeded
- Reduce particle count on mobile (1000 max)

### Visual Style

- Default palette: purple-to-cyan gradient (matches --site-accent: #9b7ad8)
- Album art color sampling: extract dominant colors to shift particle palette
- Track transitions: particles scatter and reform with new colors (1.5s)

## UI Layout

### Page Structure

```
app/rmhmusic/
  |-- page.tsx              <- Landing: connect Spotify CTA + room browser
  |-- layout.tsx            <- Shared layout with persistent player bar
  |-- player/
  |   +-- page.tsx          <- Main player view (visualizer + controls)
  +-- [roomId]/
      +-- page.tsx          <- Room view (visualizer + chat + queue)
```

### Main Player View

```
+----------------------------------------------+
|                                              |
|          FULL-SCREEN VISUALIZER              |
|       (WebGL particle flow canvas)           |
|                                              |
|  +---------+                                 |
|  | Search  |  <- Slide-out panel (left)      |
|  | Browse  |     Search, albums, playlists   |
|  | Queue   |     Queue management            |
|  +---------+                                 |
|                                              |
|                          +------+            |
|                          | Room |  <- Slide-  |
|                          | Chat |    out      |
|                          +------+   (right)  |
|                                              |
+----------------------------------------------+
| <<  >>  || | Song Title - Artist | ###.. 2:14|
|            | Album Name          |   vol room|
+----------------------------------------------+
  ^ Persistent bottom bar (always visible)
```

### Interaction Design

- Bottom bar: always visible (track info, progress, controls, volume, room toggle)
- Left panel: toggle with search icon or key shortcut (search, browse, queue; semi-transparent over visualizer)
- Right panel: room mode only (chat + member list; semi-transparent)
- Album art: small in bottom bar, optional large floating in visualizer
- Mobile: bottom bar stays, panels become full-screen overlays, reduced particle count

### Landing Page

- Hero with animated visualizer preview (low-intensity, no audio)
- "Connect Spotify" button (prominent, required for playback)
- Room browser: active public rooms with listener count, current track
- "Create Room" / "Join Room" buttons
- Follows PageLayout pattern used by RMHTube

## Lightweight Rooms

### Database Models

```prisma
model RmhMusicRoom {
  id          String   @id @default(cuid())
  code        String   @unique // 6-char room code
  name        String
  hostId      String
  host        User     @relation("RmhMusicHostedRooms", fields: [hostId], references: [id])
  isPublic    Boolean  @default(true)
  password    String?  // hashed
  maxMembers  Int      @default(10)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  members     RmhMusicRoomMember[]
  queue       RmhMusicQueueItem[]
  chat        RmhMusicChatMessage[]
}

model RmhMusicRoomMember {
  id       String    @id @default(cuid())
  roomId   String
  room     RmhMusicRoom @relation(fields: [roomId], references: [id], onDelete: Cascade)
  userId   String
  user     User     @relation("RmhMusicRoomMembers", fields: [userId], references: [id])
  joinedAt DateTime @default(now())
  leftAt   DateTime?

  @@unique([roomId, userId])
}

model RmhMusicQueueItem {
  id          String   @id @default(cuid())
  roomId      String
  room        RmhMusicRoom @relation(fields: [roomId], references: [id], onDelete: Cascade)
  spotifyUri  String   // spotify:track:xxx
  title       String
  artist      String
  albumArt    String
  durationMs  Int
  addedById   String
  addedBy     User     @relation("RmhMusicQueueItems", fields: [addedById], references: [id])
  addedByName String
  position    Int
  playedAt    DateTime?
  createdAt   DateTime @default(now())
}

model RmhMusicChatMessage {
  id        String   @id @default(cuid())
  roomId    String
  room      RmhMusicRoom @relation(fields: [roomId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation("RmhMusicChatMessages", fields: [userId], references: [id])
  userName  String
  content   String
  createdAt DateTime @default(now())
}
```

### Socket Server (port 7004)

```
server/rmhmusic/
  |-- index.ts          <- HTTP + Socket.io server
  |-- room-manager.ts   <- Room CRUD, join/leave
  |-- sync-engine.ts    <- Playback sync (play/pause/seek/skip)
  |-- queue-manager.ts  <- Queue add/remove/reorder
  |-- chat-handler.ts   <- Chat messages
  |-- auth.ts           <- Socket auth middleware
  |-- types.ts          <- Type definitions
  |-- schemas.ts        <- Zod validation
  |-- config.ts         <- Configuration
  +-- logger.ts         <- Structured logging
```

### Sync Protocol

- Host presses Play -> C2S: `music:play` { trackUri, positionMs } -> Server broadcasts S2C to all members -> Each SDK seeks and plays
- Host presses Pause -> C2S: `music:pause` { positionMs } -> Server broadcasts -> Each SDK pauses
- Host skips -> C2S: `music:skip` -> Server pops next from queue -> Broadcasts `music:play` with next track
- Drift correction: server heartbeat every 5s with { trackUri, positionMs, isPlaying } -> clients auto-seek if drift > 2s

### Room Features

- Create room (name, public/private, optional password)
- Join room (by code or room browser)
- Host controls playback (play/pause/seek/skip)
- Any member can add to queue
- Basic text chat
- Member list with online status
- Host transfer on leave
- 30s reconnection grace period

## Integration Points

### apps.ts Registry

Add RMHMusic to `lib/apps.ts`:
```ts
{ name: "RMH Music", slug: "rmhmusic", description: "Listen to Spotify with friends", icon: Music, badge: "Beta", requiresAuth: true }
```

### package.json Scripts

```json
"rmhmusic-server": "npx tsx watch --include \"server/rmhmusic/**/*\" --include \"server/shared/**/*\" server/rmhmusic/index.ts"
```

Add to `dev`, `build`, and `start` scripts alongside existing servers.

### New Dependencies

- None for Spotify (Web Playback SDK loaded via script tag)
- May need color extraction library for album art palette (or use canvas sampling)

## File Inventory

### New Files

```
app/rmhmusic/page.tsx
app/rmhmusic/layout.tsx
app/rmhmusic/player/page.tsx
app/rmhmusic/[roomId]/page.tsx

components/rmhmusic/Visualizer.tsx
components/rmhmusic/PlayerBar.tsx
components/rmhmusic/SearchPanel.tsx
components/rmhmusic/QueuePanel.tsx
components/rmhmusic/ChatPanel.tsx
components/rmhmusic/MemberList.tsx
components/rmhmusic/RoomBrowser.tsx
components/rmhmusic/SpotifyConnect.tsx
components/rmhmusic/TrackCard.tsx

lib/rmhmusic/store.ts
lib/rmhmusic/socket.ts
lib/rmhmusic/types.ts
lib/rmhmusic/events.ts
lib/rmhmusic/schemas.ts
lib/rmhmusic/constants.ts
lib/rmhmusic/spotify-player.ts
lib/rmhmusic/audio-analyzer.ts
lib/rmhmusic/color-extract.ts

server/rmhmusic/index.ts
server/rmhmusic/room-manager.ts
server/rmhmusic/sync-engine.ts
server/rmhmusic/queue-manager.ts
server/rmhmusic/chat-handler.ts
server/rmhmusic/auth.ts
server/rmhmusic/types.ts
server/rmhmusic/schemas.ts
server/rmhmusic/config.ts
server/rmhmusic/logger.ts

app/api/rmhmusic/spotify/authorize/route.ts
app/api/rmhmusic/spotify/callback/route.ts
app/api/rmhmusic/spotify/refresh/route.ts
app/api/rmhmusic/spotify/search/route.ts
app/api/rmhmusic/spotify/disconnect/route.ts
```

### Modified Files

```
prisma/schema.prisma          (add 4 new models + User relations)
lib/apps.ts                   (add RMHMusic entry)
package.json                  (add rmhmusic-server script to dev/build/start)
.env.example                  (add SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI)
```
