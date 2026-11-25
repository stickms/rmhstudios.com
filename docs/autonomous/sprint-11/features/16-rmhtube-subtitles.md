# 16 — Subtitles for any video in an RMHTube room

Surface: an RMHTube room (`/rmhtube/$roomId`): the queue item's "Add subtitles", the player's subtitle overlay, the
viewer's subtitle picker and size. Wave 3. Namespace `rmhtube-subtitles`. App tier (L8): RMHTube keeps its own look.

## User story

As someone who is deaf or hard of hearing, or who watches with friends in another language, I want the person who queued
a video to add a subtitle file that everyone in the room can turn on, so that a watch party works for me even when the
video has no captions of its own.

## Requirements elicitation

- **What exists (verified):**
  - Rooms sync playback for every member (`lib/rmhtube/sync-plan.ts`, `sync-math.ts`, `clock.ts`); the queue is
    `RmhTubeQueueItem` (`prisma/schema/rmhtube.prisma`), served by the RMHTube hub (`server/rmhtube/media-queue.ts`).
  - Media types are `youtube | twitch | vimeo | direct` (`lib/rmhtube/media.ts`). A captions switch exists
    (`settings.captionsEnabled`, `components/rmhtube/SettingsPanel.tsx` and `HostControls.tsx`, key `C` in
    `RmhTubeRoomPage.tsx`): `VideoPlayer.tsx` sets the `<video>` element's own text tracks to showing, and passes
    `cc_load_policy` to YouTube. Neither can add captions a video does not carry, and a `direct` file usually carries
    none.
  - There is no upload of any subtitle file.
  - Room membership is in the database: `RmhTubeRoomMember (roomId, userId, leftAt)` (a row with `leftAt` null is a
    member in the room now), and `RmhTubeRoom.hostId`, `isPublic`, `password`, `closedAt`. The hub (`server/rmhtube/`)
    validates its events with zod in `server/rmhtube/schemas.ts`, rate-limits them by name with
    `server/rmhtube/config.ts` `SOCKET_RATE_LIMITS` (an event with no entry is not limited), and accepts at most
    `MAX_HTTP_BUFFER_SIZE` (1 MB) per message.
- **Decisions:**
  - **Who adds:** the member who queued the item, or the room's host, attaches up to 3 subtitle files to it (one per
    language label), `.vtt` or `.srt`, at most 256 KB (checked on `File.size` before the file is read) and 5,000 cues,
    with a label (up to 40 characters, such as "English" or "Español") and an optional BCP 47 language tag (validated
    with `Intl.getCanonicalLocales`).
  - **Parsing in the browser, plain text only:** a pure parser (`lib/rmhtube/subtitles.ts`) reads WebVTT and SRT into
    cues `{ start, end, text }` in milliseconds. WebVTT `NOTE`, `STYLE` and `REGION` blocks and cue settings are dropped
    (a `STYLE` block's CSS is never applied anywhere); every `<…>` tag (`<b>`, `<i>`, `<c.x>`, `<v Name>`, timestamps,
    and any HTML such as `<script>` or `<img onerror>`) is removed, and only the entities `&amp;`, `&lt;`, `&gt;`,
    `&nbsp;`, `&lrm;`, `&rlm;` are decoded, **after** tag removal, so a decoded `&lt;script&gt;` stays literal text;
    control characters other than the line break, and the bidi embedding and override controls (U+202A–U+202E), are
    removed; a cue keeps at most 500 characters and three lines. Only cues are sent; the server runs the same
    `normalizeCue` and validation again (times non-negative, end after start, ordered by start, sizes, the total
    serialised cue JSON at most 512 KB so a message fits the hub's 1 MB buffer) and stores the result. The file itself
    is never stored. The overlay renders the cue as a React text child, never through `dangerouslySetInnerHTML`,
    `innerHTML` or a `<track>` element, so nothing in a cue can become markup.
  - **Every viewer chooses:** "Subtitles: Off / English / Español" per viewer, remembered on the device
    (`rmh:rmhtube:subtitles`: the last chosen label, and the size Small, Medium or Large), with Off the default. The
    existing captions switch keeps doing what it does for embedded tracks.
  - **The overlay** draws the active cue over every media type (it cannot be injected into an embed, so it sits above
    the player inside the stage) from the room's synced position, with `dir="auto"` on the cue text, RMHTube's own
    caption style and the chosen size. It does not animate; a cue appears and disappears at its times.
  - **Live streams:** a live source (`liveHint` live, or confirmed live) cannot take subtitles (its position is not a
    timeline).
  - **Removing:** the adder or the host removes a subtitle; deleting the queue item deletes its subtitles (cascade).
  - **Who reads them:** only a member in the room now (an `RmhTubeRoomMember` row with `leftAt` null, or the host), for
    an item of that room, while the room is not closed; anyone else gets the same 404 whether the room, item or subtitle
    exists or not. Adding and removing go through the hub, which checks the adder (the item's `addedById` or the room's
    `hostId`) and membership itself; both events are in the hub's `SOCKET_RATE_LIMITS` (`rmhtube:subtitle:add` 6 a
    minute, `:remove` 20) and zod-validated in `server/rmhtube/schemas.ts`.
  - **Moderation:** subtitles are seen only by people in the room, who can leave; hosts remove them; no new report
    entity (recorded).
  - **Erasure:** subtitles the member added are erased. **Export:** their subtitles (room, item title, label, cue count,
    created; not the cues of other members' items).

## Functional requirements

1. FR-1 Model `RmhTubeSubtitle`.
2. FR-2 `lib/rmhtube/subtitles.ts` (pure): parse WebVTT and SRT, normalise cues, validate (shared by client and server),
   find the active cue for a position (binary search).
3. FR-3 Hub events (`lib/rmhtube/events.ts`): add, remove, and the room state carrying each item's subtitle labels; the
   cues of the current item fetched once per item through a registered endpoint
   (`GET /api/rmhtube/rooms/$roomId/items/$itemId/subtitles/$subtitleId`, `auth: 'required'`, `rateLimit: 'read'`,
   current members of the room only as above, `Cache-Control: private, no-store`).
4. FR-4 UI: `components/rmhtube/AddSubtitlesDialog.tsx` (file picker, label, language, the parse result), the
   `SubtitleOverlay.tsx` in `VideoPlayer.tsx`, the picker and size in `SettingsPanel.tsx`, the line on each
   `QueueItem.tsx`.
5. FR-5 Device registry line, erasure operation, registry entry and export section under the anchors.

## Non-functional requirements

- **Performance:** the overlay looks up the cue on the player's existing time updates (no new animation frame loop; the
  rAF allowlist must not grow); the cue list is fetched once per item.
- **Accessibility:** the overlay text meets 4.5:1 on its background box in the app tier; the picker is labelled.
- **Safety:** cue text is rendered as text, never HTML; the parser and the server strip tags and controls; sizes are
  capped before reading (256 KB file), per cue (500 characters, three lines), per file (5,000 cues, 512 KB serialised)
  and per item (three files).

## Data model and API

- `RmhTubeSubtitle` (`@@map("rmhtube_subtitle")`: `id`, `queueItemId` → `RmhTubeQueueItem` (cascade), `roomId`,
  `addedById` → `User` (relation `RmhTubeSubtitles`), `label` `@db.VarChar(40)`, `lang` `@db.VarChar(16)?`, `cues Json`,
  `cueCount Int`, `createdAt`, `@@unique([queueItemId, label])`, `@@index([addedById])`) in
  `prisma/schema/rmhtube.prisma`. Migration `20261201030300_s11_rmhtube_subtitles`.
- Erasure registry: `erase`.

## Testing requirements

- Product suite `lib/rmhtube/__tests__/subtitles.product.test.ts`: WebVTT and SRT samples (headers, cue settings, comma
  and dot milliseconds, BOM, CRLF, `NOTE`/`STYLE`/`REGION` blocks), tags removed, an injection corpus (`<script>`,
  `<img src=x onerror=…>`, `&lt;script&gt;`, `<v <b>>`, nested and unclosed tags, U+202E) yields only literal text with
  no `<` that opens a tag, limits, active-cue lookup at boundaries.
- Main suite `lib/rmhtube/__tests__/subtitles.test.ts`: only the adder or host adds and removes; three per item; live
  items refused; the cue read is current-members-only (a member who left, a stranger and a closed room get the same
  404); server validation refuses unordered, oversized or over-512 KB cue sets; both hub events have a rate-limit entry;
  a component render (`renderToStaticMarkup`) of the overlay with a `<b>` cue shows the escaped text.
- Main suite `lib/account/__tests__/rmhtube-subtitles-erasure.test.ts`.
- Device registry, rAF allowlist, user-text direction, route table.

## Acceptance criteria

- [ ] The member who queued a `.mp4` adds an English `.srt`; another member turns on "English" and sees the lines in
      time with the video, including after the host seeks.
- [ ] A YouTube item with a subtitle file shows the overlay the same way.
- [ ] Removing the queue item removes its subtitles.

## Out of scope

Automatic captions, translating subtitles, subtitle styling beyond size, saving subtitles into playlists.
