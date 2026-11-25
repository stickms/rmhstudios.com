/**
 * Community moderation log (s03-14), pure part: the closed list of action codes, the
 * three filter groups, the public subset and the CSV. Rows store a code and ids, never
 * English; components build the sentence from the code (`community-modlog`).
 */
import { csvCell } from '@/lib/admin/audit-query';

/** Rows older than this are pruned by the monthly job and left out of the export. */
export const MOD_LOG_RETENTION_DAYS = 365;
export const MOD_LOG_PAGE_SIZE = 50;
/**
 * A page boundary is the last row's `(createdAt, id)`, one opaque string `<ms>.<id>`: the log is ordered by time and
 * then id, so paging by id alone could skip or repeat a row whose id order differs from its time order (two
 * transactions that commit out of order). The column is millisecond precision, so the cursor loses nothing.
 */
export interface ModLogCursor {
  createdAt: Date;
  id: bigint;
}

export function encodeModLogCursor(row: { createdAt: Date; id: bigint }): string {
  return `${row.createdAt.getTime()}.${row.id}`;
}

/** `null` for anything that is not a cursor of this format, an old numeric one included: the list starts from the top. */
export function decodeModLogCursor(cursor: string | undefined | null): ModLogCursor | null {
  const m = cursor ? /^(\d{1,16})\.(\d{1,19})$/.exec(cursor) : null;
  if (!m) return null;
  const createdAt = new Date(Number(m[1]));
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id: BigInt(m[2]!) };
}

/** One export is bounded so a single request stays cheap. */
export const MOD_LOG_EXPORT_MAX_ROWS = 20_000;
export const MOD_LOG_REASON_MAX = 300;
export const MOD_LOG_RULE_TITLE_MAX = 60;

/** The three filter groups the Log tab offers. */
export const MOD_LOG_GROUPS = ['content', 'members', 'settings'] as const;
export type ModLogGroup = (typeof MOD_LOG_GROUPS)[number];

export const MOD_ACTIONS_BY_GROUP = {
  content: [
    'content_removed',
    'content_approved',
    'announcement_posted',
    'announcement_removed',
    // s09-04: the community wiki. An ordinary edit is in the page's own history, not here.
    'wiki_page_created',
    'wiki_page_deleted',
    'wiki_page_rolled_back',
    // s09-06: pinned posts. The post is public in the community, so these are in the public log too.
    'post_pinned',
    'post_unpinned',
    'pins_reordered',
    // s10-07: a community's events. Public within the community, so these are in the public log too.
    'event_hosted',
    'event_cancelled',
    // s11-09: a community's read-alongs. Public within the community, so these are in the public log too.
    'read_along_started',
    'read_along_cancelled',
  ],
  members: [
    'member_removed',
    'member_role_changed',
    'join_request_approved',
    'join_request_denied',
    'invite_created',
    'invite_revoked',
    'ownership_transferred',
    'member_banned',
    'member_timed_out',
    'ban_lifted',
    'note_deleted',
  ],
  settings: [
    'settings_changed',
    'flair_created',
    'flair_updated',
    'flair_deleted',
    'automod_created',
    'automod_updated',
    'automod_deleted',
    'onboarding_changed',
    'sisters_changed',
    'rules_changed',
    'census_closed',
    'challenge_cancelled',
    'recurring_created',
    'recurring_updated',
    'recurring_paused',
    'recurring_deleted',
    'wiki_policy_changed',
  ],
} as const satisfies Record<ModLogGroup, readonly string[]>;

export const MOD_ACTIONS = [
  ...MOD_ACTIONS_BY_GROUP.content,
  ...MOD_ACTIONS_BY_GROUP.members,
  ...MOD_ACTIONS_BY_GROUP.settings,
] as const;
export type ModAction = (typeof MOD_ACTIONS)[number];

const ACTION_SET: ReadonlySet<string> = new Set(MOD_ACTIONS);
export const isModAction = (v: string): v is ModAction => ACTION_SET.has(v);
export const isModLogGroup = (v: string): v is ModLogGroup => (MOD_LOG_GROUPS as readonly string[]).includes(v);

/** The group an action filters under. */
export function groupOfAction(action: ModAction): ModLogGroup {
  for (const g of MOD_LOG_GROUPS) {
    if ((MOD_ACTIONS_BY_GROUP[g] as readonly string[]).includes(action)) return g;
  }
  return 'settings';
}

/**
 * What members may see when a community turns its public log on: the decisions on
 * content (removals, approvals and which posts are pinned), with the rule and reason. Never bans, role changes, settings, the actor or
 * the target member.
 */
export const PUBLIC_MOD_ACTIONS = [
  'content_removed',
  'content_approved',
  'post_pinned',
  'post_unpinned',
  'pins_reordered',
  'event_hosted',
  'event_cancelled',
  'read_along_started',
  'read_along_cancelled',
] as const;
export type PublicModAction = (typeof PUBLIC_MOD_ACTIONS)[number];
export const isPublicModAction = (v: string): v is PublicModAction =>
  (PUBLIC_MOD_ACTIONS as readonly string[]).includes(v);

/** What a row points at. Short codes (the column is 16 characters). */
export const MOD_TARGET_TYPES = [
  'post',
  'comment',
  'member',
  'request',
  'invite',
  'rule',
  'flair',
  'automod',
  'announcement',
  'census',
  'challenge',
  'recurring',
  'page',
  'event',
  'read_along',
] as const;
export type ModTargetType = (typeof MOD_TARGET_TYPES)[number];

/** Small structured facts about an action (field names, a role). Never free text from a member. */
export type ModLogDetail = Record<string, string | number | boolean | string[] | null>;

/**
 * s10-13: how a moderator's action reached the site. An action taken through the developer API carries
 * `via: 'api'` in its detail so the moderators' log can tell it from one taken on the site (which carries
 * nothing). It is a field of `detail`, which the public log never returns (`toPublicEntry` is field by field).
 */
export type ModVia = 'api';

/** `detail` with the `via` marker added when the action came in by a channel other than the site. */
export function withVia(detail: ModLogDetail | null | undefined, via: ModVia | undefined): ModLogDetail | null {
  if (!via) return detail ?? null;
  return { ...(detail ?? {}), via };
}

/** The fields `logModAction` takes. */
export interface ModActionInput {
  communityId: string;
  actorId: string;
  action: ModAction;
  targetUserId?: string | null;
  targetType?: ModTargetType | null;
  targetId?: string | null;
  ruleId?: string | null;
  ruleTitle?: string | null;
  reason?: string | null;
  detail?: ModLogDetail | null;
}

export interface ModLogUserDTO {
  id: string;
  name: string | null;
  handle: string | null;
}

/** A row as a moderator sees it. A deleted member is `null`. */
export interface ModLogEntryDTO {
  id: string;
  action: ModAction;
  actor: ModLogUserDTO | null;
  targetUser: ModLogUserDTO | null;
  targetType: ModTargetType | null;
  targetId: string | null;
  ruleTitle: string | null;
  reason: string | null;
  detail: ModLogDetail | null;
  createdAt: string;
}

/** A row as a member sees it: the allow-listed fields and nothing else. */
export interface PublicModLogEntryDTO {
  id: string;
  action: PublicModAction;
  targetType: 'post' | 'comment';
  ruleTitle: string | null;
  reason: string | null;
  createdAt: string;
}

export interface ModLogRowShape {
  id: bigint | string;
  action: string;
  targetType: string | null;
  ruleTitle: string | null;
  reason: string | null;
  createdAt: Date;
}

/** The public view of a row, or `null` when the action is not public. Built field by field. */
export function toPublicEntry(row: ModLogRowShape): PublicModLogEntryDTO | null {
  if (!isPublicModAction(row.action)) return null;
  return {
    id: String(row.id),
    action: row.action,
    targetType: row.targetType === 'comment' ? 'comment' : 'post',
    ruleTitle: row.ruleTitle,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

export const MOD_LOG_CSV_COLUMNS = [
  'time',
  'moderator',
  'action',
  'target_member',
  'target_type',
  'target_id',
  'rule',
  'reason',
] as const;

/** The handle (no leading @, which a spreadsheet would read as a formula), else the name. */
const handleOf = (u: ModLogUserDTO | null): string => (u ? (u.handle ?? u.name ?? '') : '');

/** One line per action, formula-safe (`csvCell`). A deleted member's cells are empty. */
export function modLogToCsv(entries: ModLogEntryDTO[]): string {
  const rows = entries.map((e) =>
    [
      e.createdAt,
      handleOf(e.actor),
      e.action,
      handleOf(e.targetUser),
      e.targetType ?? '',
      e.targetId ?? '',
      e.ruleTitle ?? '',
      e.reason ?? '',
    ]
      .map(csvCell)
      .join(','),
  );
  return [MOD_LOG_CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}
