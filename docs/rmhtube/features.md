# RMHTube Feature Roadmap

> **Version**: 1.0
> **Date**: 2025-02-25
> **Status**: Planned

---

## Current State

RMHTube is a fully functional watch-together platform with the following capabilities:

- **Room management** — create/join via 6-char codes, public/private rooms, password protection, room browser, host transfer, member kick
- **Host-authoritative video sync** — play/pause/seek broadcast, 2s heartbeat sync, drift correction (>2s), latency-compensated positioning
- **Multi-platform playback** — YouTube, Twitch, direct files (.mp4, .webm, .ogg, .m3u8, .mpd) via react-player
- **Media queue** — add/remove/reorder, auto-advance, host skip, vote-to-skip (>50% threshold), max 100 items
- **Real-time chat** — 200-message ring buffer, DB persistence, HTML sanitization, 300-char limit
- **Emoji reactions** — 8 emojis with floating animation, broadcast to all members
- **Member presence** — avatars, connection status indicators, host badge, 2-minute reconnection grace period
- **Responsive UI** — desktop 2-column grid, mobile tabbed layout, dark/light themes, custom CSS variables
- **Infrastructure** — Socket.io WebSocket server, Zustand state management, Prisma/PostgreSQL persistence, Zod validation, per-event rate limiting, Better Auth integration

**Tech stack**: Next.js 16 · React 19 · Socket.io 4.8 · Zustand 5 · Prisma 7 · PostgreSQL · TypeScript · Tailwind CSS 4

---

## Phase 1: Chat & Communication

*The chat panel is active during every watch session. These upgrades make conversations richer and more engaging.*

---

### 1.1 Message Replies

**Description**: Users can reply to a specific message, which displays the original as a quoted block above the reply.

**UX Rationale**: In active rooms, conversations overlap. Replies provide context so members know which message someone is responding to — essential for rooms with 5+ people.

**Affected Files**:
- `lib/rmhtube/types.ts` — extend `ChatMessage` interface
- `lib/rmhtube/schemas.ts` — update chat payload schema
- `lib/rmhtube/store.ts` — update `CHAT_MESSAGE` action handler
- `server/rmhtube/chat-handler.ts` — accept and persist `replyToId`
- `components/rmhtube/ChatPanel.tsx` — reply UI (quote block, reply button, compose state)
- `prisma/schema.prisma` — add `replyToId` to `RmhTubeChatMessage`

**Type Changes**:
```ts
// lib/rmhtube/types.ts
interface ChatMessage {
  // ... existing fields
  replyToId: string | null;       // ID of the message being replied to
  replyToContent: string | null;  // Preview snippet of original message
  replyToUserName: string | null; // Original author's name
}
```

**New Events**: None — uses existing `rmhtube:room:chat` with extended payload.

**Implementation Notes**:
- Store `replyToId` as a self-referencing FK on `RmhTubeChatMessage`
- Send `replyToContent` (first 80 chars) and `replyToUserName` inline to avoid extra DB lookups on the client
- Chat compose area shows a dismissible "Replying to [user]" bar when active
- Click on a quoted reply scrolls to the original message (if still in buffer)

**Complexity**: Medium

---

### 1.2 @Mentions

**Description**: Type `@` in chat to trigger an autocomplete dropdown of room members. Mentioned users see their messages highlighted.

**UX Rationale**: Directly addressing someone in a busy chat room avoids confusion. Highlighted mentions ensure the target user notices the message.

**Affected Files**:
- `components/rmhtube/ChatPanel.tsx` — autocomplete dropdown, highlight rendering
- `lib/rmhtube/types.ts` — add `mentions` field to `ChatMessage`
- `lib/rmhtube/schemas.ts` — validate mentions array
- `server/rmhtube/chat-handler.ts` — parse and validate mentioned userIds
- `lib/rmhtube/store.ts` — action handler for mention highlighting

**Type Changes**:
```ts
interface ChatMessage {
  // ... existing fields
  mentions: string[]; // Array of mentioned userIds
}
```

**New Events**: None — extends existing chat payload.

**Implementation Notes**:
- Autocomplete triggers on `@` character, filters members by name prefix
- Mention rendered as a styled `<span>` with accent background
- Messages mentioning `myUserId` get a subtle left-border highlight
- Server-side: validate that all mentioned userIds are current room members
- `@everyone` mention reserved for host/moderator only

**Complexity**: Medium

---

### 1.3 Typing Indicators

**Description**: Shows "[user] is typing..." below the chat input when other members are composing a message.

**UX Rationale**: Typing indicators signal active engagement and reduce message collisions — users wait rather than sending competing messages.

**Affected Files**:
- `lib/rmhtube/events.ts` — new C2S/S2C events
- `components/rmhtube/ChatPanel.tsx` — indicator display and emit logic
- `lib/rmhtube/store.ts` — track typing users in room state

**New Events**:
```
C2S: rmhtube:chat:typing
S2C: rmhtube:chat:typing_indicator
```

**Type Changes**:
```ts
// Add to ClientRoomState
typingUsers: string[]; // userIds currently typing
```

**Implementation Notes**:
- Client emits `chat:typing` on input change, debounced to 1 event per 2 seconds
- Server broadcasts `chat:typing_indicator` to other members with `{ userId, userName }`
- Auto-clear after 3 seconds of no typing events from that user
- Display max 3 names: "Alice, Bob, and 2 others are typing..."
- Rate limit: 30 per minute (reuse reaction rate limit tier)
- Do NOT persist — entirely ephemeral/in-memory

**Complexity**: Low

---

### 1.4 System Messages

**Description**: Inline messages in the chat feed for room events: member join/leave, host transfer, video skip, settings changes.

**UX Rationale**: Currently these events are only reflected in the member list or as toasts. System messages give the chat a sense of narrative — users see the room's activity history without leaving the chat tab (especially on mobile).

**Affected Files**:
- `lib/rmhtube/types.ts` — add `SystemMessage` type
- `lib/rmhtube/store.ts` — inject system messages in action handlers
- `components/rmhtube/ChatPanel.tsx` — render system messages with distinct styling

**Type Changes**:
```ts
interface SystemMessage {
  id: string;
  type: 'system';
  event: 'join' | 'leave' | 'kick' | 'host_transfer' | 'skip' | 'settings_change' | 'now_playing';
  content: string;      // e.g. "Alice joined the room"
  createdAt: number;
}

// ChatMessage union
type ChatEntry = ChatMessage | SystemMessage;
```

**New Events**: None — generated client-side from existing room actions.

**Implementation Notes**:
- Generated inside `applyRoomAction` for `MEMBER_JOINED`, `MEMBER_LEFT`, `MEMBER_KICKED`, `HOST_TRANSFERRED`, `NOW_PLAYING`, `VOTE_SKIP_PASSED`, `SETTINGS_UPDATED`
- Styled as centered, muted text with no avatar — visually distinct from user messages
- Not persisted to DB — reconstructed from action sequence on reconnect
- Togglable via user setting `showSystemMessages` (default: true)

**Complexity**: Low

---

### 1.5 Chat Reactions

**Description**: React to individual chat messages with emoji (heart, thumbs up, laugh, etc.). Reaction counts display below the message.

**UX Rationale**: Lightweight engagement without sending a full message. Reduces chat noise — instead of 5 people replying "lol", they react with 😂.

**Affected Files**:
- `lib/rmhtube/types.ts` — add reactions to `ChatMessage`
- `lib/rmhtube/events.ts` — new C2S/S2C events
- `lib/rmhtube/schemas.ts` — reaction payload schema
- `server/rmhtube/chat-handler.ts` — toggle reaction logic
- `lib/rmhtube/store.ts` — new `CHAT_REACTION` action
- `components/rmhtube/ChatPanel.tsx` — reaction picker and counters

**Type Changes**:
```ts
interface ChatMessage {
  // ... existing fields
  reactions: Record<string, string[]>; // emoji → [userIds]
}
```

**New Events**:
```
C2S: rmhtube:chat:react
S2C: rmhtube:chat:reaction_updated (via room action)
```

**Implementation Notes**:
- Available reactions: 👍 ❤️ 😂 😮 😢 🔥 (subset of existing reaction set)
- Toggle behavior: clicking same emoji removes your reaction
- Display as small pills below message: `😂 3  ❤️ 1`
- Hover/tap a pill to see who reacted
- In-memory only (not persisted to DB) — reactions reset when room closes
- Rate limit: share existing reaction rate limit (30/min)

**Complexity**: Medium

---

### 1.6 GIF Support

**Description**: A GIF picker button in the chat compose area that searches Tenor/Giphy and sends an inline GIF message.

**UX Rationale**: GIFs are the universal language of watch parties. They let users react expressively without words — especially during funny or dramatic moments.

**Affected Files**:
- `lib/rmhtube/types.ts` — extend `ChatMessage` with media type
- `lib/rmhtube/schemas.ts` — validate GIF URL/payload
- `server/rmhtube/chat-handler.ts` — accept GIF messages
- `components/rmhtube/ChatPanel.tsx` — GIF picker modal, inline GIF rendering
- `lib/rmhtube/constants.ts` — GIF provider config

**Type Changes**:
```ts
interface ChatMessage {
  // ... existing fields
  contentType: 'text' | 'gif';
  gifUrl: string | null;       // Tenor/Giphy CDN URL
  gifPreviewUrl: string | null; // Low-res preview for loading
  gifWidth: number | null;
  gifHeight: number | null;
}
```

**New Events**: None — extends existing chat message payload.

**Implementation Notes**:
- Use Tenor API (free tier, 50 req/day per user is sufficient) or Giphy
- GIF picker: search bar + trending grid, lazy-loaded thumbnails
- Render GIFs with `<img>` at max 250px width, aspect-ratio preserved
- GIF messages still count against chat rate limit (30/min)
- Server validates URL is from allowed CDN domains (tenor.com, giphy.com)
- Add `allowGifs` room setting (default: true) — host can disable
- Consider: auto-pause GIFs when >3 visible to reduce CPU usage

**Complexity**: Medium

---

### 1.7 Pinned Messages

**Description**: Host (or moderator) can pin a single message to the top of the chat panel. Useful for rules, links, or context.

**UX Rationale**: New joiners immediately see important info without scrolling. Hosts can set the tone with a welcome message or share relevant links.

**Affected Files**:
- `lib/rmhtube/types.ts` — add `pinnedMessage` to `ClientRoomState`
- `lib/rmhtube/events.ts` — new C2S event
- `lib/rmhtube/schemas.ts` — pin payload schema
- `server/rmhtube/chat-handler.ts` — pin/unpin logic
- `lib/rmhtube/store.ts` — new `MESSAGE_PINNED` / `MESSAGE_UNPINNED` actions
- `components/rmhtube/ChatPanel.tsx` — pinned message banner

**Type Changes**:
```ts
interface ClientRoomState {
  // ... existing fields
  pinnedMessage: ChatMessage | null;
}
```

**New Events**:
```
C2S: rmhtube:chat:pin
```

**Implementation Notes**:
- Only one pinned message at a time (pinning a new one replaces the old)
- Displayed as a sticky banner at the top of the chat panel with a 📌 icon
- Click banner to scroll to the original message
- Host/moderator only — show pin button on hover for eligible users
- Unpin button on the banner itself
- Pinned message stored in server room state and included in state snapshot

**Complexity**: Low

---

### 1.8 Chat Timestamps

**Description**: Display relative timestamps (e.g., "2m ago") next to each message, with option to toggle absolute time.

**UX Rationale**: Currently messages have no visible timestamps. Users can't tell if a message was just sent or is from 20 minutes ago — important when scrolling through history.

**Affected Files**:
- `components/rmhtube/ChatPanel.tsx` — timestamp rendering
- `lib/rmhtube/store.ts` — add `showTimestamps` to user settings

**Type Changes**:
```ts
interface RmhTubeUserSettings {
  // ... existing fields
  showTimestamps: boolean; // default: true
}
```

**New Events**: None — purely client-side.

**Implementation Notes**:
- Use relative format: "just now", "1m", "5m", "1h", then absolute after 24h
- Update every 30 seconds via `setInterval` (not per-render)
- Click/tap a timestamp to toggle between relative and absolute for that message
- Group consecutive messages from the same user within 2 minutes — show timestamp only on first
- Subtle muted color, small font size — should not compete with message content

**Complexity**: Low

---

## Phase 2: Video & Playback Experience

*Core viewing experience improvements that make watching more comfortable and engaging.*

---

### 2.1 Keyboard Shortcuts

**Description**: Global keyboard shortcuts for common playback and UI actions when the room page is focused.

**UX Rationale**: Power users expect keyboard control. Reaching for the mouse during a video breaks immersion — especially in theater/fullscreen mode.

**Affected Files**:
- `app/rmhtube/[roomId]/page.tsx` — global `useEffect` keydown handler
- `components/rmhtube/VideoPlayer.tsx` — expose imperative controls
- `components/rmhtube/HostControls.tsx` — wire to keyboard events
- `lib/rmhtube/constants.ts` — shortcut definitions

**Shortcut Map**:
| Key | Action | Host Only |
|---|---|---|
| `Space` | Toggle play/pause | Yes |
| `←` / `→` | Seek ±10s | Yes |
| `↑` / `↓` | Volume ±10% | No |
| `M` | Toggle mute | No |
| `F` | Toggle fullscreen | No |
| `T` | Toggle theater mode | No |
| `C` | Toggle captions | No |
| `N` | Skip to next in queue | Yes |
| `Shift+?` | Show shortcuts overlay | No |

**New Events**: None — triggers existing socket events.

**Implementation Notes**:
- Disable when a text input/textarea is focused (check `document.activeElement.tagName`)
- Host-only shortcuts silently no-op for non-hosts (no error toast)
- Show a brief toast on first use: "Press Shift+? for keyboard shortcuts"
- Shortcuts overlay as a simple modal with the table above

**Complexity**: Low

---

### 2.2 Theater Mode

**Description**: Toggle to expand the video player to full width, collapsing the sidebar (chat/members) into an overlay or bottom drawer.

**UX Rationale**: Some users want maximum video real estate. Theater mode gives a cinema-like experience while keeping chat accessible via overlay.

**Affected Files**:
- `app/rmhtube/[roomId]/page.tsx` — layout toggle logic
- `app/rmhtube/rmhtube.css` — theater mode styles
- `lib/rmhtube/store.ts` — add `theaterMode` to user settings
- `components/rmhtube/RmhTubeHeader.tsx` — theater mode toggle button

**Type Changes**:
```ts
interface RmhTubeUserSettings {
  // ... existing fields
  theaterMode: boolean; // default: false
}
```

**New Events**: None — purely client-side.

**Implementation Notes**:
- Desktop: video takes full width, sidebar slides into a collapsible right panel (320px → 0px with slide animation)
- Toggle button in header and via `T` keyboard shortcut
- Chat accessible via floating button that opens overlay panel
- Mobile: no change (already full-width)
- Persist preference in localStorage via existing settings persistence
- Smooth CSS transition: `grid-template-columns` transition over 300ms

**Complexity**: Low

---

### 2.3 Synced Playback Speed

**Description**: Host can set playback speed (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x) which syncs to all members.

**UX Rationale**: Educational content benefits from slower speed; rewatching or filler content benefits from faster speed. Everyone should be in sync regardless of speed.

**Affected Files**:
- `lib/rmhtube/types.ts` — already has `playbackRate` in `VideoState`
- `lib/rmhtube/events.ts` — new C2S event
- `lib/rmhtube/schemas.ts` — speed payload schema
- `server/rmhtube/sync-engine.ts` — broadcast speed changes
- `components/rmhtube/HostControls.tsx` — speed selector dropdown
- `components/rmhtube/VideoPlayer.tsx` — apply synced playbackRate

**New Events**:
```
C2S: rmhtube:sync:set_speed
S2C: rmhtube:sync:speed_changed
```

**Implementation Notes**:
- `playbackRate` already exists in `VideoState` but is currently hardcoded to `1`
- Host selects speed from a dropdown in HostControls
- Server updates `room.videoState.playbackRate` and broadcasts
- Non-hosts apply the rate via react-player's `playbackRate` prop
- Drift calculation must account for `playbackRate`: `expectedTime = currentTime + elapsed * playbackRate`
- Show current speed as a small badge on the player: "1.5x"

**Complexity**: Medium

---

### 2.4 Picture-in-Picture

**Description**: Button to pop the video out into a native browser Picture-in-Picture window.

**UX Rationale**: Users can browse other tabs, check the queue, or multitask while keeping the video visible in a floating mini-window — a standard feature on modern video platforms.

**Affected Files**:
- `components/rmhtube/VideoPlayer.tsx` — PiP toggle button
- `components/rmhtube/HostControls.tsx` — PiP button placement

**New Events**: None — uses browser PiP API.

**Implementation Notes**:
- Use `videoElement.requestPictureInPicture()` and `document.exitPictureInPicture()`
- Get the underlying `<video>` element from react-player via `ref.getInternalPlayer()`
- Only available for direct video files and YouTube (where react-player uses a `<video>` element)
- Hide PiP button for Twitch embeds (iframe-based, PiP not supported)
- Check `document.pictureInPictureEnabled` for browser support
- Show tooltip: "Picture in Picture" with keyboard shortcut `P`

**Complexity**: Low

---

### 2.5 Ambient Mode

**Description**: Extract the dominant color from the current video frame and apply a soft, animated glow behind the player container.

**UX Rationale**: Creates an immersive, cinema-like atmosphere. YouTube already does this — it's a visual polish feature that users notice and appreciate. Unique differentiator for RMHTube.

**Affected Files**:
- `components/rmhtube/VideoPlayer.tsx` — color extraction logic
- `app/rmhtube/rmhtube.css` — ambient glow styles
- `lib/rmhtube/store.ts` — `ambientMode` setting

**Type Changes**:
```ts
interface RmhTubeUserSettings {
  // ... existing fields
  ambientMode: boolean; // default: false (opt-in for performance)
}
```

**New Events**: None — purely client-side.

**Implementation Notes**:
- Use a hidden `<canvas>` to sample the video frame every 2 seconds
- Extract dominant color using simple average of center pixels (no heavy library needed)
- Apply as a CSS `box-shadow` with large spread and low opacity on the player container
- Smooth transition between colors: `transition: box-shadow 1s ease`
- Only works with direct video files (canvas access requires same-origin)
- For YouTube: fall back to thumbnail dominant color (extract once on load)
- Disable when `prefers-reduced-motion` is set
- Default OFF — opt-in toggle in settings to avoid performance surprise

**Complexity**: Medium

---

### 2.6 Mini Player

**Description**: On mobile, when the user scrolls down to the chat/queue tabs, the video shrinks to a floating mini player in the corner.

**UX Rationale**: Mobile users currently lose sight of the video when switching to the chat or queue tab. A mini player keeps the video visible during tab navigation.

**Affected Files**:
- `app/rmhtube/[roomId]/page.tsx` — scroll detection, mini player layout
- `app/rmhtube/rmhtube.css` — mini player styles and animation
- `components/rmhtube/VideoPlayer.tsx` — responsive sizing

**New Events**: None — purely client-side.

**Implementation Notes**:
- Mobile only (below 1024px breakpoint)
- Use `IntersectionObserver` on the main player container
- When main player exits viewport, render a fixed 160×90px player in top-right corner
- Tap mini player to scroll back to full player
- Drag to reposition (corner-snapping: TL, TR, BL, BR)
- Close button to dismiss mini player
- CSS: `position: fixed`, `z-index: 50`, `border-radius: 8px`, shadow

**Complexity**: Medium

---

### 2.7 Timestamp Sharing

**Description**: Users can click a "share timestamp" button to post the current playback time as a clickable link in chat (e.g., "Check out 2:34"). Clicking the link seeks to that timestamp.

**UX Rationale**: When discussing a specific moment in the video, sharing a timestamp is far more precise than saying "that part a few minutes ago." Common in YouTube comments, novel in watch-together contexts.

**Affected Files**:
- `components/rmhtube/ChatPanel.tsx` — timestamp link rendering, click-to-seek
- `components/rmhtube/HostControls.tsx` — "share timestamp" button
- `lib/rmhtube/types.ts` — chat message type extension

**Type Changes**:
```ts
interface ChatMessage {
  // ... existing fields
  timestamp: number | null; // Video timestamp in seconds (if shared)
}
```

**New Events**: None — extends existing chat message.

**Implementation Notes**:
- "Share timestamp" button next to chat input (clock icon)
- Inserts `[2:34]` formatted text into chat message
- Server stores as `timestamp` field (numeric seconds)
- Client renders as a clickable pill: `⏱ 2:34`
- Non-hosts: clicking seeks only if host has enabled "allow member seek" (future setting) — otherwise just highlights
- Hosts: clicking always seeks
- Parse `[MM:SS]` or `[HH:MM:SS]` patterns in message content as auto-links

**Complexity**: Low

---

### 2.8 Video Chapters

**Description**: For YouTube videos, display chapter markers on the progress bar and as a navigable list.

**UX Rationale**: Long videos (podcasts, lectures, movies) benefit from chapter navigation. Users can jump to specific sections without scrubbing blindly.

**Affected Files**:
- `components/rmhtube/VideoPlayer.tsx` — chapter markers on progress bar
- `components/rmhtube/HostControls.tsx` — chapter list dropdown
- `lib/rmhtube/types.ts` — chapter data type
- `lib/rmhtube/utils.ts` — YouTube API chapter extraction

**Type Changes**:
```ts
interface VideoChapter {
  title: string;
  startTime: number; // seconds
}

interface ClientQueueItem {
  // ... existing fields
  chapters: VideoChapter[] | null;
}
```

**New Events**: None — fetched client-side from YouTube API.

**Implementation Notes**:
- Fetch chapters from YouTube oEmbed or Data API v3 when a YouTube video loads
- Display as colored segments on the progress bar (different shade per chapter)
- Hover over progress bar shows chapter title tooltip
- Chapter list as a dropdown from HostControls (host can click to seek)
- Only available for YouTube videos that have chapters defined
- Cache chapter data in queue item to avoid repeated API calls
- Fallback: if no chapters available, hide the UI entirely

**Complexity**: Medium

---

## Phase 3: Queue & Media Management

*Better content curation, discovery, and queue interaction.*

---

### 3.1 Drag-and-Drop Reorder

**Description**: Replace the current queue reorder mechanism with visual drag-and-drop using smooth animations.

**UX Rationale**: Drag-and-drop is the intuitive standard for list reordering. It's more discoverable and satisfying than up/down buttons or abstract reorder controls.

**Affected Files**:
- `components/rmhtube/MediaQueue.tsx` — DnD wrapper and handlers
- `components/rmhtube/QueueItem.tsx` — drag handle, drop indicators
- `lib/rmhtube/store.ts` — optimistic reorder update

**New Events**: None — uses existing `rmhtube:queue:reorder` with new position array.

**Implementation Notes**:
- Use `@dnd-kit/core` + `@dnd-kit/sortable` (lightweight, accessible, touch-friendly)
- Drag handle icon on each queue item (grip dots)
- Drop placeholder with accent border during drag
- Optimistic update: reorder locally first, then emit to server
- Revert on server error
- Touch support: long-press to initiate drag on mobile
- Host only (or if `allowMemberQueue` is enabled)
- Keyboard accessible: select item, use arrow keys to move, Enter to confirm

**Complexity**: Medium

---

### 3.2 YouTube Playlist Import

**Description**: Paste a YouTube playlist URL to bulk-add all videos to the queue.

**UX Rationale**: Manually adding videos one by one is tedious for movie nights or music sessions. Playlist import lets hosts prepare content in advance using YouTube's familiar interface.

**Affected Files**:
- `components/rmhtube/AddMediaModal.tsx` — playlist URL detection and import UI
- `lib/rmhtube/utils.ts` — playlist URL parsing, YouTube API integration
- `lib/rmhtube/events.ts` — new C2S event
- `lib/rmhtube/schemas.ts` — playlist import payload
- `server/rmhtube/media-queue.ts` — bulk-add logic with queue limit check

**New Events**:
```
C2S: rmhtube:queue:import_playlist
S2C: (uses existing rmhtube:queue:updated)
```

**Implementation Notes**:
- Detect YouTube playlist URLs: `youtube.com/playlist?list=` pattern
- Use YouTube Data API v3 `playlistItems.list` to fetch video titles, durations, thumbnails
- Show preview list before importing with checkboxes (select/deselect individual videos)
- Import up to 50 videos at once (respect existing 100-item queue limit)
- Progress indicator during import: "Adding 12/50 videos..."
- Server-side: batch insert with position calculation
- API key stored server-side (env var), proxied through a Next.js API route
- Rate limit: 5 playlist imports per hour per user

**Complexity**: Medium

---

### 3.3 Queue Voting

**Description**: Members can upvote queue items. Items with more votes bubble up in the queue order (optional mode).

**UX Rationale**: In democratic watch parties, letting everyone influence what plays next increases engagement and fairness — rather than pure FIFO or host-only control.

**Affected Files**:
- `lib/rmhtube/types.ts` — add votes to `ClientQueueItem`
- `lib/rmhtube/events.ts` — new C2S/S2C events
- `lib/rmhtube/schemas.ts` — vote payload
- `server/rmhtube/media-queue.ts` — vote tracking, optional auto-sort
- `components/rmhtube/QueueItem.tsx` — vote button and count
- `components/rmhtube/RoomSettings.tsx` — queue voting toggle

**Type Changes**:
```ts
interface ClientQueueItem {
  // ... existing fields
  votes: number;
  votedByMe: boolean;
}

interface RoomSettings {
  // ... existing fields
  queueVoting: boolean; // default: false
  autoSortByVotes: boolean; // default: false
}
```

**New Events**:
```
C2S: rmhtube:queue:vote
S2C: rmhtube:queue:vote_updated (via room action)
```

**Implementation Notes**:
- Toggle vote (click again to remove) — one vote per user per item
- Display as upvote arrow + count on each queue item
- `autoSortByVotes`: when enabled, queue auto-reorders by vote count after each vote
- When disabled, votes are visible but don't affect order (informational)
- Host can enable/disable in room settings
- Votes stored in-memory (tied to room lifecycle, not persisted)
- Rate limit: 20 votes per minute

**Complexity**: Medium

---

### 3.4 Queue Shuffle

**Description**: One-click button to randomize the order of remaining (unplayed) queue items.

**UX Rationale**: Music sessions and casual movie nights benefit from randomized order — keeps things fresh and removes bias toward whoever added items first.

**Affected Files**:
- `components/rmhtube/MediaQueue.tsx` — shuffle button
- `lib/rmhtube/events.ts` — new C2S event
- `server/rmhtube/media-queue.ts` — Fisher-Yates shuffle on remaining items

**New Events**:
```
C2S: rmhtube:queue:shuffle
```

**Implementation Notes**:
- Shuffles only items after the currently playing item
- Uses Fisher-Yates algorithm for unbiased randomization
- Host-only action (or moderator)
- Broadcasts updated queue via existing `rmhtube:queue:updated`
- Button icon: shuffle arrows, placed in queue header
- Confirmation dialog: "Shuffle N remaining items?"

**Complexity**: Low

---

### 3.5 Queue Loop

**Description**: Toggle to loop the entire queue — when the last item finishes, playback restarts from the first item.

**UX Rationale**: Perfect for background music playlists or rewatching a series of short videos during a hangout.

**Affected Files**:
- `lib/rmhtube/types.ts` — add `loopQueue` to `RoomSettings`
- `server/rmhtube/media-queue.ts` — loop logic in auto-advance
- `components/rmhtube/MediaQueue.tsx` — loop toggle button
- `components/rmhtube/RoomSettings.tsx` — loop setting

**Type Changes**:
```ts
interface RoomSettings {
  // ... existing fields
  loopQueue: boolean; // default: false
}
```

**New Events**: None — uses existing `rmhtube:room:update_settings`.

**Implementation Notes**:
- When last item ends and `loopQueue` is true, reset `currentIndex` to 0 and play first item
- Toggle button in queue header with loop icon (circular arrows)
- Visual indicator when active: highlighted icon or badge
- Works with both `autoPlay: true` and manual skip

**Complexity**: Low

---

### 3.6 Save as Playlist

**Description**: Save the current queue (or selected items) as a named playlist to the user's profile for reuse in future rooms.

**UX Rationale**: Hosts who organize regular watch parties shouldn't rebuild their queue every time. Saved playlists are a major time-saver and encourage return usage.

**Affected Files**:
- `prisma/schema.prisma` — new `RmhTubePlaylist` and `RmhTubePlaylistItem` models
- `lib/rmhtube/types.ts` — playlist types
- `app/rmhtube/page.tsx` — playlist list on landing page
- `components/rmhtube/MediaQueue.tsx` — "Save as Playlist" button
- New: `components/rmhtube/PlaylistManager.tsx` — playlist CRUD UI
- New: API route `app/api/rmhtube/playlists/route.ts` — REST endpoints

**Type Changes**:
```ts
interface Playlist {
  id: string;
  name: string;
  userId: string;
  items: PlaylistItem[];
  createdAt: number;
  updatedAt: number;
}

interface PlaylistItem {
  url: string;
  mediaType: MediaType;
  title: string;
  duration: number | null;
  thumbnailUrl: string | null;
}
```

**New DB Models**:
```prisma
model RmhTubePlaylist {
  id        String   @id @default(cuid())
  name      String
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  items     RmhTubePlaylistItem[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model RmhTubePlaylistItem {
  id           String   @id @default(cuid())
  playlistId   String
  playlist     RmhTubePlaylist @relation(fields: [playlistId], references: [id], onDelete: Cascade)
  url          String
  mediaType    String
  title        String
  duration     Int?
  thumbnailUrl String?
  position     Int
}
```

**Implementation Notes**:
- "Save as Playlist" button in queue header → name input modal
- "Load Playlist" button on add-media modal → select from saved playlists
- REST API for CRUD (not WebSocket — playlists are user-scoped, not room-scoped)
- Max 20 playlists per user, 100 items per playlist
- Share playlists: generate a share code (similar to room codes)

**Complexity**: Medium

---

### 3.7 Total Queue Duration

**Description**: Display the total estimated remaining playback time for all queued items.

**UX Rationale**: "How long until my video plays?" and "When will we finish?" are common questions. A simple duration display answers both.

**Affected Files**:
- `components/rmhtube/MediaQueue.tsx` — duration calculation and display

**New Events**: None — calculated client-side from existing queue data.

**Implementation Notes**:
- Sum `duration` of all items from `currentIndex + 1` to end of queue
- Subtract elapsed time of current item
- Display in queue header: "3h 24m remaining"
- Handle null durations (unknown): show "3h 24m+ remaining" with tooltip explaining some durations are unknown
- Update live as time progresses (recalculate every 10 seconds)
- Format: "Xh Ym" for >1 hour, "Xm" for <1 hour, "< 1m" for very short

**Complexity**: Low

---

### 3.8 Media Search

**Description**: Search YouTube directly from within the add-media modal instead of copying URLs from another tab.

**UX Rationale**: Switching between RMHTube and YouTube to find and copy URLs is friction. In-app search keeps users in the experience and speeds up content discovery.

**Affected Files**:
- `components/rmhtube/AddMediaModal.tsx` — search UI tab
- New: API route `app/api/rmhtube/search/route.ts` — YouTube search proxy
- `lib/rmhtube/utils.ts` — search result type definitions

**Type Changes**:
```ts
interface SearchResult {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  duration: string; // ISO 8601 format
  viewCount: number;
}
```

**New Events**: None — uses REST API, not WebSocket.

**Implementation Notes**:
- Add a "Search" tab alongside the existing URL input in AddMediaModal
- Use YouTube Data API v3 `search.list` + `videos.list` (for duration)
- Proxy through Next.js API route (API key stays server-side)
- Display results as a scrollable grid: thumbnail, title, channel, duration
- Click result → adds to queue (same flow as URL submission)
- Debounced search (300ms) to minimize API calls
- Cache results for 5 minutes
- YouTube API quota: 10,000 units/day (search costs 100 units each = 100 searches/day)

**Complexity**: Medium

---

### 3.9 Queue History

**Description**: A collapsible "Previously Played" section below the active queue showing items that have already been played.

**UX Rationale**: Users who join late can see what they missed. Anyone can replay a previous item — useful for "play that again" moments.

**Affected Files**:
- `lib/rmhtube/types.ts` — add `playedItems` to `ClientRoomState`
- `lib/rmhtube/store.ts` — track played items in `NOW_PLAYING` handler
- `components/rmhtube/MediaQueue.tsx` — history section UI
- `server/rmhtube/media-queue.ts` — maintain played history in room state

**Type Changes**:
```ts
interface ClientRoomState {
  // ... existing fields
  playedItems: ClientQueueItem[];
}
```

**New Events**: None — populated from existing `NOW_PLAYING` actions.

**Implementation Notes**:
- When `NOW_PLAYING` fires, move the previous `currentItem` into `playedItems` array
- Display as a collapsible section: "Previously Played (5)" with dimmed styling
- Each played item has a "Replay" button → re-adds to queue at next position
- Host only for replay (or if `allowMemberQueue` is enabled)
- Limit history to last 50 items in memory
- Included in state snapshot for late joiners

**Complexity**: Low

---

## Phase 4: Room & Social Features

*Community building, moderation, and social engagement.*

---

### 4.1 Co-Host / Moderator Role

**Description**: Host can promote members to "moderator" — giving them host-like abilities (manage queue, kick members) without full host authority.

**UX Rationale**: In larger rooms, the host can't manage everything alone. Moderators help maintain order — standard in any community platform (Discord, Twitch, etc.).

**Affected Files**:
- `lib/rmhtube/types.ts` — add role to `ClientMemberInfo`
- `lib/rmhtube/events.ts` — new C2S event
- `lib/rmhtube/schemas.ts` — promote/demote payload
- `server/rmhtube/room-manager.ts` — role management, permission checks
- `lib/rmhtube/store.ts` — new `MEMBER_PROMOTED` / `MEMBER_DEMOTED` actions
- `components/rmhtube/MemberList.tsx` — moderator badge, promote/demote buttons

**Type Changes**:
```ts
interface ClientMemberInfo {
  // ... existing fields
  role: 'host' | 'moderator' | 'member';
}
```

**New Events**:
```
C2S: rmhtube:room:set_role
```

**Implementation Notes**:
- Three roles: `host` (full control), `moderator` (queue + kick + pin), `member` (normal)
- Host-only action to promote/demote
- Moderator permissions: add/remove/reorder queue, kick members, pin messages, skip
- Moderators CANNOT: change room settings, transfer host, promote others, kick other moderators
- Badge: crown for host, shield for moderator
- Stored in server room state, included in snapshot
- Max moderators: 5 per room

**Complexity**: High

---

### 4.2 Ban List

**Description**: Host/moderator can ban a user from the room. Banned users cannot rejoin until unbanned.

**UX Rationale**: Kick only removes someone temporarily — they can rejoin immediately. Bans provide actual enforcement for disruptive users.

**Affected Files**:
- `lib/rmhtube/types.ts` — ban types
- `lib/rmhtube/events.ts` — new C2S events
- `lib/rmhtube/schemas.ts` — ban/unban payload
- `server/rmhtube/room-manager.ts` — ban check on join, ban management
- `components/rmhtube/MemberList.tsx` — ban button
- New: `components/rmhtube/BanListModal.tsx` — manage banned users

**Type Changes**:
```ts
interface BannedUser {
  userId: string;
  userName: string;
  bannedAt: number;
  bannedBy: string;
  reason: string | null;
}

interface ClientRoomState {
  // ... existing fields
  bannedUsers: BannedUser[]; // Only visible to host/moderators
}
```

**New Events**:
```
C2S: rmhtube:room:ban
C2S: rmhtube:room:unban
```

**Implementation Notes**:
- Ban triggers immediate disconnect + kick
- Banned users receive `ROOM_KICKED` with `{ reason: 'banned' }`
- On join attempt, server checks ban list before allowing entry
- Ban list stored in-memory per room (not persisted — bans last until room closes)
- Optional: persist bans to DB for recurring rooms (future enhancement)
- Host sees a "Banned Users" section in room settings modal
- Ban reason is optional (free text, max 100 chars)

**Complexity**: Medium

---

### 4.3 Invite Links with Expiry

**Description**: Generate shareable invite links that expire after a set time or number of uses.

**UX Rationale**: Room codes don't expire and can be shared freely. Invite links give hosts control over who can join and when — important for private watch parties.

**Affected Files**:
- `lib/rmhtube/types.ts` — invite link types
- `lib/rmhtube/events.ts` — new C2S event
- `lib/rmhtube/schemas.ts` — invite creation payload
- `server/rmhtube/room-manager.ts` — invite generation, validation on join
- `components/rmhtube/RoomCodeDisplay.tsx` — "Create Invite" button
- New: `components/rmhtube/InviteLinkModal.tsx` — invite config and sharing

**Type Changes**:
```ts
interface InviteLink {
  code: string;       // Short unique code
  roomId: string;
  createdBy: string;
  expiresAt: number;  // Timestamp
  maxUses: number;    // 0 = unlimited
  useCount: number;
}
```

**New Events**:
```
C2S: rmhtube:room:create_invite
S2C: rmhtube:room:invite_created
```

**Implementation Notes**:
- Generate 8-character alphanumeric invite codes (nanoid)
- Join URL format: `/rmhtube/join/{inviteCode}`
- Configuration: expiry (1h, 6h, 24h, 7d, never), max uses (1, 5, 10, 25, unlimited)
- Server validates invite on join: check expiry and use count
- Expired/exhausted invites return clear error messages
- Host can revoke active invites
- Max 10 active invites per room
- Stored in-memory (tied to room lifecycle)

**Complexity**: Medium

---

### 4.4 Room Scheduling

**Description**: Create a room scheduled for a future date/time. Invitees see a countdown and receive a notification when it starts.

**UX Rationale**: Watch parties are social events — they work better when planned in advance. Scheduling lets the host build anticipation and ensure everyone shows up at the same time.

**Affected Files**:
- `prisma/schema.prisma` — add scheduling fields to `RmhTubeRoom`
- `app/rmhtube/page.tsx` — scheduled rooms list, scheduling UI
- New: `components/rmhtube/ScheduleRoomModal.tsx` — schedule form
- `server/rmhtube/room-manager.ts` — scheduled room creation and activation
- `lib/rmhtube/types.ts` — scheduled room types

**Type Changes**:
```ts
interface ScheduledRoom {
  roomId: string;
  name: string;
  hostName: string;
  scheduledFor: number; // Timestamp
  description: string | null;
  preloadedQueue: PlaylistItem[]; // Videos to auto-add when room opens
}

interface PublicRoomInfo {
  // ... existing fields
  scheduledFor: number | null;
}
```

**New DB Fields**:
```prisma
model RmhTubeRoom {
  // ... existing fields
  scheduledFor DateTime?
  description  String?
}
```

**Implementation Notes**:
- Schedule form: name, date/time picker, optional description, optional playlist preload
- Room appears in "Upcoming" section on landing page with countdown timer
- Room auto-opens at scheduled time (server cron or on-demand creation)
- Host can open early or cancel
- Share scheduled room via link: `/rmhtube/scheduled/{roomId}`
- Pre-load queue from a saved playlist when room activates
- Browser notification when room goes live (requires notification permission)
- Max 5 scheduled rooms per user

**Complexity**: High

---

### 4.5 Room History

**Description**: Landing page shows a list of previously joined rooms with host name, date, and "rejoin" option (if room is still active).

**UX Rationale**: Users want to quickly return to rooms they've visited — especially recurring watch party rooms. Currently there's no way to find a room you left.

**Affected Files**:
- `app/rmhtube/page.tsx` — history section UI
- `lib/rmhtube/store.ts` — persist room history in localStorage
- `lib/rmhtube/types.ts` — room history types

**Type Changes**:
```ts
interface RoomHistoryEntry {
  roomId: string;
  roomName: string | null;
  hostName: string;
  lastVisited: number;
  videoCount: number; // How many videos were watched
}

interface RmhTubeUserSettings {
  // ... existing fields
  roomHistory: RoomHistoryEntry[];
}
```

**New Events**: None — populated from client-side tracking.

**Implementation Notes**:
- On room join, save entry to localStorage
- On leave, update `lastVisited` and `videoCount`
- Display as a card list: room name, host, "2 days ago", "Watched 5 videos"
- "Rejoin" button → attempt to join with existing room code
- Show "Room closed" badge if room no longer exists (check via room browse)
- Max 20 entries, oldest auto-purged
- Clear history button

**Complexity**: Medium

---

### 4.6 Room Favorites

**Description**: Bookmark public rooms for quick access from the landing page.

**UX Rationale**: Public rooms with regular hosts (e.g., a weekly movie night) benefit from favorites — users don't need to search or remember room codes.

**Affected Files**:
- `app/rmhtube/page.tsx` — favorites section, favorite toggle on room cards
- `lib/rmhtube/store.ts` — persist favorites in localStorage

**Type Changes**:
```ts
interface RmhTubeUserSettings {
  // ... existing fields
  favoriteRooms: string[]; // Array of room IDs
}
```

**New Events**: None — client-side only.

**Implementation Notes**:
- Star/heart icon on public room cards in the browser
- Favorites section at top of landing page (above active rooms)
- Show room status: "Active (3 watching)" or "Offline"
- Remove favorite if room has been closed for >30 days
- Max 10 favorites
- Synced via localStorage (future: persist to DB for cross-device)

**Complexity**: Low

---

### 4.7 User Presence Status

**Description**: Members can set a status (Watching, AFK, BRB) shown as a badge in the member list.

**UX Rationale**: Knowing who's actually watching vs. who stepped away helps hosts decide when to pause or continue. Simple presence info improves the social experience.

**Affected Files**:
- `lib/rmhtube/types.ts` — add status to `ClientMemberInfo`
- `lib/rmhtube/events.ts` — new C2S event
- `lib/rmhtube/schemas.ts` — status payload
- `server/rmhtube/room-manager.ts` — track member status
- `lib/rmhtube/store.ts` — new `MEMBER_STATUS_CHANGED` action
- `components/rmhtube/MemberList.tsx` — status badge display
- `components/rmhtube/RmhTubeHeader.tsx` — status selector dropdown

**Type Changes**:
```ts
type UserPresenceStatus = 'watching' | 'afk' | 'brb';

interface ClientMemberInfo {
  // ... existing fields
  status: UserPresenceStatus;
}
```

**New Events**:
```
C2S: rmhtube:room:set_status
S2C: (via room action MEMBER_STATUS_CHANGED)
```

**Implementation Notes**:
- Status selector in header: three options with icons (eye, clock, coffee cup)
- Default status: `watching` on join
- Auto-AFK: if no interaction for 10 minutes, status changes to `afk` automatically
- Auto-restore to `watching` on any interaction (click, keypress, scroll)
- Status shown as colored dot + text in member list
- Watching: green, AFK: yellow, BRB: orange

**Complexity**: Low

---

### 4.8 Watch Stats

**Description**: Track and display personal viewing stats: total watch time, videos watched, rooms created/joined.

**UX Rationale**: Stats gamify the experience and give users a sense of engagement. "You've watched 48 hours together!" creates emotional connection to the platform. Unique differentiator.

**Affected Files**:
- `prisma/schema.prisma` — new `RmhTubeUserStats` model
- `app/rmhtube/page.tsx` — stats display on landing page
- New: API route `app/api/rmhtube/stats/route.ts` — stats aggregation
- `server/rmhtube/room-manager.ts` — update stats on leave

**Type Changes**:
```ts
interface UserWatchStats {
  totalWatchTimeMinutes: number;
  videosWatched: number;
  roomsCreated: number;
  roomsJoined: number;
  messagessSent: number;
  reactionsUsed: number;
}
```

**New DB Model**:
```prisma
model RmhTubeUserStats {
  userId              String   @id
  user                User     @relation(fields: [userId], references: [id])
  totalWatchTimeMinutes Int    @default(0)
  videosWatched       Int      @default(0)
  roomsCreated        Int      @default(0)
  roomsJoined         Int      @default(0)
  messagesSent        Int      @default(0)
  reactionsUsed       Int      @default(0)
  updatedAt           DateTime @updatedAt
}
```

**Implementation Notes**:
- Server updates stats on room leave: calculate watch time from join/leave timestamps
- Increment `videosWatched` on each `NOW_PLAYING` event where user was present
- Display on landing page as a compact card: "48h watched · 234 videos · 15 rooms"
- Fun milestones: "You've watched a full day!" (24h), "Movie marathon!" (100 videos)
- Stats are private — only visible to the user themselves
- Use DB upsert for atomic updates

**Complexity**: Medium

---

## Phase 5: Accessibility & Polish

*Inclusive design, refined UX, and quality-of-life polish.*

---

### 5.1 Keyboard Navigation

**Description**: Full keyboard navigation throughout the RMHTube UI — tab order, focus rings, arrow-key menus.

**UX Rationale**: Keyboard users (power users, assistive tech users, accessibility compliance) need to navigate the entire interface without a mouse.

**Affected Files**:
- `app/rmhtube/[roomId]/page.tsx` — focus management
- `components/rmhtube/ChatPanel.tsx` — keyboard nav in chat
- `components/rmhtube/MediaQueue.tsx` — keyboard nav in queue
- `components/rmhtube/MemberList.tsx` — keyboard nav in members
- `app/rmhtube/rmhtube.css` — focus ring styles

**Implementation Notes**:
- Define logical tab order: Header → Player → Controls → Queue → Chat → Members
- Custom focus ring style: 2px accent outline with 2px offset
- Arrow keys navigate within lists (queue items, member list, chat messages)
- `Escape` closes modals and deselects
- `Enter` activates buttons and links
- Skip link: "Skip to video player" at top of page
- Focus trap in modals (settings, add media, etc.)
- Test with Tab key + screen reader

**Complexity**: Medium

---

### 5.2 Screen Reader Support

**Description**: ARIA labels, live regions, and semantic HTML for screen reader compatibility.

**UX Rationale**: Visually impaired users should be able to participate in watch parties. Real-time events (chat messages, member changes, reactions) need to be announced.

**Affected Files**:
- `components/rmhtube/ChatPanel.tsx` — `aria-live` region, message roles
- `components/rmhtube/MemberList.tsx` — member list as `role="list"`, status announcements
- `components/rmhtube/MediaQueue.tsx` — queue as `role="list"`, drag-and-drop announcements
- `components/rmhtube/VideoPlayer.tsx` — player state announcements
- `components/rmhtube/ReactionOverlay.tsx` — `aria-live="polite"` for reactions
- `components/rmhtube/HostControls.tsx` — button labels

**Implementation Notes**:
- Chat: `role="log"` + `aria-live="polite"` for new messages
- Member join/leave: `aria-live="polite"` announcement
- Video state changes: "Video paused", "Now playing: [title]"
- Queue changes: "Video added to queue", "Queue reordered"
- All icon-only buttons get `aria-label`
- Use semantic HTML: `<nav>`, `<main>`, `<aside>`, `<article>`
- Test with VoiceOver (macOS) and NVDA (Windows)

**Complexity**: Medium

---

### 5.3 High Contrast Mode

**Description**: A high-contrast theme variant that meets WCAG AAA contrast ratios (7:1 for normal text, 4.5:1 for large text).

**UX Rationale**: Users with low vision or in bright environments need higher contrast. The current dark theme has some muted text that falls below WCAG AA.

**Affected Files**:
- `app/rmhtube/rmhtube.css` — new `[data-theme="high-contrast"]` CSS variables
- `lib/rmhtube/store.ts` — extend theme setting
- `components/rmhtube/RoomSettings.tsx` — theme selector

**Type Changes**:
```ts
interface RmhTubeUserSettings {
  // ... existing
  theme: 'dark' | 'light' | 'high-contrast';
}
```

**Implementation Notes**:
- Based on dark theme but with increased text/background contrast
- Text: pure white `#FFFFFF` on backgrounds no lighter than `#1a1a1a`
- Borders: visible on all interactive elements (not just focus)
- Muted text bumped from `#9a9ba4` to `#d0d0d6`
- Focus rings: 3px solid white
- Test all color combinations with contrast checker tool

**Complexity**: Low

---

### 5.4 Reduced Motion

**Description**: Respect the `prefers-reduced-motion` media query — disable animations, reaction floats, and transitions.

**UX Rationale**: Users with vestibular disorders or motion sensitivities experience discomfort from animations. This is also a WCAG 2.1 Level AAA requirement.

**Affected Files**:
- `app/rmhtube/rmhtube.css` — media query overrides
- `components/rmhtube/ReactionOverlay.tsx` — conditional animation
- `components/rmhtube/ToastContainer.tsx` — conditional animation

**Implementation Notes**:
- Add `@media (prefers-reduced-motion: reduce)` block in rmhtube.css
- Disable: reaction float animation, toast slide-in, theme transitions, ambient mode glow
- Replace with: instant show/hide, no transform, static reaction display
- Reaction emojis show as a brief inline indicator instead of floating
- Toasts appear instantly without slide animation
- Also respect a manual toggle in settings (overrides system preference)

**Complexity**: Low

---

### 5.5 Onboarding Tour

**Description**: First-visit guided walkthrough highlighting key features: player, queue, chat, reactions, room settings.

**UX Rationale**: New users may not discover features like vote-skip, reactions, or keyboard shortcuts. A brief tour increases feature adoption and reduces confusion.

**Affected Files**:
- New: `components/rmhtube/OnboardingTour.tsx` — tour component
- `app/rmhtube/[roomId]/page.tsx` — mount tour on first visit
- `lib/rmhtube/store.ts` — track `hasSeenTour` in settings

**Type Changes**:
```ts
interface RmhTubeUserSettings {
  // ... existing fields
  hasSeenTour: boolean; // default: false
}
```

**Implementation Notes**:
- 5-step tour: (1) Video Player, (2) Host Controls, (3) Queue, (4) Chat & Reactions, (5) Room Settings
- Each step: spotlight overlay on target element, tooltip with description, next/skip buttons
- No external library — simple overlay div with absolute positioning relative to target
- Triggered on first room join (not landing page)
- "Show tour again" option in settings
- Steps are skippable, dismissible, and keyboard-navigable
- Mobile: simplified tour (3 steps, focusing on tab navigation)

**Complexity**: Medium

---

### 5.6 Loading Skeletons

**Description**: Shimmer placeholder UI shown during room loading, queue loading, and initial chat hydration.

**UX Rationale**: Currently, elements pop in abruptly. Skeleton screens reduce perceived load time and prevent layout shift — a standard UX pattern.

**Affected Files**:
- `app/rmhtube/[roomId]/page.tsx` — room loading state
- `components/rmhtube/ChatPanel.tsx` — chat skeleton
- `components/rmhtube/MediaQueue.tsx` — queue skeleton
- `components/rmhtube/MemberList.tsx` — member list skeleton
- `app/rmhtube/rmhtube.css` — skeleton animation styles

**Implementation Notes**:
- Skeleton components mirror the shape of actual content (rounded rects for avatars, lines for text)
- CSS shimmer animation: `@keyframes shimmer` with gradient slide
- Show skeletons when `connectionStatus === 'connecting'` or `room === null`
- Skeleton for: player area (dark rectangle), queue items (3 placeholder rows), chat messages (5 placeholder bubbles), member list (4 placeholder rows)
- Transition from skeleton → real content with fade (150ms)
- Respect `prefers-reduced-motion`: show static gray blocks instead of shimmer

**Complexity**: Low

---

### 5.7 Desktop Notifications

**Description**: Browser push notifications for chat messages and room events when the RMHTube tab is not focused.

**UX Rationale**: During a watch party, users may multitask in other tabs. Notifications ensure they don't miss chat messages or important events (video changed, they were mentioned).

**Affected Files**:
- `components/rmhtube/ChatPanel.tsx` — notification trigger on new messages
- `app/rmhtube/[roomId]/page.tsx` — notification permission request
- `lib/rmhtube/store.ts` — notification settings

**Type Changes**:
```ts
interface RmhTubeUserSettings {
  // ... existing fields
  desktopNotifications: boolean; // default: false
  notifyOnMention: boolean;     // default: true
  notifyOnAllMessages: boolean; // default: false
}
```

**Implementation Notes**:
- Use `Notification` API (no service worker needed for basic notifications)
- Request permission on first enable in settings (not automatically)
- Trigger when: `document.hidden === true` AND new chat message arrives
- Notification content: "[userName]: [message preview]" with room name as title
- Click notification → focus the RMHTube tab
- @Mention notifications always fire (if enabled), regular messages only if `notifyOnAllMessages`
- Auto-dismiss after 5 seconds
- Don't notify on system messages or own messages

**Complexity**: Low

---

### 5.8 Sound Effects

**Description**: Optional audio cues for events: member join, member leave, new chat message, reaction, video start.

**UX Rationale**: Audio feedback makes the room feel alive — especially for background watching where the user isn't looking at the screen. Common in Discord, Slack, and other collaborative tools.

**Affected Files**:
- `lib/rmhtube/store.ts` — sound settings
- `app/rmhtube/[roomId]/page.tsx` — sound playback on events
- New: `public/audio/rmhtube/` — sound effect files

**Type Changes**:
```ts
interface RmhTubeUserSettings {
  // ... existing fields
  soundEffects: boolean;   // default: false
  soundVolume: number;     // 0-1, default: 0.5
}
```

**Implementation Notes**:
- Sound files: short (<500ms), subtle, non-intrusive
- Events: `join.mp3`, `leave.mp3`, `message.mp3`, `reaction.mp3`, `now-playing.mp3`
- Use `Audio` API (simple `new Audio(url).play()`)
- Preload on room mount for instant playback
- Respect user's `soundEffects` toggle and `soundVolume` level
- Don't play if tab is focused AND user is actively typing (avoid message send noise)
- Sound volume independent from video player volume

**Complexity**: Low

---

### 5.9 Layout Density

**Description**: Three layout density options: Compact, Comfortable (default), and Spacious — controlling padding, font sizes, and spacing.

**UX Rationale**: Users on small screens want compact layouts to see more content. Users on large monitors prefer spacious layouts for readability. One size doesn't fit all.

**Affected Files**:
- `app/rmhtube/rmhtube.css` — density CSS variables
- `lib/rmhtube/store.ts` — density setting
- `components/rmhtube/RoomSettings.tsx` — density selector (or in user settings)

**Type Changes**:
```ts
interface RmhTubeUserSettings {
  // ... existing fields
  layoutDensity: 'compact' | 'comfortable' | 'spacious'; // default: 'comfortable'
}
```

**Implementation Notes**:
- CSS variables for spacing: `--rmhtube-density-gap`, `--rmhtube-density-padding`, `--rmhtube-density-font`
- Compact: 4px gaps, 6px padding, 13px font
- Comfortable: 8px gaps, 10px padding, 14px font (current default)
- Spacious: 12px gaps, 16px padding, 15px font
- Applied via `data-density` attribute on shell element
- Affects: chat messages, queue items, member list, controls, modals

**Complexity**: Low

---

### 5.10 Custom Reaction Set

**Description**: Host can configure which emojis are available in the reaction picker for their room.

**UX Rationale**: Different rooms have different vibes. A movie night might want 🍿🎬👀, while a music session wants 🎵🔥💃. Custom reactions make the room feel curated. Unique differentiator.

**Affected Files**:
- `lib/rmhtube/types.ts` — add to `RoomSettings`
- `lib/rmhtube/constants.ts` — default reaction set
- `server/rmhtube/room-manager.ts` — validate custom set
- `components/rmhtube/ReactionOverlay.tsx` — use room's reaction set
- `components/rmhtube/RoomSettings.tsx` — emoji picker in settings

**Type Changes**:
```ts
interface RoomSettings {
  // ... existing fields
  customReactions: string[] | null; // null = use defaults
}
```

**Implementation Notes**:
- Settings modal: emoji grid picker (common emojis), host selects 4-12 emojis
- `null` means use the default set (existing 8 emojis)
- Validation: only allow valid emoji characters, min 4, max 12
- Included in room state snapshot so all members see the same set
- Preset packs: "Movie Night 🍿🎬🎭👀😱", "Music 🎵🎸🔥💃🎶", "Sports ⚽🏀🏈🎾🏆"
- Custom reactions update immediately for all members via existing settings update flow

**Complexity**: Low

---

## Appendix: New Socket Events Reference

### Client → Server (C2S)

| Event | Phase | Feature |
|---|---|---|
| `rmhtube:chat:typing` | 1 | Typing Indicators |
| `rmhtube:chat:react` | 1 | Chat Reactions |
| `rmhtube:chat:pin` | 1 | Pinned Messages |
| `rmhtube:sync:set_speed` | 2 | Synced Playback Speed |
| `rmhtube:queue:import_playlist` | 3 | YouTube Playlist Import |
| `rmhtube:queue:vote` | 3 | Queue Voting |
| `rmhtube:queue:shuffle` | 3 | Queue Shuffle |
| `rmhtube:room:set_role` | 4 | Co-Host / Moderator |
| `rmhtube:room:ban` | 4 | Ban List |
| `rmhtube:room:unban` | 4 | Ban List |
| `rmhtube:room:create_invite` | 4 | Invite Links |
| `rmhtube:room:set_status` | 4 | User Presence Status |

### Server → Client (S2C)

| Event | Phase | Feature |
|---|---|---|
| `rmhtube:chat:typing_indicator` | 1 | Typing Indicators |
| `rmhtube:sync:speed_changed` | 2 | Synced Playback Speed |
| `rmhtube:room:invite_created` | 4 | Invite Links |

### New Room Action Types

| Action Type | Phase | Feature |
|---|---|---|
| `CHAT_REACTION` | 1 | Chat Reactions |
| `MESSAGE_PINNED` | 1 | Pinned Messages |
| `MESSAGE_UNPINNED` | 1 | Pinned Messages |
| `MEMBER_PROMOTED` | 4 | Co-Host / Moderator |
| `MEMBER_DEMOTED` | 4 | Co-Host / Moderator |
| `MEMBER_BANNED` | 4 | Ban List |
| `MEMBER_UNBANNED` | 4 | Ban List |
| `MEMBER_STATUS_CHANGED` | 4 | User Presence Status |
| `QUEUE_VOTE_UPDATED` | 3 | Queue Voting |

---

## Appendix: New Type Additions Summary

### Extended Interfaces

| Interface | New Fields | Phase |
|---|---|---|
| `ChatMessage` | `replyToId`, `replyToContent`, `replyToUserName`, `mentions`, `reactions`, `contentType`, `gifUrl`, `gifPreviewUrl`, `gifWidth`, `gifHeight`, `timestamp` | 1, 2 |
| `ClientRoomState` | `typingUsers`, `pinnedMessage`, `playedItems`, `bannedUsers` | 1, 3, 4 |
| `ClientMemberInfo` | `role`, `status` | 4 |
| `ClientQueueItem` | `votes`, `votedByMe`, `chapters` | 2, 3 |
| `RoomSettings` | `queueVoting`, `autoSortByVotes`, `loopQueue`, `customReactions` | 3, 5 |
| `RmhTubeUserSettings` | `showTimestamps`, `showSystemMessages`, `theaterMode`, `ambientMode`, `hasSeenTour`, `desktopNotifications`, `notifyOnMention`, `notifyOnAllMessages`, `soundEffects`, `soundVolume`, `layoutDensity` | 1–5 |

### New Interfaces

| Interface | Phase | Feature |
|---|---|---|
| `SystemMessage` | 1 | System Messages |
| `VideoChapter` | 2 | Video Chapters |
| `BannedUser` | 4 | Ban List |
| `InviteLink` | 4 | Invite Links |
| `ScheduledRoom` | 4 | Room Scheduling |
| `RoomHistoryEntry` | 4 | Room History |
| `Playlist` / `PlaylistItem` | 3 | Save as Playlist |
| `SearchResult` | 3 | Media Search |
| `UserWatchStats` | 4 | Watch Stats |

### New Database Models

| Model | Phase | Feature |
|---|---|---|
| `RmhTubePlaylist` | 3 | Save as Playlist |
| `RmhTubePlaylistItem` | 3 | Save as Playlist |
| `RmhTubeUserStats` | 4 | Watch Stats |
| `RmhTubeRoom.scheduledFor` | 4 | Room Scheduling |
| `RmhTubeRoom.description` | 4 | Room Scheduling |
| `RmhTubeChatMessage.replyToId` | 1 | Message Replies |
