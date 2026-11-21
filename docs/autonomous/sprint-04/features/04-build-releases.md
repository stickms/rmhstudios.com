# 04 — User Build releases

Surface: the build page (`app/routes/_site/builds/$slug.tsx` →
`components/user-builds/BuildDetail.tsx`), its owner controls, notifications,
and the `rmhcode` CLI (`rmhcode/src/`). Wave 2. Namespace `build-releases`.

## User story

As a member who publishes a User Build, I want to publish a release — a
version number and what changed — so that people who watch or bought my
build hear about it and anyone can read the history; and as a member who
watches or unlocked a build, I want to know when a new version ships.

## Requirements elicitation

- **What exists (verified):** `BuildVersion { version, changelog, commitHash }`
  (`prisma/schema/builds.prisma`) exists and `BuildDetail.tsx` renders a
  "Version History" card from `build.versions` — but **nothing writes a
  `BuildVersion`**: no endpoint, CLI command or script creates one
  (`grep buildVersion.create` finds nothing), so the card never appears.
  `BuildManifestRecord.versionId` (`prisma/schema/rmhvibe.prisma`) also points
  at versions. Watching a build exists (`Watch` kind `build`,
  `lib/discovery/watch.server.ts`), but the only event wired for builds is a
  new comment (`watchBuildComment`). The CLI (`rmhcode/src/commands/`) has
  `login`, `whoami`, `push-build`, `list-builds`, `logout`; endpoints accept a
  session or a CLI token through `getAuthenticatedUser` (`lib/rmhcode-auth.ts`,
  used by `lib/api/routes/user-builds.server.ts`).
- **Decisions:** a release is `version` (1–20 characters,
  `^[0-9A-Za-z][0-9A-Za-z.+-]*$`, unique per build), `changelog` (Markdown,
  up to 5,000 characters, rendered with the site's sanitised Markdown
  components) and an optional `commitHash` (7–40 hex). Order is by creation
  time; the newest is "Latest". The owner may delete a release (a typo); a
  deleted release does not notify again when re-published with the same
  version. Only `PUBLIC` builds notify; `UNLISTED` and `PRIVATE` builds keep
  a history silently. Notified: watchers at level `all` or `important` (a
  release is always important) and members who unlocked the build
  (`BuildUnlock`), deduplicated, minus blocks and mutes, at most 500.

## Functional requirements

1. FR-1 The build page shows a "Releases" section (replacing the dead card):
   the latest release expanded (version, date, rendered changelog, short
   commit hash linked to `repoUrl` when it is a GitHub URL), older ones
   collapsed under "Earlier releases (n)".
2. FR-2 The owner sees "New release" opening a dialog: version, changelog
   (with a Preview tab via `components/ui/tabs.tsx`), commit hash; Publish
   creates it and the section updates.
3. FR-3 The owner can delete a release (confirm dialog).
4. FR-4 Watchers and unlockers get one notification: "{{title}} {{version}}
   is out" linking to the build page's releases section.
5. FR-5 `rmhcode release [--version <v>] [--notes <file>] [--commit <sha>]`
   publishes a release for a build chosen from the member's builds (or
   `--build <slug>`); with no `--commit` it uses `git rev-parse HEAD` when the
   directory is a git checkout. `rmhcode list-builds` shows each build's latest
   version.
6. FR-6 The public build API (`/api/v1/builds/**`) lists releases of public
   builds (version, changelog, date) — read-only, existing scopes.

## Non-functional requirements

- **Security:** create and delete require the build's owner (session or CLI
  token through `getAuthenticatedUser`; `auth: 'none'` plus that check, as the
  existing build endpoints do), rate-limited `{ limit: 10, windowMs: 3600_000 }`
  per user for create. Every field zod-validated; the changelog is rendered
  only through the existing sanitising Markdown pipeline (no raw HTML).
  Releases of a `PRIVATE` build are visible only to its owner; `UNLISTED`
  only on the build page itself.
- **Performance:** `@@index([buildId, createdAt(sort: Desc)])`; the build page
  loads the latest 20 releases; notifications go out after the response
  (`queueMicrotask`-free: call the hook after the write, the way
  `watchBuildComment` is called) and are capped at 500.
- **Privacy:** releases are build content and stay with the build; no
  per-member table.
- **Accessibility:** releases are a list; the collapse is a disclosure button
  with `aria-expanded`; the dialog fields are labelled and errors are tied with
  `aria-describedby`.
- **i18n:** UI strings in `build-releases` (CLI output stays English, like
  the rest of the CLI); dates via `Intl.DateTimeFormat`.
- **Steel:** releases are rows on rules; the changelog is `t-prose`; "New
  release" is the owner view's quiet button (the page's ink primary stays
  where it is); the dialog is the standard overlay.

## Data model and API

- `BuildVersion` gains `@@unique([buildId, version])` and
  `@@index([buildId, createdAt(sort: Desc)])`. Migration
  `20261124020100_s04_build_releases`.
- `lib/builds/releases.ts` (pure: version rule, GitHub commit link, ordering),
  `lib/builds/releases-schema.ts`, `lib/builds/releases.contract.ts`,
  `lib/builds/releases.server.ts` (`createRelease`, `deleteRelease`,
  `listReleases(buildId, viewer)`, `notifyRelease`).
- Module `lib/builds/api/user-builds.$id.releases.server.ts` (`GET`, `POST`)
  and `user-builds.$id.releases.$releaseId.server.ts` (`DELETE`).
- `lib/discovery/watch.server.ts`: `watchBuildRelease(buildId, actorId,
  preview)` using `notifyWatchers` with `important: () => true`, plus the
  unlockers (same block and mute filtering).
- CLI: `rmhcode/src/commands/release.ts`, registered in `rmhcode/src/index.ts`;
  `list-builds.ts` prints the latest version.
- `/api/v1/builds/$slug` (route file, `withDeveloperApi`) includes
  `releases`; update `lib/api/openapi.ts` for the new field.

## Testing requirements

- Main suite `lib/builds/__tests__/build-releases.test.ts`: only the owner
  (session or CLI token) can create or delete; a duplicate version is 409;
  a private build's releases are hidden from others; notifying skips blocked
  and muted members and private builds, and includes unlockers once.
- Product suite `lib/builds/__tests__/releases.product.test.ts`: version
  rule, commit link, ordering.
- `components/user-builds/__tests__/BuildReleases.test.tsx`: latest
  expanded, older collapsed, owner controls only for the owner.

## Acceptance criteria

- [ ] The owner publishes v1.1 from the build page and from `rmhcode release`;
      both appear under Releases.
- [ ] A watcher and an unlocker each get one notification.
- [ ] A private build's releases are not visible to others.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Uploading release artifacts, semantic-version ordering, release drafts,
release comments.
