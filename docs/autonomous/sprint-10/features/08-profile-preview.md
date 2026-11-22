# 08 — See your profile as others see it

Surface: `/settings/preview` (new, in the settings index), a "Preview" link on one's own profile and in privacy
settings. Wave 6. Namespace `profile-preview`. Site tier (Steel).

## User story

As a member who has set who sees my follow lists, my shelves, my activity and my status, I want to see my profile the
way someone signed out, and someone signed in who does not follow me, would see it, so that I know my privacy choices do
what I think they do.

## Requirements elicitation

- **What exists (verified):**
  - `getProfile(id, viewer: { id, isAdmin })` (`lib/profile.server.ts`) builds the viewer-aware header: presence through
    its audience (`resolveProfilePresence`, `presenceVisibility`), `canSeeFollowLists` (follow-list privacy, sprint 04
    18), the activity gate (`mayShowActivity`), membership, guestbook mode, status. Tabs load through their own
    endpoints with the session (posts via `useProfilePosts`, shelves via `useShelvesTab`, and others in
    `components/feed/profile-column/`).
  - Admins have "view as member" (`lib/safety/view-as.server.ts`, `/admin/safety`): what a member sees, not how a member
    is seen.
  - Members have no way to check their own privacy outcome except asking someone else to look.
- **Decisions:**
  - **Two real audiences, computed on the server:** "Signed out" (`viewer = { id: null }`) and "A member who doesn't
    follow you" (a viewer that is signed in and has no relationship: a reserved id `PREVIEW_STRANGER_ID` that matches no
    row, used only by the read functions this feature lists, never by any write).
  - **A third, described:** "People who follow you" and "People you follow back" are shown as a list of what each
    setting lets them see, derived from the same pure audience functions the readers use (presence audience, follow-list
    visibility, shelf privacy, leaderboard privacy, activity) — stated as text, because computing it would need a real
    follower's id.
  - **What the preview shows:** the header as `getProfile` returns it for that viewer (name, bio, links, presence,
    status, counts, follow lists visible or not), the first page of posts exactly as the profile posts reader returns it
    for that viewer (quiet counts, content warnings, circle and supporter posts hidden), and a "Sections" list: each tab
    and whether that viewer sees it, with a link to the setting that controls it.
  - **Read-only.** The preview renders static rows (no follow button, no composer, no guestbook form); it is not the
    live `ProfileColumn`.
  - **Never more than the owner may see (validation pass 2).** The preview shows the owner's own profile, but that
    profile embeds other members' things — quoted and reposted posts, replies shown in context, guestbook entries,
    follow-list members. Rendered for a stranger, those could include posts by someone who blocked the owner, a private
    account's post the stranger may see and the owner may not, or a circle post the owner is outside. So every item
    authored by someone else is shown only if it passes **both** the audience's check and the owner's own (the owner's
    blocks in both directions, mutes, circles and private accounts, through the same readers called with the owner's
    id); an item that fails the owner's check is replaced by "A post you can't see" with no author, text or counts.
    Follow lists are reported as "Visible" or "Hidden" with the count the profile header shows, never as a list of
    names. Guestbook entries are not previewed (the section row says whether the guestbook is visible and to whom). The
    preview adds nothing to the owner's knowledge: everything it shows, the owner can already open themselves.
  - **Rate limit:** read class; the preview is the member's own only.

## Functional requirements

1. FR-1 `lib/profile/preview.server.ts`: `previewProfile(ownerId, audience)` returning the header, the first post page
   and the sections list, through `getProfile`, the profile posts reader and the existing visibility helpers.
2. FR-2 A registered endpoint `GET /api/profile/preview?audience=signed-out|stranger` (contract + `implement()`,
   `auth: 'required'`, the caller's own profile only).
3. FR-3 `/settings/preview` (new route, `PageLayout`), the audience switch (`components/ui/tabs.tsx`), the described
   follower audience, links to each controlling setting.
4. FR-4 A settings-index row (anchor) and a "Preview" link on one's own profile header and on `/settings/privacy`.
5. FR-5 `PREVIEW_STRANGER_ID` in a pure module with a test that no write path imports it.

## Non-functional requirements

- **Security:** the audience is applied to the caller's own id only (the endpoint takes no profile id); the stranger id
  is a constant that no user can own (not a cuid; contains a character handles and ids cannot), asserted; every
  third-party item is intersected with the owner's own view (above); the readers called with the stranger id must not
  write (a profile view, a visit counter, a "seen" mark): the source-scan test lists each reader the preview calls and
  asserts none of them reaches `create`, `update`, `upsert` or a counter increment on that path, or the preview passes
  the reader's existing "do not record" option. `getProfile`'s `cachedMiss` is keyed by the profile, not the viewer, so
  the stranger viewer leaves no cache entry another viewer reads.
- **Correctness:** the preview calls the same readers the profile uses; it never re-implements a visibility rule. Any
  reader it calls that reads post text is already in the post read-path registries; the new file is added to them (or to
  their exempt maps with "delegates to <reader>") honestly.
- **Accessibility:** the audience switch is the tabs primitive; each section row says "Visible" or "Hidden" in text.

## Data model and API

- No schema change. New `lib/profile/preview.ts` (pure: the described audience, `PREVIEW_STRANGER_ID`),
  `lib/profile/preview-schema.ts`, `lib/profile/preview.contract.ts`, `lib/profile/preview.server.ts`,
  `lib/profile/api/profile.preview.server.ts`, `app/routes/_site/settings/preview.tsx`,
  `components/settings/ProfilePreview.tsx`.
- Edits: `lib/settings-nav.ts` (anchor), `lib/sitemap.ts` (anchor: `/settings/preview`, `personal`), the profile
  header's own-profile actions (`components/profile/ProfileHero.tsx`), `app/routes/_site/settings/privacy.tsx` (a link),
  the post read-path registries if the scan requires (`lib/feed/content-warning.ts`, `quiet-counts.ts`, `gif-alt.ts`,
  `quiz-poll.ts`), `lib/i18n/user-text.ts` (anchor).

## Testing requirements

- Main suite `lib/profile/__tests__/profile-preview.test.ts` (mock Prisma and the readers): signed out never sees follow
  lists set to followers; the stranger sees what a signed-in non-follower sees; presence "mutuals" is offline in both; a
  circle post is absent; quiet counts hidden when the owner hides them; the caller can only preview themselves; a repost
  of a post by a member who blocked the owner is shown as "A post you can't see" in the stranger's preview; follow lists
  never return names; no reader called by the preview writes; the stranger id is refused by `findMemberForViewAs`-style
  lookups (matches no row).
- Main suite `lib/profile/__tests__/preview-stranger-id.test.ts`: a source scan that no module outside the listed
  readers imports `PREVIEW_STRANGER_ID`.
- Product suite `lib/profile/__tests__/preview-audience.product.test.ts`: the described follower audience for each
  setting value.
- Post read-path registry tests, sitemap coverage, settings-nav test, user-text direction.

## Acceptance criteria

- [ ] With follow lists set to "Followers", the signed-out preview shows "Follow lists: hidden".
- [ ] With presence "Mutuals", both previews show the member as offline.
- [ ] A supporters-only post is not in either preview's posts.
- [ ] A post the owner cannot see (its author blocked them) never appears in the preview, whatever the audience.
- [ ] The preview is reachable from the settings index and from one's own profile.

## Out of scope

Previewing as a specific named member, previewing a community or a group, changing settings from inside the preview.
