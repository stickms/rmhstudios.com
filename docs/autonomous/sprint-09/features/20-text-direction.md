# 20 — Text that reads right in any direction

Surface: every component that renders text a member wrote — posts, comments, messages, group chats, profiles, community
names and descriptions, build and event titles, wiki and guide pages. Wave 7. No namespace (no new strings).

## User story

As a member who writes in Arabic, Hebrew or Persian on a site set to English — or in English on a site set to Arabic — I
want my words shown in their own direction, with punctuation, numbers and handles where I put them, so that what I wrote
reads the way I wrote it.

## Requirements elicitation

- **What exists (verified):**
  - The site ships nine locales with RTL for `ar` (root `CLAUDE.md`); the document direction follows the interface
    language.
  - Sprint 07's browser pass: "English text in `ar` shows trailing punctuation on the wrong side (no `dir="auto"`)";
    sprint 06's: "in `ar` with English fallback strings, '24-bit' renders as 'bit-24'".
  - A grep finds `dir="auto"` or `<bdi>` in 21 component files, mostly `components/study/*` and the handles in
    `FeedRow.tsx:142` and `CommentItem.tsx:401`. The post body renderer `components/feed/RMHarkContent.tsx` (used by 5
    components), the comment body, message rows (`components/feed/conversation/MessageRow.tsx`,
    `components/feed/group-chat/GroupMessageRow.tsx`), the profile header (`components/profile/ProfileHero.tsx`), build
    comments, RMHTube chat (`components/rmhtube/ChatPanel.tsx`), persona chats and edit history set no direction.
- **Decisions:**
  - **Blocks get `dir="auto"`.** Every element whose content is one block of member-written text (a post body, a
    comment, a message, a bio, a community description, a wiki or guide body, an event description, a build description)
    carries `dir="auto"`, so the browser takes the direction from its first strong character.
  - **Inline names get `<bdi>`.** Display names, handles, community names, titles and any member text placed inside a
    translated sentence are wrapped in `<bdi>` (or a `dir="auto"` span where the element must be a link), so "<name>
    liked your post" keeps its order in both directions.
  - **Inputs get `dir="auto"`** where members type free text (composer, comment and message fields, profile fields), so
    typing Arabic in an English interface aligns as it is typed.
  - **Layout is logical.** Where a touched component positions text with physical `left`/`right`, `ml-`/`mr-`,
    `pl-`/`pr-` or `text-left`, it moves to the logical utilities (`ms-`, `me-`, `ps-`, `pe-`, `text-start`) in the same
    lines only; no reformatting beyond them.
  - **A registry.** `USER_TEXT_RENDERERS` (new `lib/i18n/user-text.ts`) lists each renderer file and its kind (`block` /
    `inline` / `input`); a source-scan test checks each listed file contains `dir="auto"` or `<bdi` and fails a new
    component under `components/` that renders a known member-text field (`content`, `body`, `bio`, `description`,
    `displayName`) without being listed or exempted with a reason. The exempt map carries the app-tier games and
    anything that renders only the member's own numbers.
  - **Not here:** `components/feed/NotificationsColumn.tsx` (19's, same wave; 19 wraps the names it renders),
    `components/replays/*` and `components/lights-out/*` (18's, same wave; 18 marks the names it renders), and the Steel
    shell chrome. They go in the exempt map with "owned by 19" / "owned by 18" so the scan stays honest.

## Functional requirements

1. FR-1 `dir="auto"` on every block renderer, starting from `RMHarkContent`, the comment body, both message rows, the
   profile header's bio, community descriptions, wiki and guide bodies (`DocBody`), event and build descriptions,
   RMHTube chat, persona chat, edit history.
2. FR-2 `<bdi>` around inline member text in translated sentences (names in post headers, reposts, quotes, mentions
   lists, "replying to").
3. FR-3 `dir="auto"` on free-text inputs.
4. FR-4 Logical spacing in the touched lines.
5. FR-5 `USER_TEXT_RENDERERS`, its exempt map and the source-scan test.

## Non-functional requirements

- **Correctness:** no visual change for left-to-right text in an LTR interface (the default direction of an LTR first
  character is LTR); snapshot-style assertions on rendered markup only, no jsdom.
- **Performance:** attributes only; no script.
- **Design:** Steel unchanged; this is markup, not styling.
- **Scope discipline:** this is the sprint's last UI feature and touches shared renderers: each edit is the lines it
  needs.

## Data model and API

- No schema change. New `lib/i18n/user-text.ts`, `lib/__tests__/user-text-direction.test.ts`. Edits: the renderer files
  above and the inputs.

## Testing requirements

- Main suite `lib/__tests__/user-text-direction.test.ts`: every listed file has the attribute or element; a fixture
  component rendering `content` unlisted fails.
- Main suite `components/feed/__tests__/rmhark-content-direction.test.tsx` (rendered with `react-dom/server`): the body
  element carries `dir="auto"`; a display name in a header is inside `<bdi>`.
- Existing component tests stay green (update only markup expectations that now carry the attribute).

## Acceptance criteria

- [ ] In the `ar` interface, an English post ending with "?" shows the question mark at its end (right of the text's
      last word).
- [ ] In the English interface, an Arabic comment is right-aligned and reads right to left; a handle inside it stays
      intact.
- [ ] "<Arabic name> liked your post" keeps the name as one run in English.
- [ ] A new component that renders `post.content` without `dir="auto"` fails the test.

## Out of scope

Translating member text, mirroring icons, the app-tier games, changing the interface direction rules.
