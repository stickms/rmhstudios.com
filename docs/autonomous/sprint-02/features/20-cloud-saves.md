# 20 — Cloud save manager and snapshots

Surface: new `/settings/cloud-saves`. Wave 6. Namespace `cloud-saves`.

## User story

As a player of the site's single-player games, I want to see my cloud saves,
download a backup, restore an earlier version if a save goes wrong, and delete a
save on purpose, so that hours of progress are never one bad autosave away from
being lost.

## Requirements elicitation

- **What exists (verified):** one JSON blob per member and game (`GameSave`,
  `prisma/schema/games.prisma`) through
  `lib/game-saves/api/game-saves.$gameId.server.ts` (GET, POST upsert, DELETE)
  for the allow-listed games in `lib/game-saves/registry.ts` (`void-breaker`,
  `neon-driftway`, unlisted `balatro`), with client conflict handling
  (`lib/game-saves/cloud-save.ts`, `components/shared/SaveConflictDialog.tsx`).
  **Each POST overwrites the previous save with no history, and there is no page
  that lists saves** — the only way to see or remove one is inside each game.
- **Decisions:** keep automatic snapshots of the previous blob when a save is
  overwritten and the last snapshot is older than 6 hours, plus a snapshot
  before every restore and delete; keep 10 per game (oldest pruned in the same
  transaction). Snapshots count against no quota visible to members but are
  bounded: 10 × `MAX_SAVE_BYTES` per game. A backup file is
  `{ format: "rmh-cloud-save", version: 1, gameId, savedAt, saveData }`; restore
  accepts only that shape for the same game. The page lists unlisted games only
  when a save exists.

## Functional requirements

1. FR-1 `/settings/cloud-saves`: one row per game with a save — game name and
   icon from the catalog, last saved (relative and exact), size — and games
   without a save listed as "No cloud save".
2. FR-2 Download backup (a `.json` file named `<game>-<date>.json`).
3. FR-3 Restore from a backup file: validated in the browser and again on the
   server; a confirmation shows the backup's date versus the current save's.
4. FR-4 Version history per game: snapshots newest first (time, size, reason:
   automatic, before restore, before delete), each with Restore and Download.
5. FR-5 Delete a save with a confirmation; a snapshot is kept, so it can be
   restored for as long as it is among the last 10.
6. FR-6 After a restore, the game loads the restored save next time it opens
   (its `updatedAt` is newer than any local copy, so the existing conflict logic
   prefers it); the page says to reload an open game tab.
7. FR-7 The settings hub gains a Cloud saves destination (account group).

## Non-functional requirements

- **Security:** owner-only; the `gameId` must pass `isSharedSaveGame`; restore
  bodies and files are size-checked against `MAX_SAVE_BYTES` and must be JSON
  objects; snapshot ids are scoped to the user and game; `rateLimit: 'write'` on
  restore and delete; downloads are `Content-Disposition: attachment` with
  `application/json` and `nosniff`.
- **Integrity:** snapshot-then-write happens in one transaction; the existing
  autosave POST keeps its own rate limit and gains at most one extra insert per
  6 hours per game.
- **Performance:** list and snapshot metadata never select `saveData`;
  `sizeBytes` is stored.
- **Accessibility:** file input labelled; confirmations name the game and dates;
  history is a list with buttons named by date.
- **i18n:** strings in `cloud-saves`; game names from the catalog.
- **Steel:** `PageLayout` + `SettingsPageBody`; rows on rules; destructive
  actions use `--site-danger` text buttons, never a red fill.

## Data model and API

- New model `GameSaveSnapshot` in `prisma/schema/games.prisma`:
  `id BigInt @id @default(autoincrement())`, `userId`,
  `gameId String @db.VarChar(48)`, `saveData Json`, `sizeBytes Int`,
  `reason String @db.VarChar(16)`, `createdAt`; cascades on user;
  `@@index([userId, gameId, createdAt(sort: Desc)])`;
  `@@map("game_save_snapshot")`.
- Migration `20261122060200_s02_game_save_snapshots`.
- Pure `lib/game-saves/backup.ts` (`toBackupFile`, `parseBackupFile`,
  `shouldSnapshot(lastSnapshotAt, now)`, `SNAPSHOT_KEEP`).
- Server `lib/game-saves/snapshots.server.ts`; the existing POST and DELETE call
  it; contract `lib/game-saves/saves.contract.ts`; endpoints
  `GET /api/game-saves` (list, no blobs),
  `GET /api/game-saves/$gameId/snapshots`,
  `GET /api/game-saves/$gameId/snapshots/$id` (download),
  `POST /api/game-saves/$gameId/restore` (`{ snapshotId }` or `{ backup }`).
- Route `app/routes/_site/settings/cloud-saves.tsx`, `EXCLUDED_ROUTES`
  `'personal'`.
- `exportCloudSaveSnapshots(userId)` (metadata only) for the account export.

## Testing requirements

- Main suite `lib/game-saves/__tests__/snapshots.test.ts` (user data): a
  snapshot is taken only past 6 hours; retention keeps exactly 10; restore of a
  foreign snapshot is 404; a backup for another game is refused; an oversized
  backup is refused; delete leaves a snapshot.
- Product suite `lib/game-saves/__tests__/backup.product.test.ts`: file
  round-trip and shape validation.

## Acceptance criteria

- [ ] After playing Void Breaker for two sessions six hours apart, the history
      shows an automatic snapshot.
- [ ] Restoring a snapshot and reopening the game loads that progress.
- [ ] A downloaded backup restores on another browser.
- [ ] A Neon Driftway backup cannot be restored into Void Breaker.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Saves of games with their own storage (Temple of Joy, Versecraft), sharing
saves, multiple save slots.
