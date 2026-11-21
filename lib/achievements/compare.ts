/**
 * Comparing two members' achievements, pure and client-safe.
 *
 * The server hands over both members' states (`listAchievements`, whose unlocked flag, date and progress are never
 * masked) and this module joins them to the catalog and decides what the viewer may see. The one privacy rule is here:
 *
 * - a secret achievement the viewer has unlocked is theirs to see in full, whatever the other member has done;
 * - a secret the viewer has NOT unlocked but the other member has is a row with no name, description, icon, tier or
 *   rarity (the page says "A secret achievement"), so a comparison never spoils it;
 * - a secret nobody has unlocked is not a row at all, so a comparison does not even reveal that it exists.
 *
 * Components translate every label; this file returns ids and data, never copy.
 */
import type { AchievementCategory, AchievementDef } from '@/lib/achievements/catalog';

/**
 * Whom to compare with: a member id or a handle. Handles are letters, digits, `_`, `-` and `.`; ids are cuid-shaped, so
 * the one pattern covers both. Anything else cannot name a member and is a 400 before a query runs.
 */
export const HANDLE_OR_ID = /^[A-Za-z0-9_.-]{1,64}$/;

/** One member's state for one achievement. */
export interface SideState {
  unlocked: boolean;
  /** ISO date, null while locked. */
  unlockedAt: string | null;
  /** Progress toward `target`, already capped. */
  progress: number;
}

/** What a member has, by achievement id. Only the fields the comparison needs, so any payload with them fits. */
export interface MemberAchievements {
  achievements: ReadonlyArray<{ id: string } & SideState>;
}

/** A member as the comparison header shows them. */
export interface CompareMember {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
  unlocked: number;
  total: number;
}

export interface CompareResponse {
  you: CompareMember;
  them: CompareMember;
  rows: CompareRow[];
}

export const COMPARE_FILTERS = ['all', 'both', 'you', 'them', 'neither'] as const;
export type CompareFilter = (typeof COMPARE_FILTERS)[number];

/** Which of the two members hold it. */
export type CompareBucket = Exclude<CompareFilter, 'all'>;

export interface CompareRow {
  id: string;
  /** True for a secret the viewer has not unlocked: `name`, `description`, `icon` and `tier` are then empty. */
  masked: boolean;
  name: string;
  description: string;
  icon: string;
  tier: AchievementDef['tier'] | null;
  category: AchievementCategory;
  target: number;
  /** Share of players holding it (0 to 1), null when unknown or masked. */
  rarity: number | null;
  you: SideState;
  them: SideState;
  bucket: CompareBucket;
  /** "Only them" and not secret: the viewer can pin it in the tracker. */
  trackable: boolean;
}

export interface CompareCounts {
  both: number;
  you: number;
  them: number;
  neither: number;
}

const LOCKED: SideState = { unlocked: false, unlockedAt: null, progress: 0 };

export function bucketOf(youUnlocked: boolean, themUnlocked: boolean): CompareBucket {
  if (youUnlocked && themUnlocked) return 'both';
  if (youUnlocked) return 'you';
  if (themUnlocked) return 'them';
  return 'neither';
}

/**
 * The comparison rows, in catalog order. `rarity` maps achievement id to the holder share (0 to 1); an id with no entry
 * has no rarity yet.
 */
export function buildCompareRows(
  catalog: readonly AchievementDef[],
  viewer: MemberAchievements,
  other: MemberAchievements,
  rarity: Readonly<Record<string, number>>,
): CompareRow[] {
  const mine = new Map(viewer.achievements.map((a) => [a.id, a]));
  const theirs = new Map(other.achievements.map((a) => [a.id, a]));
  const rows: CompareRow[] = [];
  for (const def of catalog) {
    const you = mine.get(def.id) ?? LOCKED;
    const them = theirs.get(def.id) ?? LOCKED;
    const secret = def.secret === true;
    // Nobody has it: showing the row, even masked, would only reveal that the achievement exists.
    if (secret && !you.unlocked && !them.unlocked) continue;
    const masked = secret && !you.unlocked;
    const bucket = bucketOf(you.unlocked, them.unlocked);
    const pct = rarity[def.id];
    rows.push({
      id: def.id,
      masked,
      name: masked ? '' : def.name,
      description: masked ? '' : def.description,
      icon: masked ? '' : def.icon,
      tier: masked ? null : def.tier,
      category: def.category,
      target: def.target,
      rarity: masked || typeof pct !== 'number' || !Number.isFinite(pct) ? null : pct,
      you: pickSide(you),
      them: pickSide(them),
      bucket,
      trackable: bucket === 'them' && !secret,
    });
  }
  return rows;
}

function pickSide(s: SideState): SideState {
  return { unlocked: s.unlocked, unlockedAt: s.unlockedAt, progress: s.progress };
}

export function countBuckets(rows: readonly CompareRow[]): CompareCounts {
  const counts: CompareCounts = { both: 0, you: 0, them: 0, neither: 0 };
  for (const r of rows) counts[r.bucket] += 1;
  return counts;
}

/** Narrow by bucket and, when given, by category. */
export function filterCompareRows(
  rows: readonly CompareRow[],
  filter: CompareFilter,
  category: AchievementCategory | 'all' = 'all',
): CompareRow[] {
  return rows.filter(
    (r) => (filter === 'all' || r.bucket === filter) && (category === 'all' || r.category === category),
  );
}
