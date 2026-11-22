# 16 — Communities that require image descriptions

Surface: the community mod settings (`components/communities/ModSettings.tsx`),
the community composer, every path that puts an image into a community, the
community page header. Wave 2. Namespace `community-alt-text`.

## User story

As a moderator of a community with blind and low-vision members, I want to
require that every image posted here has a description, so that everyone in the
community can follow what is posted, without asking each member to change their
own settings.

As a member posting there, I want to be told before I post, at the image that
needs it, rather than after.

## Requirements elicitation

- **What exists (verified):**
  - A **member-level** require-descriptions mode (X12): `User.requireAltText`,
    `lib/feed/alt-text.server.ts` (`getRequireAltText`, `setRequireAltText`,
    `altTextViolation(userId, imageUrls, imageAlts)`), the pure
    `missingAltIndexes` (`lib/feed/alt-text.ts`), and the call sites that apply
    it: the post create path (`lib/feed/api/rmharks.server.ts`), scheduled
    posts (`lib/scheduled/api/scheduled.server.ts`), and messages
    (`lib/messages/send.server.ts`, `lib/messages/scheduled.server.ts`).
  - **No community-level requirement.** `Community` (`prisma/schema/communities.prisma`)
    has posting rules (`verificationLevel`, `flairRequired`,
    `rulesRequireAgreement`) read through `getCommunitySettings`
    (`lib/communities/settings.server.ts`, 30 s cache) and enforced by
    `gateCommunityContent` (`lib/communities/gate.server.ts`), which is called
    with `content` but not images.
  - Images in communities arrive through: the create path, scheduled posts
    published later (`lib/scheduled/publish.server.ts`), editing a post's
    images or descriptions after posting (sprint 05 16,
    `lib/feed/alt-text-edit.server.ts`; and the post edit path
    `lib/feed/api/rmharks.$id.server.ts`), and — after feature 11 in Wave 5 —
    `POST /api/v1/posts` with `communityId`.
  - Community mod settings UI: `components/communities/ModSettings.tsx`; the
    composer: `components/communities/CommunityComposer.tsx` and the feed
    composer (`components/feed/compose/*`).
- **Decisions:**
  - A community setting **"Images need a description"**
    (`Community.requireImageAlt`, default off), toggled by moderators in mod
    settings and recorded in the community mod log (`logModAction`, a new
    settings action label).
  - **Enforcement is in the gate.** `gateCommunityContent` gains `imageUrls`
    and `imageAlts` arguments; when the community requires descriptions and
    `missingAltIndexes` is non-empty, it returns `deny` with status 400, code
    `ALT_REQUIRED` and the missing indexes. Every caller passes the images, so
    feature 11's shared `prepareCommunityPost` inherits it.
  - Every path that can put an image into a community, or remove a description
    from one there, is listed in `COMMUNITY_ALT_WRITE_PATHS` and held by a
    source-scan test: create, scheduled create, scheduled publish (a scheduled
    post that no longer meets the rule at publish time is not published, like
    a sanctioned author's today (`publish.server.ts` returns `null`), and the
    author gets one `SYSTEM` notification, label `scheduled-alt-required`
    ("Your scheduled post to {{community}} was not published: an image needs a
    description"), and the draft stays in Drafts),
    post edit, description edit (clearing a description on a post in a
    requiring community is refused), and the v1 create (added by feature 11,
    which runs after this one; this feature adds the entry and 11's test keeps
    it green).
  - GIFs are not images for this rule (sprint 06 15 gives GIFs their own
    description; requiring it is out of scope).
  - Posts made before the setting was turned on are not touched; the
    description-editing list in Settings > Content (sprint 05 16) already shows
    a member their images without descriptions.
  - The community page shows one line under its rules: "Images here need a
    description." (`t-meta`), so the requirement is visible before composing.
  - **Composer:** when posting into a requiring community, each image without a
    description shows "Description needed" beside its describe control, and
    the Post button stays enabled but the submit focuses the first image that
    needs one with that message (no silent disabled button).
  - Moderators are not exempt (the point is the readers).

## Functional requirements

1. FR-1 The mod setting, saved through the existing community settings
   endpoint, logged in the mod log, cached through `getCommunitySettings`.
2. FR-2 Server enforcement on every listed write path with `ALT_REQUIRED`.
3. FR-3 Composer guidance and focus as decided, in both the community composer
   and the feed composer when a community is chosen.
4. FR-4 The community page line.
5. FR-5 The scheduled-publish refusal with its reason.

## Non-functional requirements

- **Correctness:** text-only posts never read the setting beyond the cached
  settings object; the check uses the same `missingAltIndexes` as the member
  rule (whitespace-only and NBSP-only descriptions count as missing, as sprint
  05 16 fixed).
- **Security:** only moderators toggle it (`requireMod`); `rateLimit: 'write'`.
- **Performance:** no extra query: the setting rides in the cached
  `CommunitySettings`.
- **Steel:** inline guidance is a line of text by the image, not a tinted box
  (D8 default).
- **Accessibility:** the "Description needed" text is tied to the image's
  describe button with `aria-describedby`; focus moves to it on submit.
- **i18n:** `community-alt-text`; the mod-log label is a literal key; the
  notification label is literal in `feed.json` under the anchor.

## Data model and API

- `Community.requireImageAlt Boolean @default(false)`; migration
  `20261127020000_s07_community_alt_text`.
- `CommunitySettings.requireImageAlt`; `gateCommunityContent({ …, imageUrls,
  imageAlts })`; the deny code in `lib/communities/bans.ts`'s code list or a
  new `lib/communities/alt-required.ts` (pure, with `COMMUNITY_ALT_WRITE_PATHS`).
- Edits: `lib/feed/api/rmharks.server.ts`, `rmharks.$id.server.ts`,
  `lib/feed/alt-text-edit.server.ts`, `lib/scheduled/api/scheduled.server.ts`,
  `lib/scheduled/publish.server.ts`, `lib/communities/settings.server.ts`,
  `lib/communities/api/communities.$slug.settings.server.ts`,
  `lib/communities/modlog.ts` (action), `components/communities/ModSettings.tsx`,
  `CommunityComposer.tsx`, the feed composer's image strip, the community
  header.

## Testing requirements

- Main suite `lib/communities/__tests__/community-alt-text.test.ts`: a
  requiring community refuses an image without a description on create,
  scheduled create, edit and description clearing; allows with descriptions;
  allows text-only; a non-requiring community unchanged; scheduled publish
  refused with the reason; non-moderator cannot toggle; the toggle is logged.
- `lib/communities/__tests__/community-alt-write-paths.test.ts`: the source
  scan.
- Existing tests that must stay green: the gate and AutoMod tests, the X12
  member-rule tests, sprint 05 16's tests, sprint 06 01's ban tests.
- Gate tests: computed-key ratchet (mod-log labels), design consistency.

## Acceptance criteria

- [ ] A moderator turns the setting on; a member's image post without a
      description is refused with focus on the image; with one, it posts.
- [ ] A scheduled image post without a description into that community is not
      published, and its author is told why.
- [ ] Clearing a description on an existing post there is refused.
- [ ] The community page says the rule.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Requiring GIF descriptions, requiring descriptions in group chats, automatic
descriptions, applying the rule to posts made before it was turned on.
