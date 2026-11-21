# 18 — Who can see your follow lists

Surface: privacy settings in profile edit
(`components/feed/profile-edit/PrivacySection.tsx`), the followers and
following lists on profiles (`components/feed/SocialListModal.tsx`), and every
server path that reveals who follows whom. Wave 2. Namespace
`follow-list-privacy`.

## User story

As a member, I want to choose who can browse the lists of people I follow
and who follow me — everyone, people I follow back, or only me — so that my
social graph is not a directory anyone can scrape, while my counts and my
posts stay public.

## Requirements elicitation

- **What exists (verified):** `GET /api/profile/$id/followers` and
  `/following` (`lib/profile/api/`) return any member's lists, 20 to 50 at a
  time, to anyone (`auth: 'optional'`), with no block filtering. The developer
  API does the same (`app/routes/api/v1/users/$handle/followers.ts`,
  `following.ts`). Profile privacy (`UserProfile`,
  `prisma/schema/profile.prisma`)
  has `dmPrivacy`, `presenceVisibility` (`mutuals` default) and
  `showLikes`, but nothing for follow lists (`grep` for follower visibility
  finds nothing). Who-to-follow suggestions build "followed by …" lines from
  other members' following lists (`lib/discovery/`). The member's own follow
  manager (`/follows`, sprint 02) is unaffected — it is their own data.
- **Decisions:** one setting `followListVisibility`: `everyone` (default,
  today's behaviour), `mutuals` (people the member follows who follow them
  back — the same meaning `presenceVisibility` gives the word), or `me`.
  It covers both lists. Counts stay visible on the profile. Site admins see
  everything (moderation). Independently of the setting, lists shown to a
  viewer omit accounts in a blocked pair with that viewer. "Followed by"
  suggestion lines only name members whose following list the viewer could
  see.

## Functional requirements

1. FR-1 The privacy section gains "Who can see your followers and following"
   with the three choices and a line "Your counts stay visible".
2. FR-2 A viewer who may not see the lists gets, in the profile modal, "Alex
   keeps this list private" instead of rows; the counts on the profile are not
   links for them.
3. FR-3 Both site endpoints and both developer API endpoints refuse with the
   same answer (403 `LIST_PRIVATE` site-side; the API's own error envelope)
   when the viewer may not see the list.
4. FR-4 Every list shown omits accounts that blocked the viewer or that the
   viewer blocked.
5. FR-5 "Followed by" lines in suggestions never name a member whose
   following list is not visible to the viewer.

## Non-functional requirements

- **Security / privacy:** one function `canSeeFollowLists(viewerId, ownerId)`
  in `lib/social/follow-list-privacy.server.ts`, used by every path above;
  a test enumerates the paths so a new one must be added deliberately. The
  setting is validated by zod in the existing profile update path
  (`lib/profile-schema.ts`, `lib/api/routes/profile.server.ts`).
- **Performance:** `mutuals` costs two indexed `follow` lookups
  (`followerId_followingId`); block filtering is one `userBlock.findMany`
  over the page's ids, as `notifyWatchers` does.
- **Accessibility:** the setting is a radio group with a legend; the private
  notice is text.
- **i18n:** strings in `follow-list-privacy`.
- **Steel:** the choice uses the settings section's existing radio rows.

## Data model and API

- `UserProfile` gains `followListVisibility String @default("everyone")
  @db.VarChar(10)`. Migration `20261124020200_s04_follow_list_privacy`.
- `lib/social/follow-list-privacy.ts` (pure: decision table),
  `lib/social/follow-list-privacy.server.ts` (`canSeeFollowLists`,
  `filterBlocked(viewerId, ids)`).
- `lib/profile/api/profile.$id.followers.server.ts` and
  `profile.$id.following.server.ts` call both; the profile payload gains
  `canSeeFollowLists` for the client (in `profile.$id.server.ts` or wherever
  the profile header data is built).
- `/api/v1/users/$handle/followers.ts` and `following.ts`
  (`withDeveloperApi`) check with the key's user as the viewer;
  `lib/api/openapi.ts` documents the refusal.
- The profile edit save (`useProfileSave.ts`, `profile-edit-state.ts`) carries
  the field.
- Suggestions: the "followed by" builder in `lib/discovery/` filters its
  named members.

## Testing requirements

- Main suite `lib/social/__tests__/follow-list-privacy.test.ts`: the
  decision table (everyone, mutuals with and without the follow back, me,
  owner, admin, signed out); each of the four endpoints refuses when it must;
  blocked accounts are omitted; the suggestion lines never name a hidden
  member.
- Product suite `lib/social/__tests__/follow-list-privacy.product.test.ts`
  for the pure table.
- `components/feed/__tests__/ProfileColumn.characterization.test.tsx` and the
  profile edit test stay green.

## Acceptance criteria

- [ ] With "only me", another account sees the counts but not the lists, on
      the site and through the developer API.
- [ ] With "mutuals", a mutual sees the lists and a one-way follower does not.
- [ ] Blocked accounts never appear in a list shown to the viewer.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Hiding counts, separate settings for the two lists, hiding a single follower.
