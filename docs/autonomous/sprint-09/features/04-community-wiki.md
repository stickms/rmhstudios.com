# 04 — Community wiki pages

Surface: `/c/$slug/wiki` (the list) and `/c/$slug/wiki/$page` (read, edit, history), a "Wiki" row on the community page,
the moderator tools. Wave 2. Namespace `community-wiki`.

## User story

As a member of a community, I want a few pages that the community keeps up together — a FAQ, a reading list, how the
weekly thread works — that anyone allowed can improve and any bad edit can be rolled back, so that the answers do not
scroll away in the feed.

## Requirements elicitation

- **What exists (verified):**
  - The service is complete and has no page: `lib/communities/pages.server.ts` (F21: `listCommunityPages`,
    `getCommunityPage`, `listRevisions`, `createCommunityPage`, `updateCommunityPage`, `rollbackCommunityPage` — "a
    rollback that is itself a revision" —, `deleteCommunityPage`, `getEditorStanding`), the policy in
    `lib/communities/page-policy.ts` (`EDIT_POLICIES` `mods | members | trusted`, `TRUSTED_MEMBER_DAYS = 30` with no
    active strikes, `canEditPage`, `refusalReason`, `MAX_PAGE_SLUG`, `MAX_PAGE_TITLE`), zod in `pages-schema.ts`, and
    three registered `defineHandler` modules `lib/communities/api/community-pages.server.ts`,
    `community-pages.$id.server.ts`, `community-pages.$id.revisions.server.ts` with no contract and no client caller.
  - `CommunityPage` / `CommunityPageRevision` (`prisma/schema/communities.prisma`) exist; the revision is classified
    `keep` in the erasure registry ("published or shared content … stays under Deleted user").
  - **What a revision row holds** (`updateCommunityPage`): on a body change it snapshots the page's **previous** body
    with the **new** editor's id and summary, then writes the new body to the page. So a revision row is "the text as it
    was before <editor> changed it, with <editor>'s summary"; the current text lives only on the page. The update reads
    the page outside its transaction and writes with a plain `update`, so two editors can overwrite each other silently.
  - `components/communities/DocEditor.tsx` (344 lines: a prop-driven markdown editor with a summary field, `DocBody` and
    `DOC_PROSE_CLASS`) was written "for community wiki pages (F21) and game guides" and is imported by nothing.
  - The reads check privacy in their handlers (the list and the page-by-slug in `community-pages.server.ts`, the history
    in `community-pages.$id.revisions.server.ts`: a private community's non-members get 404). The writes rely on
    `getEditorStanding` (role, membership age, active strikes): nothing checks a community **timeout** (a timed-out
    member is still a member and can edit) or a site ban, and the service functions do not check privacy themselves, so
    a future caller would skip it.
  - `app/routes/_site/c.$slug.tsx` has a loader, so a child route file `c.$slug.wiki.tsx` would nest under it; the
    existing sibling `c.$slug_.invite.$code.tsx` shows the `_` un-nesting suffix.
- **Decisions:**
  - **Routes:** `app/routes/_site/c.$slug_.wiki.index.tsx` and `app/routes/_site/c.$slug_.wiki.$page.tsx` (both
    un-nested from the community route), each with a `createServerFn` loader that returns 404 for a private community's
    non-members **inside its handler**.
  - **Contracts:** `lib/communities/pages.contract.ts` declares the six endpoints; the three modules move from bare
    `defineHandler` to `implement()` with the same paths, auth and rate limits (no behaviour change for callers, of
    which there are none).
  - **Visibility on every path:** the list, one page, its revisions and every write apply one helper
    `pageAccess(communityId, viewerId)`: a private community's pages are for members only (404 otherwise); a member
    banned from the community (`activeSanction` kind `ban`) reads like a non-member of a private community and cannot
    write; a timed-out member reads but cannot write; a site ban refuses writes (as the composer does). The helper is
    added to `BAN_ENFORCEMENT_PATHS` (`lib/communities/bans.ts`).
  - **Who edits:** the page's `editPolicy` decides (mods / members / trusted), exactly as `canEditPage` says; the
    refusal is shown as one line ("Only members who joined 30 days ago with no strikes can edit this page"). Creating
    and deleting a page and changing its policy or pin are moderator actions recorded in the community mod log under new
    actions `wiki_page_created`, `wiki_page_deleted`, `wiki_page_rolled_back`, `wiki_policy_changed`
    (`lib/communities/modlog.ts`); an ordinary edit is in the page's history, not the mod log.
  - **Reading:** the page renders through `DocBody` (markdown, the site's existing renderer, links underlined in running
    text, Y3). "History" is a tab (`components/ui/tabs.tsx`) listing edits as rows on rules: editor (`<bdi>` name,
    "Deleted user" for a tombstone), time, summary. Each row is presented as what it is — "Before this edit" opens the
    snapshot read-only, and the newest row's "after" is the current page — with "Restore this version" for editors (a
    confirm), which calls the rollback.
  - **Editing:** `DocEditor` with the summary field; a draft of an unsaved edit is kept in `sessionStorage` per page (a
    device-data registry line) so a reload does not lose it.
  - **Linking:** the community page gains one "Wiki" row (rule-separated, a count of pages) in its sidebar or about
    block; the list is pinned pages first, then by last edit.
  - **SEO:** a public community's page has its own `head()`: title "<page> — <community> wiki", the first 160 characters
    of its text as description, the community's icon or the communities section card (as `c.$slug.tsx` does). Private:
    `noindex`. Sitemap: both `$param` routes in `DYNAMIC_ROUTES` under the `s09-04` anchor; public pages of public
    communities are listed by `lib/sitemap.server.ts` the way guides are.
  - **Export:** `exportCommunityPageRevisions(userId)` (community slug, page slug, page title, summary, created at)
    under the `s09-04` anchor — the member's own edits. **No body:** a revision row's body is the text _before_ the
    member's edit, often someone else's words, so exporting it would hand another member's text to this member as
    theirs.

## Functional requirements

1. FR-1 The contract and the three modules on `implement()`.
2. FR-2 `pageAccess` on every read and write; `BAN_ENFORCEMENT_PATHS` entry.
3. FR-3 The two routes: list, read, edit, history, restore, create, delete, policy and pin controls for moderators.
4. FR-4 The "Wiki" row on the community page.
5. FR-5 Mod-log actions and their labels.
6. FR-6 SEO, sitemap, OG coverage; the export section.

## Non-functional requirements

- **Security:** body length and slug shape are validated by the existing zod; markdown renders through the existing
  sanitising renderer (no raw HTML); the rate limits stay as they are.
- **Correctness:** an edit based on an older version than the current one is refused with "Someone else edited this
  page; reload to see their changes" (`409`). The service does not check today: the update schema gains `baseUpdatedAt`
  (ISO), and `updateCommunityPage` writes the revision and the page inside its transaction with
  `updateMany({ where: { id, updatedAt: baseUpdatedAt } })`, refusing when it updates nothing (the revision insert is
  rolled back with it). Rollback takes the same check.
- **Design:** Steel: rows on rules for the list and history; the editor's fields are controls; one ink primary ("Save
  page"); loading, empty ("No pages yet"), error and signed-out states.
- **Accessibility:** tabs are the shared primitive; the restore confirm is `useConfirm`.

## Data model and API

- No schema change. New `lib/communities/pages.contract.ts`, `lib/communities/page-access.server.ts`,
  `components/communities/wiki/*`, the two route files. Edits: the three `community-pages*.server.ts` modules,
  `lib/communities/pages.server.ts` (conflict check), `lib/communities/bans.ts`, `lib/communities/modlog.ts` and its
  labels, `components/communities/DocEditor.tsx` (props only if needed — 05 adopts it next wave),
  `app/routes/_site/c.$slug.tsx` (one row), `lib/sitemap.ts` (anchor), `lib/sitemap.server.ts`,
  `lib/device-data/registry.ts`, `lib/account/export-sprint-09.server.ts` (anchor).

## Testing requirements

- Main suite `lib/communities/__tests__/page-access.test.ts`: private community non-member 404 on list, page, revisions
  and writes; banned member refused; timed-out member reads and cannot write; site ban refuses writes.
- Main suite `lib/communities/__tests__/wiki-pages-api.test.ts`: the contract's handlers keep their paths and limits;
  the conflict refusal; rollback writes a revision; mod-log rows for create, delete, rollback, policy.
- Main suite `lib/account/__tests__/wiki-export.test.ts`: the member's edits only, with no body field.
- `lib/api/__tests__/route-table.test.ts`, the ban-enforcement registry test, `lib/__tests__/sitemap-coverage.test.ts`,
  `lib/__tests__/og-page-coverage.test.ts`, the device-data registry test.

## Acceptance criteria

- [ ] A moderator creates "FAQ" with policy "members"; a member edits it with a summary; the history shows both;
      restoring the first version adds a third revision.
- [ ] A non-member of a private community gets 404 on the page, its history and the API.
- [ ] A member banned from the community cannot edit; a timed-out member sees "You can edit again after …".
- [ ] The wiki page of a public community unfurls with its own title.

## Out of scope

Page comments, page-level permissions per member, cross-community links, attachments, a diff view (05 adds one for
guides).
