/**
 * Bug reports on user builds (s10-09), the pure half: statuses and which moves are allowed, limits, who may do what to
 * an issue, and what a reader sees of one. Client-safe: no Prisma, no server imports, no zod.
 */

export const ISSUE_TITLE_MAX = 120;
export const ISSUE_BODY_MAX = 4000;
export const ISSUE_STEPS_MAX = 2000;
export const ISSUE_WONT_FIX_REASON_MAX = 200;
/** Issues one member may report per build per day. */
export const ISSUES_PER_BUILD_PER_DAY = 10;
/** A page of the list. */
export const ISSUES_PAGE = 30;
/** Most "me too" members told when an issue is fixed (the reporter first). */
export const ISSUE_FIXED_NOTIFY_CAP = 500;
/** Concurrent notification writes while telling those members. */
export const ISSUE_NOTIFY_CONCURRENCY = 8;

/** The entity type of the report flow. */
export const BUILD_ISSUE_REPORT_TYPE = 'build-issue';
/** The notification entity type of every issue notice; one label covers them. */
export const BUILD_ISSUE_NOTICE_ENTITY = 'build-issue';

export const ISSUE_STATUSES = ['open', 'confirmed', 'fixed', 'wont_fix', 'duplicate', 'closed'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

/** What the list filter offers: one status, or every issue that is still being worked on, or all. */
export const ISSUE_FILTERS = ['all', 'open', 'confirmed', 'fixed', 'wont_fix', 'duplicate', 'closed'] as const;
export type IssueFilter = (typeof ISSUE_FILTERS)[number];

export const ISSUE_SORTS = ['newest', 'popular'] as const;
export type IssueSort = (typeof ISSUE_SORTS)[number];

/** The reporter's platform line, from a short list: no device data is collected. */
export const ISSUE_PLATFORMS = ['desktop', 'phone', 'tablet'] as const;
export type IssuePlatform = (typeof ISSUE_PLATFORMS)[number];

export function isIssueStatus(value: string): value is IssueStatus {
  return (ISSUE_STATUSES as readonly string[]).includes(value);
}

/** Statuses the creator may set. `closed` is the reporter's alone. */
export const CREATOR_STATUSES = ['open', 'confirmed', 'fixed', 'wont_fix', 'duplicate'] as const;
export type CreatorStatus = (typeof CREATOR_STATUSES)[number];

export interface StatusChange {
  status: CreatorStatus;
  /** Required for `fixed`: a release of the same build. */
  fixedInId?: string | null | undefined;
  /** Required for `duplicate`: another issue of the same build. */
  duplicateOfId?: string | null | undefined;
  /** Optional for `wont_fix`. */
  reason?: string | null | undefined;
}

export type TransitionProblem = 'same-status' | 'closed' | 'needs-release' | 'needs-duplicate' | 'duplicate-of-self';

/**
 * Whether the creator may move an issue from `from` with this change. Any open-ended move is allowed (a "won't fix"
 * can be reopened), but it must change something, `fixed` names its release and `duplicate` names another issue. An
 * issue the reporter closed stays closed: the creator cannot reopen someone's withdrawn report.
 */
export function checkTransition(from: IssueStatus, change: StatusChange, issueId: string): TransitionProblem | null {
  if (from === 'closed') return 'closed';
  if (
    change.status === from &&
    change.status !== 'fixed' &&
    change.status !== 'duplicate' &&
    change.status !== 'wont_fix'
  )
    return 'same-status';
  if (change.status === 'fixed' && !change.fixedInId) return 'needs-release';
  if (change.status === 'duplicate') {
    if (!change.duplicateOfId) return 'needs-duplicate';
    if (change.duplicateOfId === issueId) return 'duplicate-of-self';
  }
  return null;
}

/** The columns a status change writes: what belongs to the new status is set, what belonged to the old one is cleared. */
export function statusColumns(change: StatusChange): {
  status: CreatorStatus;
  fixedInId: string | null;
  duplicateOfId: string | null;
  wontFixReason: string | null;
} {
  const reason = change.reason?.trim();
  return {
    status: change.status,
    fixedInId: change.status === 'fixed' ? (change.fixedInId ?? null) : null,
    duplicateOfId: change.status === 'duplicate' ? (change.duplicateOfId ?? null) : null,
    wontFixReason: change.status === 'wont_fix' && reason ? reason : null,
  };
}

/** Whether a status ends the issue: a "me too" member is told when it moves to `fixed`. */
export const isResolved = (status: IssueStatus) => status === 'fixed';

/** The reporter closes their own issue only while it is still open. */
export const canReporterClose = (status: IssueStatus) => status === 'open';
/** The reporter edits their own issue only while it is open. */
export const canReporterEdit = (status: IssueStatus) => status === 'open';

export interface IssueFacts {
  reporterId: string;
  status: IssueStatus;
  hiddenAt: Date | string | null;
}

export interface IssueViewer {
  /** `null` when signed out. */
  userId: string | null;
  /** The build's creator. */
  buildOwnerId: string;
}

/** A hidden issue shows only to the creator and its reporter. */
export function issueVisibleTo(issue: Pick<IssueFacts, 'reporterId' | 'hiddenAt'>, v: IssueViewer): boolean {
  if (!issue.hiddenAt) return true;
  return v.userId !== null && (v.userId === v.buildOwnerId || v.userId === issue.reporterId);
}

export interface IssueRights {
  canEdit: boolean;
  canClose: boolean;
  canSetStatus: boolean;
  canHide: boolean;
  canVote: boolean;
  canReport: boolean;
}

/** What the viewer may do to this issue. A signed-out viewer may do nothing. */
export function issueRights(issue: IssueFacts, v: IssueViewer): IssueRights {
  if (!v.userId)
    return { canEdit: false, canClose: false, canSetStatus: false, canHide: false, canVote: false, canReport: false };
  const creator = v.userId === v.buildOwnerId;
  const reporter = v.userId === issue.reporterId;
  return {
    canEdit: reporter && canReporterEdit(issue.status),
    canClose: reporter && canReporterClose(issue.status),
    canSetStatus: creator && issue.status !== 'closed',
    canHide: creator,
    // Your own report already counts you; a closed or resolved one has nothing left to add.
    canVote: !reporter && (issue.status === 'open' || issue.status === 'confirmed'),
    canReport: !reporter,
  };
}

/**
 * A build's issues follow the build's own visibility: a public or unlisted build's are readable, a private build's only
 * by its creator (anyone else gets the same 404 as for a build that is not there).
 */
export function issuesReadable(visibility: string, isCreator = false): boolean {
  return visibility === 'PUBLIC' || visibility === 'UNLISTED' || (visibility === 'PRIVATE' && isCreator);
}

export type IssueRefusal =
  'blocked' | 'banned' | 'daily-cap' | 'not-found' | 'invalid' | 'stale' | 'own' | 'closed' | 'forbidden';

/** Static, member-safe sentences for each refusal; the client shows its own translated text from `reason`. */
export const ISSUE_REFUSAL_MESSAGE: Record<IssueRefusal, string> = {
  blocked: 'You cannot report issues on this build',
  banned: 'You cannot report issues right now',
  'daily-cap': 'You have reported the most issues allowed on this build today',
  'not-found': 'Not found',
  invalid: 'Invalid issue',
  stale: 'This issue changed since you opened it',
  own: 'You cannot do that to your own issue',
  closed: 'This issue is closed',
  forbidden: 'You cannot do that',
};

/** The filter's `where` on status, or null for every issue. */
export function statusFilter(filter: IssueFilter): IssueStatus | null {
  return filter === 'all' ? null : filter;
}

export interface IssueView {
  id: string;
  title: string;
  body: string;
  steps: string | null;
  platform: IssuePlatform;
  status: IssueStatus;
  version: { id: string; version: string } | null;
  fixedIn: { id: string; version: string } | null;
  duplicateOf: { id: string; title: string } | null;
  wontFixReason: string | null;
  hidden: boolean;
  voteCount: number;
  /** Whether the viewer has added "I see this too". */
  voted: boolean;
  createdAt: string;
  statusChangedAt: string | null;
  /** `name: null` for a deleted reporter, shown as "Deleted user". */
  reporter: { id: string; name: string | null; image: string | null; username: string | null };
  rights: IssueRights;
}

export interface IssueListPage {
  items: IssueView[];
  nextCursor: string | null;
  /** Counts by status for the filter tabs (only what the viewer may see). */
  counts: Record<IssueFilter, number>;
  /** Whether the signed-in viewer may report here (false: signed out, blocked or banned). */
  canReport: boolean;
  isCreator: boolean;
  releases: { id: string; version: string }[];
}
