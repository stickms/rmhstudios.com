/**
 * The grouped moderation queue's plain constants (s03-20). Split from `triage-schema.ts` so the
 * admin reports route's `validateSearch` (which the shell reaches) does not pull zod into the entry
 * bundle; the schema file re-exports everything here.
 */

export const TRIAGE_STATUSES = ['PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED'] as const;
export type TriageStatus = (typeof TRIAGE_STATUSES)[number];

/** "Most reported" is the default; the other two order by when the reports arrived. */
export const TRIAGE_SORTS = ['most', 'oldest', 'newest'] as const;
export type TriageSort = (typeof TRIAGE_SORTS)[number];

/** Groups per page, groups per bulk decision, reports per decision, reports listed inside one group. */
export const GROUPS_PAGE_SIZE = 25;
export const MAX_DECIDE_GROUPS = 50;
/** The queue's group total stops counting here (the tab shows it as a floor). */
export const MAX_COUNTED_GROUPS = 5000;
export const MAX_DECIDE_REPORTS = 1000;
export const MAX_REPORTS_PER_GROUP_SHOWN = 50;
