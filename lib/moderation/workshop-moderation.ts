/**
 * Reports of the TF2 workshop and Versecraft's story gallery (sprint 15, feature 04), client-safe half.
 *
 * Three kinds of member-made, publicly listed item have a report path: a HUD (`tf2-hud`, the `Tf2Hud` id), a loadout
 * (`tf2-loadout`, the `Tf2Loadout` id) and a shared story (`versecraft-seed`, the `VersecraftSeedListing` id). A
 * moderator's removal stamps `moderatedAt`; a HUD or a loadout is also made `PRIVATE` in the same write, so a later
 * restore that clears the stamp never republishes it on the owner's behalf. Every reader of the three tables shows only
 * rows where the stamp is null to anyone but the owner, who still sees the row, marked, and cannot make it public,
 * rename it or fork it again. A listing leaves the gallery and its world stays (other players' saves may be on it); a
 * HUD's content-addressed blobs are never deleted by a takedown, other HUDs may share them.
 */

export const WORKSHOP_REPORT_TYPES = ['tf2-hud', 'tf2-loadout', 'versecraft-seed'] as const;
export type WorkshopReportType = (typeof WORKSHOP_REPORT_TYPES)[number];

export function isWorkshopReportType(type: string): type is WorkshopReportType {
  return (WORKSHOP_REPORT_TYPES as readonly string[]).includes(type);
}

/** Characters of an item's text a moderator reads in the queue. */
export const WORKSHOP_REPORT_PREVIEW_CHARS = 420;

/** The thrown message for a write to an item a moderator removed; the routes answer `GAME_CONTENT_REMOVED_BY_MODERATOR`. */
export const WORKSHOP_CONTENT_REMOVED = 'REMOVED_BY_MODERATOR';

/**
 * A `where` for the author's account: not banned now (`User.bannedUntil` empty or already past). Put it under the
 * `owner` (a HUD, a loadout) or `author` (a story) relation of a public list.
 */
export function notBannedWhere(now: Date): { OR: ({ bannedUntil: null } | { bannedUntil: { lte: Date } })[] } {
  return { OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }] };
}

/**
 * Every server file that reads `tf2Hud`, `tf2Loadout` or `versecraftSeedListing` to show a row to someone else (or to
 * count one). Each must filter `moderatedAt: null` for anyone but the owner. The scan in
 * `lib/moderation/__tests__/workshop-read-paths.test.ts` finds every file that reads one of the three through
 * `prisma` or a transaction, and fails a file that is in neither this list nor `WORKSHOP_EXEMPT_PATHS`, a listed file
 * that does not filter, and a listed read that ignores `moderatedAt` without being named in
 * `WORKSHOP_UNFILTERED_READS`. (`lib/shop/loadouts.server.ts` reads cosmetic loadout presets, not the workshop's
 * `Tf2Loadout`, so it is not here; `versecraft.seeds.fork.server.ts` only writes, with `moderatedAt: null` in its
 * `where`, and a test in the same suite holds that.)
 */
export const WORKSHOP_READ_PATHS = [
  'lib/moderation/workshop-moderation.server.ts',
  'lib/tf2-hud/hud.server.ts',
  'lib/tf2-loadout/loadout.server.ts',
  'lib/versecraft/api/versecraft.seeds.$id.server.ts',
  'lib/versecraft/api/versecraft.seeds.rate.server.ts',
  'lib/versecraft/api/versecraft.seeds.server.ts',
] as const satisfies readonly string[];

/** Files that touch the tables without showing a row to anyone but its owner or an admin, each with its real reason. */
export const WORKSHOP_EXEMPT_PATHS: Readonly<Record<string, string>> = {
  'lib/moderation/removal-restore.server.ts':
    's15-16: reads one title per removed HUD, loadout or story, for its author\'s own "Removed after a report" list (filtered on the author) or for an admin reading a requested review, and clears `moderatedAt` on a restore. It returns the title to nobody else, and a restore never makes the item public (a HUD and a loadout stay `PRIVATE`).',
};

/**
 * Read calls in a listed file that deliberately do not filter `moderatedAt`, with how many there are and why. The scan
 * holds the count exactly, so a second unfiltered read in the same file fails.
 */
export const WORKSHOP_UNFILTERED_READS: Readonly<Record<string, { calls: number; reason: string }>> = {
  'lib/moderation/workshop-moderation.server.ts': {
    calls: 3,
    reason:
      "The moderator's queue previews (one read per kind) read a reported item whatever its state (admin only; a removed item is what a moderator reads), and nothing they return is shown to a player.",
  },
  'lib/tf2-hud/hud.server.ts': {
    calls: 4,
    reason:
      "findRow returns the whole row and every public path then asks canRead, which refuses a removed row for anyone but its owner; the owner's own HUD count and slug check cannot show a row, and the version write reads a counter on a HUD its owner already holds.",
  },
  'lib/tf2-loadout/loadout.server.ts': {
    calls: 3,
    reason:
      "findRow returns the whole row and every public path then asks canRead, which refuses a removed row for anyone but its owner; the owner's own loadout count and slug check cannot show a row.",
  },
};
