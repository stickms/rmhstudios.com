# 10 — Admin lookup

Surface: a new admin page `/admin/lookup` and a lookup field at the top of the
admin hub (`app/routes/_site/admin/index.tsx`). Wave 7. Namespace
`admin-lookup`.

## User story

As a moderator handed an id, a handle, an e-mail address or a link from a
report, a support message or a log line, I want to paste it into one box and get
what it is, its state, and links to the tools that act on it — instead of
guessing which admin page knows about that kind of id.

## Requirements elicitation

- **What exists (verified):** admin pages each search their own kind: users
  (`/admin/users?q=&open=`, `validateSearch` in
  `app/routes/_site/admin/users.tsx`), reports (`/admin/reports`,
  `parseTriageSearch`), the audit log (`/admin/audit`, filters by action/target
  type, `listAuditLogApi`), builds, communities via handover tools. Nothing
  resolves an arbitrary identifier (`grep -ri "adminLookup\|quickFind"` finds
  nothing). Log lines and reports carry cuids, uuids and site URLs.
- **Decisions:** one endpoint classifies the input and looks it up in a fixed,
  ordered set of resolvers. Recognised inputs: a site URL or path (parsed
  against known route shapes: `/u/$userid`, `/u/$userid/post/$id`,
  `/thread/$rootId`, `/c/$slug`, `/tournaments/$id`, `/jams/$slug`,
  `/create/builds/$slug`, `/replays/$id`, `/library/$slug`, `/news/$slug`,
  `/blog/$slug`), `@handle` or a bare handle, a full e-mail address (exact match
  only), and an id (cuid, uuid or bigint) tried against: user, post (`RMHark`),
  comment, community, event, tournament, user build, replay, content report,
  moderator note's subject, outbox event, pg-boss job is excluded (02 has its
  own page). **Direct and group messages are never resolved** (reading members'
  private messages is not a lookup's job). Results show state (deleted, banned
  until, hidden, private community, cancelled) and links: the public page (when
  one exists), the matching admin tool pre-filtered, and "Audit log for this
  target".
- Each lookup is written to the admin audit log (`logAdminAction`, action
  `admin.lookup`, the input kind and the ids found). An e-mail input is recorded
  as the kind `email` and the matched user id only — never the address itself.

## Functional requirements

1. FR-1 `/admin/lookup?q=` shows a search field and the results; the admin hub
   gets the same field, submitting to the page.
2. FR-2 Each result row: kind, a label (name, handle, title or the first 80
   characters of a post), created time, state badges as `t-meta` text, and links
   (public page, admin tool, audit log).
3. FR-3 A URL from another host or an unrecognised path says "Not a link to this
   site" / "No page with that address"; an unknown id says "Nothing found" and
   lists what was tried.
4. FR-4 An id that matches several kinds (rare) lists all matches.
5. FR-5 Pressing Enter in the field runs the lookup; the URL keeps `q` so a
   result can be shared between admins.

## Non-functional requirements

- **Security:** `auth: 'admin'`; `rateLimit: { limit: 60, windowMs: 60_000,
  prefix: 'admin-lookup' }`; `q` zod-validated (1–500 chars, trimmed); URLs
  parsed with `new URL` against the site origin only — never fetched. Results
  never include message bodies, e-mail addresses of other matches, IP data or
  session data. The `createServerFn` loader, if any, guards with
  `requireAdminServerFn` inside its handler.
- **Performance:** resolvers run in parallel with `findUnique`/`findFirst` on
  primary keys or unique columns only (no scans); id resolvers run only when the
  input matches that id's shape.
- **i18n:** `admin-lookup`; kind names are literal keys in one map (no computed
  keys — the sprint 04 ratchet).
- **Steel:** results are rows on rules; the field is the shared search field; no
  badges with fills (state is muted text, banned/deleted in `text-site-danger`).
- **Accessibility:** results region is `aria-live="polite"` with a count; links
  have discernible text.

## Data model and API

No schema change. `lib/admin/lookup.ts` (pure: classify input, parse site paths
into `{ kind, key }`), `lib/admin/lookup.server.ts` (resolvers, audit write),
contract `lib/admin/lookup.contract.ts`, module
`lib/admin/api/admin.lookup.server.ts` (GET `?q=`).

## Testing requirements

- Product suite `lib/admin/__tests__/lookup.product.test.ts`: classification of
  cuids, uuids, bigints, handles, e-mails, site URLs (each route shape), foreign
  URLs, junk.
- Main suite `lib/admin/__tests__/admin-lookup.test.ts`: non-admin 403; a user
  id resolves with ban state; a post URL resolves to the post; an e-mail matches
  exactly and the audit row does not contain it; a direct-message id returns
  nothing; resolvers only run for matching shapes.

## Acceptance criteria

- [ ] Pasting a profile URL, a handle, a post id or a report id finds the right
      thing with working admin links.
- [ ] Message ids never resolve.
- [ ] The audit log records each lookup without raw e-mail addresses.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Full-text search across content (the site search exists), resolving private
messages, bulk lookups.
