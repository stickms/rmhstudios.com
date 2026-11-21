# 13 — RMHBox host presets

Surface: the host's game-settings step in RMHBox
(`components/rmhbox/GameSettingsModal.tsx`, `GameSettingsForm.tsx`,
`GameSettingsPhase.tsx`). Wave 6. Namespace `rmhbox-presets`.

## User story

As someone who hosts RMHBox every week, I want to save the settings I like
for each minigame — round count, timers, categories — under a name, pick one
in a click, and have my favourite applied automatically, so that every party
does not start with me re-entering the same eight values.

## Requirements elicitation

- **What exists (verified):** each minigame declares a settings schema in
  `lib/rmhbox/minigame-registry.ts` (`RHYME_TIME_SETTINGS`,
  `CATEGORY_CRASH_SETTINGS`, …); `lib/rmhbox/game-settings.ts` builds
  defaults and validates values (`validateGameSettings`), and the server
  re-validates what the host submits (`server/rmhbox/game-coordinator.ts`).
  The host edits values in `GameSettingsForm.tsx` every time; the only
  persistence is the player's own client settings in the RMHBox Zustand store
  (`lib/rmhbox/store.ts`, audio and display, `localStorage`). Nothing stores
  host settings (`grep` for presets finds nothing).
- **Decisions:** presets are per member and per minigame, server-side (a
  host moves between a laptop and the Discord activity), at most 10 per
  minigame and 100 in total. Values are validated against the minigame's
  schema **on save** and again **on apply** (a schema change between the two
  drops unknown keys and fills defaults, with a notice "Some settings were
  reset because the game changed"). One preset per minigame may be the
  default, applied when the host selects that minigame. Applying a preset
  only fills the form; the host still confirms, and the existing socket path
  sends the values (the coordinator's validation is unchanged).

## Functional requirements

1. FR-1 The settings step shows a "Preset" select above the form: "Game
   defaults", then the host's presets for this minigame; choosing one fills
   the form.
2. FR-2 "Save as preset" asks for a name (1–40 characters, unique per
   minigame) and saves the current values; "Update" overwrites the selected
   one; "Rename" and "Delete" (confirm) manage it.
3. FR-3 "Use by default" marks one preset; when the host picks that minigame
   the form opens with it applied and the select shows its name.
4. FR-4 The 11th preset for a minigame is refused with "You can keep 10
   presets per game".
5. FR-5 Presets are listed in a "Manage presets" view in RMHBox settings
   (`components/rmhbox/SettingsMenu.tsx`): per minigame, with rename and
   delete, for hosts who want to tidy up outside a lobby.

## Non-functional requirements

- **Security:** session-only endpoints, scoped to the caller; `minigameId`
  checked against the registry; `values` a JSON object validated with the
  minigame's schema through `validateGameSettings` (unknown keys dropped,
  bounds enforced) and limited to 4 KB; names zod-bounded. Caps checked in a
  transaction under `pg_advisory_xact_lock(hashtext('rmhbox-presets:' ||
  userId))`; setting a default clears the previous one in the same
  transaction.
- **Performance:** one `GET` per minigame selection
  (`@@index([userId, minigameId])`), cached in React Query for the session.
- **Privacy:** presets erased under `s04-13`; `exportRmhboxPresets(userId)`.
- **Accessibility:** the select and the dialogs are labelled; the reset notice
  is a polite live region.
- **i18n:** strings in `rmhbox-presets`; preset names are the member's own
  text and are not translated.
- **Design:** RMHBox is a full-screen app (L8) and keeps its own look
  (`--app-*`); use the controls the settings form already uses.

## Data model and API

- New model in `prisma/schema/games/rmhbox.prisma`: `RmhboxSettingsPreset {
  id String @id @default(cuid()), userId String, minigameId String
  @db.VarChar(40), name String @db.VarChar(40), values Json, isDefault
  Boolean @default(false), createdAt, updatedAt }`, `@@unique([userId,
  minigameId, name])`, `@@index([userId, minigameId])`,
  `@@map("rmhbox_settings_preset")`; back-relation on `User` under `s04-13`.
  Migration `20261124060000_s04_rmhbox_presets`.
- `lib/rmhbox/presets.ts` (pure: caps, normalising values against a schema,
  the reset notice), `presets-schema.ts`, `presets.contract.ts`,
  `presets.server.ts`.
- Modules `lib/rmhbox/api/rmhbox.presets.server.ts` (`GET ?minigame=`,
  `POST`) and `rmhbox.presets.$id.server.ts` (`PATCH`, `DELETE`).
- `components/rmhbox/PresetBar.tsx` used by `GameSettingsForm.tsx`;
  `components/rmhbox/ManagePresets.tsx` in the settings menu.

## Testing requirements

- Main suite `lib/rmhbox/__tests__/rmhbox-presets.test.ts`: another member
  cannot read, change or delete a preset; values outside the schema are
  rejected or normalised; the 11th is refused under the lock; one default per
  minigame.
- Main suite `lib/account/__tests__/rmhbox-presets-erasure.test.ts`.
- Product suite `lib/rmhbox/__tests__/presets.product.test.ts`: normalising
  against a changed schema, the reset notice.

## Acceptance criteria

- [ ] A host saves "Quick round" for Rhyme Time, makes it default, and the
      next lobby opens Rhyme Time settings with it applied.
- [ ] A preset saved before a settings key was removed applies with the
      notice and no error.
- [ ] RMHBox's supported colour modes, 390 px and 1280 px, `ar`.

## Out of scope

Sharing presets with other hosts, presets for a whole party playlist,
per-lobby templates.
