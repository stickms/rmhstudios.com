/**
 * The content-report vocabulary as plain data: what can be reported and why. Split from
 * `report-schema.ts` so code the shell reaches (a route's `validateSearch`) can read the lists
 * without pulling zod into the entry bundle; the schema file re-exports everything here.
 */

/**
 * What can be reported. `dm` is here and deliberately has no owner lookup in
 * the route — a DM's author is not resolvable from the id alone.
 *
 * `song` is Slice It's uploads (`L9`). Uploads are user-supplied audio, which
 * the catalog already declares with `descriptors: ['user-content']`, and the
 * game had no path to this queue at all — so the one category of content on the
 * site most likely to attract a copyright claim was the one with no report
 * button.
 */
export const REPORT_ENTITY_TYPES =
  [
    'rmhark',
    'comment',
    'user',
    'build',
    'dm',
    'song',
    // P05: profile stamps (P5) and member-run webrings (P6) — user-made names and
    // images that appear on other people's pages, so they need a report path.
    'stamp',
    'webring',
    // P22: RMHLadder community interview reports (F8).
    'ladder-interview',
    // RMH Music Phase 6: a Daily board score (the `MusicSprintDaily` id) and a
    // shared result link (`lib/rmhmusic/learn/moderation.server.ts`).
    'music-score',
    'music-share',
    // s06-07: written feedback on a game jam entry (the `GameJamFeedback` id); reported by the entry's team.
    'jam-feedback',
    // s06-14: a comment on a User Build (the `BuildComment` id).
    'build-comment',
  ] as const;
export type ReportEntityType =
  (typeof REPORT_ENTITY_TYPES)[number];

/**
 * The types the admin page offers "Resolve & remove content" for. Each one has a
 * branch in `takedownReportedContent` (`lib/moderation/triage.server.ts`);
 * `lib/moderation/__tests__/music-reports.test.ts` holds that, so the button can
 * never resolve a report while leaving the content up.
 */
export const REMOVABLE_REPORT_ENTITY_TYPES: readonly ReportEntityType[] =
  [
    'rmhark',
    'comment',
    'stamp',
    'webring',
    'ladder-interview',
    'music-score',
    'music-share',
    'jam-feedback',
    'build-comment',
  ];

/**
 * The reason taxonomy. Ordered as the dialog presents it: the categories that
 * are reported most often first, `OTHER` last.
 */
export const REPORT_REASONS =
  [
    'SPAM',
    'HARASSMENT',
    'HATE',
    'VIOLENCE',
    'SEXUAL',
    'SELF_HARM',
    'MISINFORMATION',
    'ILLEGAL',
    'OTHER',
  ] as const;
export type ReportReason =
  (typeof REPORT_REASONS)[number];
