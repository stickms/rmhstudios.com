/**
 * Achievement tracking, pure and client-safe (feature 19).
 *
 * A member may pin up to {@link MAX_TRACKED} locked achievements to work toward. This module holds the rules that need
 * no database: which achievements are closest to unlocking, when progress crosses a milestone, and how the list on the
 * achievements tab is filtered and sorted. The server half (`tracking.server.ts`) persists and notifies; the
 * components translate every label (this file returns ids, never copy).
 */
import type {
  AchievementCategory,
  AchievementDef,
} from '@/lib/achievements/catalog';
import type { RarityRow } from '@/lib/achievements/rarity';

/** How many achievements a member may track at once. */
export const MAX_TRACKED = 5;

/** The progress milestones announced for a tracked achievement, in percent. */
export const MILESTONES =
  [
    50,
    90,
  ] as const;
export type Milestone =
  (typeof MILESTONES)[number];

/** How many achievements "Closest to unlocking" lists. */
export const CLOSEST_LIMIT = 8;

/** Progress as a whole-number-free percentage, 0 to 100. A one-shot or empty target is 0. */
export function percent(
  progress: number,
  target: number,
): number {
  if (
    !Number.isFinite(
      progress,
    ) ||
    !Number.isFinite(
      target,
    ) ||
    target <=
      0
  )
    return 0;
  return Math.max(
    0,
    Math.min(
      100,
      (progress /
        target) *
        100,
    ),
  );
}

/**
 * The milestone a move from `prevPct` to `nextPct` crossed, or `null`. A jump over both thresholds at once returns 90:
 * the member is told where they are now, not that they passed halfway a moment ago.
 */
export function crossedThreshold(
  prevPct: number,
  nextPct: number,
): Milestone | null {
  if (
    !(
      nextPct >
      prevPct
    )
  )
    return null;
  if (
    prevPct <
      90 &&
    nextPct >=
      90
  )
    return 90;
  if (
    prevPct <
      50 &&
    nextPct >=
      50
  )
    return 50;
  return null;
}

/** What the ranking needs of a catalog definition. */
export type ClosestDef =
  Pick<
    AchievementDef,
    | 'id'
    | 'target'
    | 'secret'
  >;
/** What the ranking needs of a member's stored row. */
export interface ClosestRow {
  achievementId: string;
  progress: number;
  unlockedAt:
    | Date
    | string
    | null;
}
export type RarityLookup =
  ReadonlyMap<
    string,
    Pick<
      RarityRow,
      'pct'
    >
  >;

export interface ClosestEntry {
  id: string;
  progress: number;
  target: number;
  /** Fraction still to go, 0 to 1. */
  remaining: number;
}

/**
 * Up to `n` locked, non-secret, incremental achievements with progress of at least 1, the least remaining first. Ties
 * go to the rarer one (smaller holder share; one with no rarity row counts as common), then catalog order.
 */
export function closest(
  defs: readonly ClosestDef[],
  rows: readonly ClosestRow[],
  rarity: RarityLookup,
  n: number = CLOSEST_LIMIT,
): ClosestEntry[] {
  const byId =
    new Map(
      rows.map(
        (
          r,
        ) => [
          r.achievementId,
          r,
        ],
      ),
    );
  const entries: Array<
    ClosestEntry & {
      order: number;
    }
  > =
    [];
  defs.forEach(
    (
      def,
      order,
    ) => {
      if (
        def.secret ||
        def.target <=
          1
      )
        return;
      const row =
        byId.get(
          def.id,
        );
      if (
        !row ||
        row.unlockedAt ||
        row.progress <
          1
      )
        return;
      const progress =
        Math.min(
          row.progress,
          def.target,
        );
      entries.push(
        {
          id: def.id,
          progress,
          target:
            def.target,
          remaining:
            1 -
            progress /
              def.target,
          order,
        },
      );
    },
  );
  entries.sort(
    (
      a,
      b,
    ) =>
      a.remaining -
        b.remaining ||
      (rarity.get(
        a.id,
      )
        ?.pct ??
        1) -
        (rarity.get(
          b.id,
        )
          ?.pct ??
          1) ||
      a.order -
        b.order,
  );
  return entries
    .slice(
      0,
      Math.max(
        0,
        n,
      ),
    )
    .map(
      ({
        order:
          _order,
        ...entry
      }) =>
        entry,
    );
}

export const ACHIEVEMENT_STATES =
  [
    'all',
    'locked',
    'unlocked',
    'tracked',
  ] as const;
export type AchievementState =
  (typeof ACHIEVEMENT_STATES)[number];

export const ACHIEVEMENT_SORTS =
  [
    'catalog',
    'closest',
    'rarest',
    'recent',
  ] as const;
export type AchievementSort =
  (typeof ACHIEVEMENT_SORTS)[number];

/** What filtering and sorting need of a row in the list. */
export interface ListedAchievement {
  id: string;
  category: AchievementCategory;
  target: number;
  progress: number;
  unlocked: boolean;
  unlockedAt:
    | string
    | null;
}

export interface AchievementListFilter {
  state: AchievementState;
  /** `null` is every category. */
  category: AchievementCategory | null;
  tracked: ReadonlySet<string>;
}

export function filterAchievements<
  T extends
    ListedAchievement,
>(
  list: readonly T[],
  {
    state,
    category,
    tracked,
  }: AchievementListFilter,
): T[] {
  return list.filter(
    (
      a,
    ) => {
      if (
        category &&
        a.category !==
          category
      )
        return false;
      if (
        state ===
        'locked'
      )
        return !a.unlocked;
      if (
        state ===
        'unlocked'
      )
        return a.unlocked;
      if (
        state ===
        'tracked'
      )
        return tracked.has(
          a.id,
        );
      return true;
    },
  );
}

/**
 * Sorts a copy of `list`. `catalog` keeps the order given. `closest` puts locked rows by remaining fraction (unlocked
 * last). `rarest` is the smallest holder share first. `recent` is the latest unlock first (locked rows last). Every
 * sort falls back to the incoming order, so equal rows never reshuffle.
 */
export function sortAchievements<
  T extends
    ListedAchievement,
>(
  list: readonly T[],
  sort: AchievementSort,
  rarity: RarityLookup,
): T[] {
  const indexed =
    list.map(
      (
        a,
        order,
      ) => ({
        a,
        order,
      }),
    );
  const remaining =
    (
      a: ListedAchievement,
    ) =>
      a.unlocked
        ? 2
        : 1 -
          percent(
            a.progress,
            a.target,
          ) /
            100;
  const pct =
    (
      a: ListedAchievement,
    ) =>
      rarity.get(
        a.id,
      )
        ?.pct ??
      1;
  const unlockedTime =
    (
      a: ListedAchievement,
    ) =>
      a.unlockedAt
        ? Date.parse(
            a.unlockedAt,
          )
        : Number.NEGATIVE_INFINITY;
  switch (
    sort
  ) {
    case 'closest':
      indexed.sort(
        (
          x,
          y,
        ) =>
          remaining(
            x.a,
          ) -
            remaining(
              y.a,
            ) ||
          x.order -
            y.order,
      );
      break;
    case 'rarest':
      indexed.sort(
        (
          x,
          y,
        ) =>
          pct(
            x.a,
          ) -
            pct(
              y.a,
            ) ||
          x.order -
            y.order,
      );
      break;
    case 'recent':
      indexed.sort(
        (
          x,
          y,
        ) =>
          unlockedTime(
            y.a,
          ) -
            unlockedTime(
              x.a,
            ) ||
          x.order -
            y.order,
      );
      break;
    default:
      break;
  }
  return indexed.map(
    ({
      a,
    }) =>
      a,
  );
}
