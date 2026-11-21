/**
 * Moderation queue triage (s03-20): the pure half. Filters, ordering, reporter reliability and how grouped rows are
 * shaped. Client-safe: no Prisma, no server imports.
 */

import {
  REPORT_ENTITY_TYPES,
  REPORT_REASONS,
  type ReportEntityType,
  type ReportReason,
} from '@/lib/moderation/report-constants';
import {
  GROUPS_PAGE_SIZE,
  TRIAGE_SORTS,
  TRIAGE_STATUSES,
  type TriageSort,
  type TriageStatus,
} from '@/lib/moderation/triage-constants';
import type { triageQuery } from '@/lib/moderation/triage-schema';
import type { z } from 'zod';

/** A reporter's track record is shown only from this many decided reports. */
export const RELIABILITY_MIN_DECIDED = 5;
/** A reporter counts as reliable at this share of upheld reports. */
export const RELIABILITY_THRESHOLD = 0.7;

export const DEFAULT_STATUS: TriageStatus =
  'PENDING';
export const DEFAULT_SORT: TriageSort =
  'most';

export interface TriageFilters {
  status: TriageStatus;
  reasons: ReportReason[];
  entityType: ReportEntityType | null;
  /** Only groups with at least this many reports (1 = no limit). */
  min: number;
  sort: TriageSort;
  /** How many groups to skip; the cursor is an offset. */
  offset: number;
}

/** Reasons from a comma list: unknown names and repeats are dropped, and the order is the dialog's. */
export function parseReasons(
  raw:
    | string
    | null
    | undefined,
): ReportReason[] {
  const asked =
    new Set(
      (
        raw ??
        ''
      )
        .split(
          ',',
        )
        .map(
          (
            s,
          ) =>
            s.trim(),
        ),
    );
  return REPORT_REASONS.filter(
    (
      reason,
    ) =>
      asked.has(
        reason,
      ),
  );
}

export function parseTriageFilters(
  query: z.infer<
    typeof triageQuery
  >,
): TriageFilters {
  return {
    status:
      query.status ??
      DEFAULT_STATUS,
    reasons:
      parseReasons(
        query.reasons,
      ),
    entityType:
      query.entityType ??
      null,
    min: Math.max(
      1,
      query.min
        ? Number.parseInt(
            query.min,
            10,
          )
        : 1,
    ),
    sort:
      query.sort ??
      DEFAULT_SORT,
    offset:
      query.cursor
        ? Number.parseInt(
            query.cursor,
            10,
          )
        : 0,
  };
}

/** The URL search params of a view: only what differs from the defaults, so a plain queue is a plain URL. */
export interface TriageSearch {
  status?: TriageStatus;
  reasons?: string;
  type?: ReportEntityType;
  min?: number;
  sort?: TriageSort;
  flat?: true;
}

/** Validates the route's search params; anything unrecognised is dropped rather than rejected. */
export function parseTriageSearch(
  search: Record<
    string,
    unknown
  >,
): TriageSearch {
  const out: TriageSearch =
    {};
  const status =
    TRIAGE_STATUSES.find(
      (
        s,
      ) =>
        s ===
        search.status,
    );
  if (
    status &&
    status !==
      DEFAULT_STATUS
  )
    out.status =
      status;
  const reasons =
    parseReasons(
      typeof search.reasons ===
        'string'
        ? search.reasons
        : null,
    );
  if (
    reasons.length >
    0
  )
    out.reasons =
      reasons.join(
        ',',
      );
  const type =
    REPORT_ENTITY_TYPES.find(
      (
        t,
      ) =>
        t ===
        search.type,
    );
  if (
    type
  )
    out.type =
      type;
  const min =
    Number(
      search.min,
    );
  if (
    Number.isInteger(
      min,
    ) &&
    min >
      1 &&
    min <=
      9999
  )
    out.min =
      min;
  const sort =
    TRIAGE_SORTS.find(
      (
        s,
      ) =>
        s ===
        search.sort,
    );
  if (
    sort &&
    sort !==
      DEFAULT_SORT
  )
    out.sort =
      sort;
  if (
    search.flat ===
      true ||
    search.flat ===
      'true'
  )
    out.flat = true;
  return out;
}

/** The API query for a view's search params. */
export function searchToQuery(
  search: TriageSearch,
  cursor?: string,
): z.infer<
  typeof triageQuery
> {
  return {
    status:
      search.status,
    reasons:
      search.reasons,
    entityType:
      search.type,
    min: search.min
      ? String(
          search.min,
        )
      : undefined,
    sort: search.sort,
    cursor,
  };
}

export interface ReporterTally {
  upheld: number;
  decided: number;
}

/** Folds `(reporterId, status)` counts into one tally per reporter; only RESOLVED and DISMISSED are decisions. */
export function tallyReporters(
  rows: readonly {
    reporterId: string;
    status: string;
    count: number;
  }[],
): Map<
  string,
  ReporterTally
> {
  const out =
    new Map<
      string,
      ReporterTally
    >();
  for (const row of rows) {
    if (
      row.status !==
        'RESOLVED' &&
      row.status !==
        'DISMISSED'
    )
      continue;
    const tally =
      out.get(
        row.reporterId,
      ) ?? {
        upheld: 0,
        decided: 0,
      };
    tally.decided +=
      row.count;
    if (
      row.status ===
      'RESOLVED'
    )
      tally.upheld +=
        row.count;
    out.set(
      row.reporterId,
      tally,
    );
  }
  return out;
}

/** A reporter's record, or null while there are too few decided reports to say anything. */
export function reporterRecord(
  tally:
    | ReporterTally
    | undefined,
): ReporterTally | null {
  return tally &&
    tally.decided >=
      RELIABILITY_MIN_DECIDED
    ? tally
    : null;
}

export function isReliable(
  record: ReporterTally,
): boolean {
  return (
    record.upheld /
      record.decided >=
    RELIABILITY_THRESHOLD
  );
}

export interface GroupReliability {
  /** Reporters with a record who are reliable. */
  reliable: number;
  /** Reporters with a record. */
  known: number;
}

/** How many of a group's reporters have a record at all, and how many of those are reliable. */
export function groupReliability(
  reporterIds: readonly string[],
  tallies: ReadonlyMap<
    string,
    ReporterTally
  >,
): GroupReliability {
  let known = 0;
  let reliable = 0;
  for (const id of new Set(
    reporterIds,
  )) {
    const record =
      reporterRecord(
        tallies.get(
          id,
        ),
      );
    if (
      !record
    )
      continue;
    known += 1;
    if (
      isReliable(
        record,
      )
    )
      reliable += 1;
  }
  return {
    reliable,
    known,
  };
}

export interface RawGroup {
  entityType: string;
  entityId: string;
  count: number;
  firstAt: Date;
  lastAt: Date;
}

export interface ReasonCount {
  reason: ReportReason;
  count: number;
}

export const groupKey =
  (
    entityType: string,
    entityId: string,
  ) =>
    `${entityType}:${entityId}`;

/** Reasons per target from `(entityType, entityId, reason)` counts, most frequent first, ties in the dialog's order. */
export function reasonsByGroup(
  rows: readonly {
    entityType: string;
    entityId: string;
    reason: ReportReason;
    count: number;
  }[],
): Map<
  string,
  ReasonCount[]
> {
  const out =
    new Map<
      string,
      ReasonCount[]
    >();
  for (const row of rows) {
    const key =
      groupKey(
        row.entityType,
        row.entityId,
      );
    out.set(
      key,
      [
        ...(out.get(
          key,
        ) ??
          []),
        {
          reason:
            row.reason,
          count:
            row.count,
        },
      ],
    );
  }
  for (const list of out.values()) {
    list.sort(
      (
        a,
        b,
      ) =>
        b.count -
          a.count ||
        REPORT_REASONS.indexOf(
          a.reason,
        ) -
          REPORT_REASONS.indexOf(
            b.reason,
          ),
    );
  }
  return out;
}

/** The page's cursor: where the next page starts, or null at the end. */
export function nextOffset(
  offset: number,
  more: boolean,
):
  | string
  | null {
  return more
    ? String(
        offset +
          GROUPS_PAGE_SIZE,
      )
    : null;
}

/** Only open reports can be decided; a decided group is shown for the record. */
export const isOpenQueueStatus =
  (
    status: TriageStatus,
  ) =>
    status ===
      'PENDING' ||
    status ===
      'REVIEWING';
