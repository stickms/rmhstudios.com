# 02 — Your Hearthworks town on every device

Surface: Hearthworks' main menu ("Saved on this device" / "Saved to your account"), the conflict choice when two
copies differ, Settings > Cloud saves. Wave 2. Namespace `hearthworks-saves`. App tier (L8) in the game; the settings
row on the site tier.

## User story

As a member who has spent hours building a Hearthworks town on my laptop, I want it saved to my account, so that I can
carry on from my phone and do not lose the town if the browser clears its storage.

## Requirements elicitation

- **What exists (verified):**
  - Hearthworks saves one world to IndexedDB only (`features/hearthworks/engine/save/idb.ts`: `saveWorld`,
    `loadWorld`, database `hearthworks`, store `worlds`), every `AUTOSAVE_MS`, on `visibilitychange` and `pagehide`
    (`features/hearthworks/ui/HearthworksGame.tsx`). `GAME_CAPABILITIES.hearthworks.save` is `'local-only'`
    (`lib/game-capabilities.ts`). The device-data registry already lists the store (`hearthworks-saves`,
    `lib/device-data/registry.ts`).
  - The save is a versioned binary (`features/hearthworks/engine/save/format.ts`: `encodeWorld`, `decodeWorld`, a
    four-byte magic, `SAVE_VERSION`, migrations `migrateToCity` and `migrateCityToV3`, a zod `worldSchema`), up to
    8 MB; a 96 × 96 world is JSON arrays of terrain, height and city cells.
  - The shared save table: `GameSave` (`prisma/schema/games.prisma`) through `GET` / `POST` / `DELETE`
    `/api/game-saves/$gameId` (`lib/game-saves/api/game-saves.$gameId.server.ts`), allowed only for ids in
    `SHARED_SAVE_GAMES` (`lib/game-saves/registry.ts`, today `void-breaker` and `neon-driftway`), capped at
    `MAX_SAVE_BYTES` (500,000 bytes of JSON). The registry's header says a game is added "in the same commit that
    teaches the game to save". Snapshots and the cloud-saves page (`lib/game-saves/snapshots.server.ts`, Settings >
    Cloud saves) read `SHARED_SAVE_GAMES`, so a new id appears there.
  - The client kit: `createCloudSave` (`lib/game-saves/cloud-save.ts`) assumes a `localStorage` copy (`localKey`), which
    cannot hold a multi-megabyte world, but its `readJsonWithDeadline` (8 s deadline) and
    `chooseSave` / `SaveSummary` from `lib/game-saves/conflict.ts` are reusable, and
    `components/shared/SaveConflictDialog.tsx` is the shared choice (Temple of Joy uses it). Its `jsonTransport` is not reusable as is: its `write`
    sends with `keepalive: true` and its `beacon` uses `sendBeacon`; **both cap the body at 64 KB** (its own comment),
    which a gzipped town can pass.
  - The save `POST` (`lib/game-saves/api/game-saves.$gameId.server.ts`) is a plain last-writer-wins `upsert`: it has
    no compare-and-set, so a second device that opened the town earlier and keeps autosaving silently overwrites the
    newer copy another device uploaded in between. Nothing in the shared table prevents that today.
- **Decisions:**
  - **The local copy stays IndexedDB and stays first**: it is written as today, then the account copy, never the other
    way. A guest's world stays local; signing in offers "Save this town to your account".
  - **Account payload:** `{ v: 1, enc: 'gzip-b64', data, summary }` where `data` is the base64 of `encodeWorld`'s bytes
    gzipped with the browser's `CompressionStream('gzip')` (decoded with `DecompressionStream`, then `decodeWorld`, so
    every existing migration and the zod schema still apply). `summary` is `{ savedAt, tick, population, coins,
    buildings }` for the conflict choice. A payload over `MAX_SAVE_BYTES` is not sent; the menu says "This town is too
    large to save to your account" (no cap is raised).
  - **When:** the account copy is written at most every five minutes while playing, only when the world changed since
    the last account write (`tick` moved), with a plain `fetch` (no `keepalive`, which caps the body at 64 KB). On
    `pagehide` it is sent by `beacon` **only when the body is at most 60,000 bytes**; a larger town relies on the
    periodic upload and on the local copy, which is always written first. A joined (shared) world is never uploaded;
    the stashed offline world is, as locally.
  - **Compare-and-set (the second-device case):** the save `POST` gains an optional `expectedUpdatedAt` (an ISO
    time, or `null` meaning "there must be no row yet"). When present, the write happens inside the existing
    transaction only if the stored row's `updatedAt` equals it (an `updateMany` on `{ userId, gameId, updatedAt }`,
    or a `create` that a unique violation turns into the refusal); otherwise it answers `409` with
    `{ error: 'Save changed elsewhere', updatedAt }` and writes nothing. Absent, the endpoint behaves exactly as today,
    so Void Breaker and Neon Driftway are unchanged. Hearthworks always sends it (the `updatedAt` it last read or
    wrote); a `409` stops uploads for the session and shows the conflict choice the next time the menu opens, never
    overwriting either copy. The beacon carries it too, so a stale tab's last gasp is refused rather than applied.
  - **Conflicts:** on opening, the local and account copies are compared with `chooseSave` over monotonic counters
    (`tick`, `buildings`, `population`); a divergence opens `SaveConflictDialog` with both summaries; nothing is
    overwritten without the player's choice.
  - **Ownership:** the IndexedDB key gains the signed-in member's id stamp the way `createCloudSave` stamps
    `localStorage` (a world written by another signed-in account is not offered), keeping `SLOT` for guest saves.
  - **Capabilities:** `hearthworks.save` becomes `'shared-table'`; `hearthworks` joins `SHARED_SAVE_GAMES`.
  - **Export and erasure:** the account copy is a `GameSave` row, already exported and erased with every other shared
    save; nothing new to classify.

## Functional requirements

1. FR-1 `features/hearthworks/engine/save/cloud.ts` (new, client-safe): `packWorld(world)` → payload,
   `unpackWorld(payload)` → `World | null` (decompress, `decodeWorld`, never throws), `summaryOf(world)`,
   `monotonicOf(world)`, `HEARTHWORKS_CLOUD_BYTES = MAX_SAVE_BYTES`.
2. FR-2 `features/hearthworks/engine/save/account.ts` (new): the sync controller over its own transport for
   `/api/game-saves/hearthworks` (`readJsonWithDeadline` for the read; a plain `fetch` `POST` carrying
   `expectedUpdatedAt`; the size-gated beacon): `resolveOnOpen(local)` → `{ kind: 'resolved', world } | { kind:
   'conflict', local, cloud }`, `uploadIfChanged(world)` (throttled; stops after a `409`), `beaconOnHide(world)`;
   signed out, every call is a no-op.
3. FR-3 `features/hearthworks/engine/save/idb.ts`: an owner stamp stored beside the world; `loadWorld` returns the
   world with its owner, and a world stamped by another account is not loaded.
4. FR-4 `features/hearthworks/ui/HearthworksGame.tsx` wires the controller; `features/hearthworks/ui/MainMenu.tsx`
   shows where the town is saved, "Save this town to your account" for a signed-in member with a local-only world,
   the too-large line, and opens `SaveConflictDialog`.
5. FR-5 `lib/game-saves/registry.ts`: `'hearthworks'` in `SHARED_SAVE_GAMES` (and its header comment);
   `lib/game-capabilities.ts`: `save: 'shared-table'`.
6. FR-6 `lib/game-saves/api/game-saves.$gameId.server.ts`: the optional `expectedUpdatedAt` compare-and-set above
   (zod-validated: `z.string().datetime().nullable().optional()`), the `409` body, and the existing snapshot step kept
   inside the same transaction; the client type in `lib/game-saves/saves.contract.ts` gains the optional field and the
   `409` shape. The transport Hearthworks uses is its own (`account.ts`), built from `readJsonWithDeadline`; the shared
   `jsonTransport` is not changed.

## Non-functional requirements

- **Safety of the save:** a failed upload, a timeout or an offline page never touches the local copy; an unreadable
  account copy is ignored (logged once), never loaded.
- **Bandwidth:** at most one upload per five minutes of play and only on change; the payload is gzipped.
- **No lost progress across devices:** with two browsers open on one account, the older one's next upload is refused
  (`409`) and neither copy is overwritten; a test drives the route with a stale `expectedUpdatedAt`, a matching one,
  `null` against an existing row, and the field absent (today's behaviour).
- **Privacy:** the payload carries no other player's data (a shared world is never uploaded).
- **Browser support:** where `CompressionStream` is missing the account copy is skipped and the menu says so; local
  saving is unchanged.

## Data model and API

No schema change. Uses `GET` / `POST` / `DELETE /api/game-saves/hearthworks` (allowed once the id is registered).

## Testing requirements

- Product suite `features/hearthworks/engine/save/__tests__/cloud.product.test.ts`: pack then unpack returns an equal
  world (with Node's `CompressionStream`); a corrupt or oversized payload unpacks to `null`; summary and monotonic
  figures.
- Main suite `features/hearthworks/engine/save/__tests__/account.test.ts`: conflict versus resolved choices, a local
  copy is never overwritten without a choice, throttling, shared worlds never uploaded, signed-out no-ops, a `409`
  stopping uploads, no beacon above 60,000 bytes (transport faked).
- Main suite `lib/game-saves/__tests__/save-compare-and-set.test.ts` (new): the four `expectedUpdatedAt` cases above
  through the route handler, with the Prisma fake wrapped in `shapeChecked`.
- `lib/game-saves/__tests__/` registry and snapshot tests, `lib/__tests__/game-capabilities.test.ts` and `lib/__tests__/game-capabilities-coverage.test.ts` (the save claim
  against `SHARED_SAVE_GAMES`), `components/settings/__tests__/device-registry.test.ts`.

## Acceptance criteria

- [ ] A signed-in member's town reaches their account within five minutes of play and loads on a second browser.
- [ ] When both copies changed, the member chooses between two summaries and the other copy is kept until they do.
- [ ] A guest's town never makes a network request, and signing in offers to save it.
- [ ] Settings > Cloud saves lists Hearthworks.
- [ ] With the town open in two browsers, the one that saved second-to-last cannot overwrite the newer account copy;
      it offers the choice instead.

## Out of scope

Several town slots, uploading shared (joined) worlds, raising the shared save cap, a server-side world viewer.
