# Site-wide Emoji Support — Design

**Date:** 2026-07-08
**Status:** Approved

## Goal

Add first-class emoji support to all user-facing text interfaces: an emoji picker on every compose input, Slack-style `:shortcode:` autocomplete/conversion while typing, and emoji reactions on feed posts, comments, direct messages, and group messages.

## Context — what already works (no changes needed)

- **Storage:** PostgreSQL is UTF-8; all body columns (`RMHark`, `RMHarkComment`, `DirectMessage.content`, `GroupMessage.content`, chat messages, bios) store emoji natively. No charset migration.
- **Validation:** all body validators are Zod length caps only (`lib/rmhark-schema.ts`, `lib/profile-schema.ts`, message API routes) — nothing strips or blocks non-ASCII.
- **Rendering:** `components/ui/TwemojiProvider.tsx`, mounted at the app root (`app/routes/__root.tsx`), already converts any native emoji to Twemoji SVGs site-wide.
- **Dependencies:** `emoji-picker-react` (used in `components/rmhbox/minigames/emoji-cinema/EmojiKeyboard.tsx`), `@twemoji/api`, and `twemoji-parser` are already installed.
- **Prior art:** realtime chats (rmhstudy/rmhtype/rmhtube) already have a fixed-set emoji reaction feature via `CHAT_REACTION_EMOJIS` in `lib/shared/chat-constants.ts` and the `ChatPanel` components.

## Part 1 — Emoji picker button on all text inputs

A new shared component, `EmojiPickerButton`:

- A Smile (😀) icon button that opens `emoji-picker-react` in a popover.
- Config mirrors the existing `EmojiKeyboard.tsx`: `EmojiStyle.TWITTER` (matches Twemoji rendering), theme-aware.
- **Lazy-loaded** via `React.lazy` — emoji-picker-react is ~1MB with data; no bundle cost until first opened.
- On select, inserts the emoji at the caret of the associated textarea/input using the `setSelectionRange` technique from `MentionTextarea.applySuggestion` (`components/feed/MentionTextarea.tsx`), then restores focus.
- API: takes a ref to the target `HTMLTextAreaElement | HTMLInputElement` plus the controlled `value`/`onChange` pair (or an `onInsert(emoji)` callback where the host manages insertion).

Attached next to the existing `GifPicker` button on every compose surface:

| Surface | Component |
|---|---|
| Feed post compose | `components/feed/ComposeBox.tsx`, `ComposeModal.tsx`, `EditPostModal.tsx` |
| Comments | `components/feed/CommentItem.tsx` (comment input) |
| Direct messages | `components/feed/ConversationView.tsx` (GhostTextArea) |
| Group chats | `components/feed/GroupChatView.tsx` |
| Realtime chats | `components/shared/ChatPanel.tsx`, `components/rmhtube/ChatPanel.tsx` |
| Profile edit | `components/feed/ProfileEditModal.tsx` (bio field) |

## Part 2 — Shortcode autocomplete (`:fire:` → 🔥)

A shared `useEmojiShortcode` hook usable on any textarea/input, with two behaviors:

1. **Autocomplete dropdown:** typing `:` followed by 2+ characters shows a dropdown of matching emoji (name + glyph), visually consistent with the existing @mention autocomplete in `MentionTextarea`. Enter/Tab/click inserts the unicode emoji, replacing the partial shortcode. Escape dismisses.
2. **Instant conversion:** when the user finishes typing a complete known shortcode (`:fire:`), it is replaced with the emoji (🔥) immediately in the input, caret preserved after the emoji.

What is sent and stored is plain unicode — **zero server or renderer changes**.

**Shortcode data:** a compact static name → emoji JSON generated at build/dev time from `unicode-emoji-json` (or emojibase) and committed to the repo (~50–100KB), lazy-loaded on first `:` trigger. No new eager runtime dependency.

Wired into:
- `MentionTextarea` (posts, comments, group chats) — alongside the existing `@`/`#` triggers.
- `GhostTextArea` (DMs).
- The plain chat inputs in `shared/ChatPanel` and `rmhtube/ChatPanel`.

## Part 3 — Emoji reactions on posts, comments, DMs, group messages

Likes remain unchanged; reactions are additive.

### Trigger: right-click / long-press

- **Desktop:** right-click (`onContextMenu` + `preventDefault`) on a post card, comment, or message bubble opens a floating reaction menu positioned at the cursor.
- **Touch:** long-press does the same. Android fires `contextmenu` natively on long-press; a small touch-timer fallback handles iOS Safari (which does not).
- Menu contents: the quick row (👍 ❤️ 😂 😮 😢 🔥 — reuse `CHAT_REACTION_EMOJIS`) plus a **+** button that opens the full emoji picker, so **any** emoji can be a reaction (Discord/Slack model).

### Display

- Reaction chips under the content: emoji + count (e.g. 🔥 3), sorted by count.
- Chip is highlighted when the current user has reacted; clicking a chip toggles that reaction.
- Hover tooltip lists who reacted.
- Same visual language as the existing realtime-chat reaction pills.

### Data model (Option A — per-target tables, chosen)

Four new Prisma models, following the existing `RMHarkLike` / `RMHarkCommentLike` pattern:

- `RMHarkReaction`
- `RMHarkCommentReaction`
- `DirectMessageReaction`
- `GroupMessageReaction`

Each with: `id`, `emoji String @db.VarChar(32)` (ZWJ sequences/flags are multi-codepoint), `userId` FK, target FK with cascade delete, `createdAt`, and `@@unique([userId, <targetId>, emoji])` (a user can add multiple distinct emoji to one target, but each emoji once).

Rejected alternative: a single polymorphic `Reaction` table (`targetType` + `targetId`) — fewer models, but loses FK integrity/cascade deletes and diverges from the codebase's established per-target pattern.

### API & data flow

- Toggle endpoints per target type, following the existing like-route pattern (auth required; validates emoji is a non-empty string ≤32 chars).
- Post/comment/message fetch payloads include grouped reactions: `[{ emoji, count, reactedByMe }]` (+ reactor names for tooltips, capped).
- DM/group-chat reaction updates ride the existing message refresh mechanism (TanStack Query invalidation/polling) — no new realtime infrastructure.
- Optimistic UI on toggle.

### Out of scope (v1)

- Notifications for reactions (likes keep theirs; possible follow-up).
- Grapheme-aware character counting (emoji continue to cost ≥2 toward length limits — explicitly deselected).
- Migrating realtime-chat reactions to the new tables (they keep their socket-based `{emoji: userIds}` storage).

## Build order

Three independent, shippable PRs:

1. **Picker** — `EmojiPickerButton` + wiring into all compose surfaces.
2. **Shortcodes** — dataset generation, `useEmojiShortcode` hook, wiring into textareas/inputs.
3. **Reactions** — Prisma models + migration, API routes, right-click reaction menu, chips UI.

## Testing

- Unit: caret insertion helper (middle/end of text, selection replacement); shortcode matcher (partial query extraction, full-code instant conversion, no false positives on `10:30` or URLs); reaction grouping logic.
- API: toggle route tests (add, toggle off, duplicate-emoji uniqueness, auth, cascade on target delete) following existing like-route test patterns.
- Note: no DOM/WebGL test env in this repo (node-only Vitest) — component behavior verified via browser playtest; hooks tested at the pure-logic level.
