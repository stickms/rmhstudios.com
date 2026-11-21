/**
 * Pure rules for a flag's per-member allow and deny lists (s04-20). No I/O, so the admin API, the panel and the
 * product tests share one definition of "a member is in at most one list" and "at most 200 per list".
 */
import type { FlagReason } from './evaluate';

/** Most member ids one list may hold. */
export const MAX_TARGET_IDS = 200;
/** Most handles added (and most ids removed) by one edit; keeps the audit line inside its 500 characters. */
export const MAX_EDIT_IDS = 10;

export type TargetList =
  | 'allow'
  | 'deny';

export interface TargetLists {
  allow: string[];
  deny: string[];
}

export interface ListEdit {
  list: TargetList;
  /** Member ids to put in `list`. */
  add: string[];
  /** Member ids to take out of `list`. */
  remove: string[];
}

export type ListEditResult =
  | {
      ok: true;
      lists: TargetLists;
      /** Ids newly in `list`. */
      added: string[];
      /** Ids that were in `list` and are now out of it. */
      removed: string[];
      /** Ids that were in the other list and moved, because a member is never in both. */
      moved: string[];
    }
  | {
      ok: false;
      code: 'full';
      list: TargetList;
    };

export const otherList =
  (
    list: TargetList,
  ): TargetList =>
    list ===
    'allow'
      ? 'deny'
      : 'allow';

const unique =
  (
    ids: readonly string[],
  ): string[] => [
    ...new Set(
      ids,
    ),
  ];

/**
 * Apply one edit. Removals run first, then each added id joins `list` and leaves the other list. Adding an id
 * already in the list changes nothing. A list that would pass {@link MAX_TARGET_IDS} refuses the whole edit.
 */
export function applyListEdit(
  lists: TargetLists,
  edit: ListEdit,
): ListEditResult {
  const other =
    otherList(
      edit.list,
    );
  const removeSet =
    new Set(
      edit.remove,
    );
  const current =
    lists[
      edit
        .list
    ];
  const removed =
    unique(
      edit.remove,
    ).filter(
      (
        id,
      ) =>
        current.includes(
          id,
        ),
    );
  const kept =
    current.filter(
      (
        id,
      ) =>
        !removeSet.has(
          id,
        ),
    );
  const keptSet =
    new Set(
      kept,
    );
  const added =
    unique(
      edit.add,
    ).filter(
      (
        id,
      ) =>
        !keptSet.has(
          id,
        ),
    );
  const addedSet =
    new Set(
      added,
    );
  const next =
    [
      ...kept,
      ...added,
    ];
  if (
    next.length >
    MAX_TARGET_IDS
  )
    return {
      ok: false,
      code: 'full',
      list: edit.list,
    };
  const moved =
    lists[
      other
    ].filter(
      (
        id,
      ) =>
        addedSet.has(
          id,
        ),
    );
  const result: TargetLists =
    {
      allow:
        [],
      deny: [],
    };
  result[
    edit.list
  ] =
    next;
  result[
    other
  ] =
    lists[
      other
    ].filter(
      (
        id,
      ) =>
        !addedSet.has(
          id,
        ),
    );
  return {
    ok: true,
    lists:
      result,
    added,
    removed,
    moved,
  };
}

/**
 * The audit line for an edit, `allow +@ann +@bo -@cy; deny -@ann`, from the labels (`@handle`, or the id for a
 * member with no handle) of the ids it touched. `null` when the edit changed nothing.
 */
export function describeListEdit(
  list: TargetList,
  labels: {
    added: string[];
    removed: string[];
    moved: string[];
  },
):
  | string
  | null {
  const own =
    [
      ...labels.added.map(
        (
          l,
        ) =>
          `+${l}`,
      ),
      ...labels.removed.map(
        (
          l,
        ) =>
          `-${l}`,
      ),
    ];
  const parts: string[] =
    [];
  if (
    own.length >
    0
  )
    parts.push(
      `${list} ${own.join(' ')}`,
    );
  if (
    labels
      .moved
      .length >
    0
  ) {
    parts.push(
      `${otherList(list)} ${labels.moved.map((l) => `-${l}`).join(' ')}`,
    );
  }
  return parts.length >
    0
    ? parts.join(
        '; ',
      )
    : null;
}

/** A member as the panel lists them. */
export interface TargetMember {
  id: string;
  name:
    | string
    | null;
  handle:
    | string
    | null;
  image:
    | string
    | null;
}

export interface FlagTargetingDTO {
  allow: TargetMember[];
  deny: TargetMember[];
  max: number;
}

export interface FlagCheckDTO {
  member: TargetMember;
  on: boolean;
  reason: FlagReason;
}

export interface FlagHistoryItem {
  id: string;
  /** `flag.upsert`, `flag.delete` or `flag.targeting`. */
  action: string;
  detail:
    | string
    | null;
  createdAt: string;
  admin: TargetMember;
}

export interface FlagHistoryPage {
  items: FlagHistoryItem[];
  nextCursor:
    | string
    | null;
}

/** History page size (FR-3). */
export const HISTORY_PAGE_SIZE = 20;
