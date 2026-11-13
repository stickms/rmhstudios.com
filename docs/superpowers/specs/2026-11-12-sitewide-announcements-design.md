# Sitewide announcements — design

Date: 2026-11-12 · Branch: `feat/sitewide-announcements`

## Intent

Replace the hardcoded "What's new" popup with something admins publish. An
admin writes a normal blog post, switches on **Sitewide announcement**, and
picks which RMH business it comes from. The newest live announcement pops up
once for every visitor as a full-screen takeover (blurred site behind, one
contained liquid-glass box, scrolling content with images and video), then
fades back into the site. The same post is pinned at the top of the feed.

## Goals

- Publish an announcement with no code change.
- Popup once per person: remembered on the account for signed-in members
  (follows them across devices), in `localStorage` for logged-out visitors.
- Long-form content: scrolls inside the box; inline images and video.
- Announcements are attributed to a business (RMH Studios, RMH Capital,
  Adaptive Intelligence, RMH Research, RMH Designs, RMH PMC).
- Pinned card at the top of the feed while the announcement is live.

## Non-goals

- No changes to the short pinned banners (`FeedAnnouncement`, `/admin/announcements`).
- No per-business publishing permissions — site admins publish everything.
- No queue of popups: only the newest live announcement ever pops up.
- No popup inside full-screen routes (games, login, legal) — `_site` shell only.

## Anti-goals

- Stacking on top of the first-run language chooser or the welcome modal.
- A stale announcement popping up months later for a new or logged-out visitor.
- Raw HTML in post content (no `rehype-raw`; video is not an XSS vector).
- Hardcoded colors/radii — everything through `--site-*` tokens and the glass
  material classes so all themes (incl. `light`, `high-contrast`) work.

## Decisions made by the user

- Authoring = a blog post with a "sitewide announcement" mode.
- Full-screen takeover, blur behind, contained box in the liquid-glass design
  language, fades back to the site on dismiss.
- Seen-state on the account for members; logged-out visitors also see it.
- Announcements come from a named business.
- `WhatsNewModal` is retired.

## Calls made by the designer (not confirmed line by line)

- Business list lives in `lib/businesses.ts`; adding one is a one-line change.
- Optional end date. With no end date the popup and feed card stop
  `ANNOUNCEMENT_DEFAULT_LIFETIME_DAYS` (30) after the post was announced.
- Dismiss via close button, Escape, click on the scrim, or the "Got it" button.
- Turning the switch off and on again (false → true) re-announces: new
  `announcedAt`, seen rows cleared, so it pops up again for everyone.
- Video is written with image syntax: `![caption](url)`. A URL ending in
  `.mp4/.webm/.mov` renders a `<video controls>`; a YouTube URL renders a
  `youtube-nocookie.com` embed (both already allowed by the CSP in
  `deploy/apache/rmhstudios.conf`). The editor gets an upload button for
  images and video files.

## Data model (already applied on this branch — do not change)

`BlogPost` gains `announcement`, `business`, `announcedAt`,
`announcementExpiresAt` and a `seenBy` relation. New `BlogAnnouncementSeen`
(`@@id([userId, postId])`, cascade from both sides). Migration:
`prisma/migrations/20261112120000_sitewide_announcements`.

## Shared contract (already written on this branch — import, do not edit)

- `lib/businesses.ts` — `BUSINESSES`, `BusinessId`, `DEFAULT_BUSINESS_ID`,
  `isBusinessId()`, `getBusiness()`.
- `lib/sitewide-announcement.ts` — `SitewideAnnouncementSummary`,
  `SitewideAnnouncementResponse`, `announcementVersion()`,
  `announcementExpiry()`, `isAnnouncementLive()`, `hasSeenLocally()`,
  `markSeenLocally()`, `saveAnnouncementFieldsSchema`, `markSeenSchema`.
- `hooks/useSitewideAnnouncement.ts` — React Query hook over
  `GET /api/sitewide-announcement` (deferred until idle).
- `stores/sitewideAnnouncementStore.ts` — `{ open, setOpen }`; the feed card
  calls `setOpen(true)` to reopen the popup.

## HTTP API

| Route | Behaviour |
| --- | --- |
| `GET /api/sitewide-announcement` | `SitewideAnnouncementResponse`: newest live announcement summary (or `null`) + `seen` (always `false` for anonymous). `?full=1` adds `content`. Announcement lookup cached ~60s, invalidated on admin save/delete. |
| `POST /api/sitewide-announcement/seen` | Body `{ id }` (zod `markSeenSchema`). Signed-in: upsert seen row. Anonymous: `200 { ok: true }` no-op. Rate-limited. |
| `POST /api/admin/blog` | Additionally accepts `announcement`, `business`, `announcementExpiresAt` (zod `saveAnnouncementFieldsSchema`). Sets `announcedAt` on false → true and clears seen rows. Invalidates the cache. |
| `POST /api/admin/blog/media` | Admin-only multipart upload (`file`). Image → optimized like feed images; video (`mp4`/`webm`/`mov`) → stored under a `blog/` prefix. Returns `{ url, kind: 'image' \| 'video' }`. Rate-limited, size-capped, content sniffed. |

## UI

- **Popup** — `components/announcements/SitewideAnnouncementModal.tsx`, mounted
  lazily in `app/routes/_site.tsx` where `WhatsNewModal` was. Radix Dialog
  primitives from `components/ui/dialog`; `.glass-scrim` overlay,
  `.glass-overlay` box (see `docs/design-language.md` glass section). Wide box
  (≈`max-w-3xl`, `max-h` ≈ 88dvh), fixed header (business mark + name,
  "Announcement" label, title, close), scrolling body rendered with
  `BlogMarkdown`, footer with "Read full post" (→ `/blog/$slug`) and "Got it".
  Full-screen on phones. Fade/scale in and out; reduced motion → no transform.
  Opens when: summary present, live, not seen (server `seen` for members,
  `hasSeenLocally` for everyone), no first-run dialog pending. Fetches
  `?full=1` only when it is going to open. On close: `markSeenLocally` + POST
  seen (members).
- **Renderer** — `components/blog/BlogMarkdown.tsx`
  (`BlogMarkdown({ content, className? })`), used by the blog post page, the
  popup, and the editor preview. Media classification in `lib/blog-media.ts`
  (pure, unit-tested).
- **Feed card** — `components/feed/SitewideAnnouncementCard.tsx`, pinned above
  `FeedAnnouncements` in `FeedColumn` while live: business name, "Announcement"
  label, title, description, cover image; primary action reopens the popup,
  secondary links to the post.
- **Blog post page** — shows the business + "Announcement" badge when set.
- **Editor** — `components/admin/MDXEditor.tsx`: switch, business select, end
  date, and an "Upload image/video" button that inserts `![name](url)`.

## Left to the builders

Exact visual composition within the design language, animation timing, test
structure, upload size caps, and i18n key names (`t(key, { defaultValue })`;
the coordinator runs `pnpm i18n:extract` once at the end).
