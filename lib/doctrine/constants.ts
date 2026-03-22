/**
 * Doctrine Engine — App-Wide Constants
 *
 * Tier definitions, XP actions, rank thresholds, beta phases.
 */

import type { TierId, TierDefinition, RankDefinition } from './types';

// ─── Tier Definitions ───────────────────────────────────────────────────────

const PUBLIC_ACCESS = [
  'daily_puzzles',
  'public_leaderboards',
  'incident_feed',
  'sahur_mode',
] as const;

const INSIDER_ACCESS = [
  ...PUBLIC_ACCESS,
  'safehouse_feed',
  'dev_logs',
  'early_access_builds',
  'insider_discord_role',
  'weekly_intel_briefing',
] as const;

const OPERATOR_ACCESS = [
  ...INSIDER_ACCESS,
  'intel_dashboard',
  'controlled_disclosures',
  'recruitment_tools',
  'direct_line',
  'vote_on_features',
  'name_in_credits',
] as const;

export const TIERS: Record<TierId, TierDefinition> = {
  PUBLIC: {
    id: 'PUBLIC',
    name: 'Civilian',
    price: 0,
    color: '#6B7280',
    access: PUBLIC_ACCESS,
  },
  INSIDER: {
    id: 'INSIDER',
    name: 'Asset',
    price: 500,
    color: '#F59E0B',
    access: INSIDER_ACCESS,
  },
  OPERATOR: {
    id: 'OPERATOR',
    name: 'Operator',
    price: 1500,
    color: '#EF4444',
    access: OPERATOR_ACCESS,
  },
} as const;

export const TIER_HIERARCHY: Record<TierId, number> = {
  PUBLIC: 0,
  INSIDER: 1,
  OPERATOR: 2,
};

// ─── XP Actions ─────────────────────────────────────────────────────────────

export const XP_ACTIONS = {
  // Puzzles
  PUZZLE_SOLVE: 10,
  PUZZLE_SOLVE_STREAK_BONUS: (streak: number) => Math.floor(streak * 2.5),
  PUZZLE_TOP_10_PERCENT: 25,
  PUZZLE_FIRST_SOLVE: 50,

  // Safehouse
  SAFEHOUSE_POST_REACTION: 2,
  SAFEHOUSE_COMMENT: 5,
  DISCLOSURE_EARLY_VIEW: 10,

  // Recruitment
  RECRUIT_SIGNUP: 50,
  RECRUIT_CONVERT_TO_PAID: 200,

  // Incidents
  INCIDENT_FIRST_REPORT: 30,
  INCIDENT_REACTION: 1,

  // Sahur Mode
  SAHUR_PARTICIPATION: 15,
  SAHUR_CHALLENGE_COMPLETE: 40,

  // Cross-platform (future)
  NIGHTFALL_ACHIEVEMENT: 20,
  STOA_SPACE_CREATED: 15,
  STICKBOT_TOOL_USED: 5,
} as const;

// ─── Ranks ──────────────────────────────────────────────────────────────────

export const RANKS: readonly RankDefinition[] = [
  { name: 'Recruit', minXp: 0, badge: '🔘' },
  { name: 'Analyst', minXp: 100, badge: '📊' },
  { name: 'Field Agent', minXp: 500, badge: '🕵️' },
  { name: 'Case Officer', minXp: 1500, badge: '📁' },
  { name: 'Station Chief', minXp: 5000, badge: '🏛️' },
  { name: 'Director', minXp: 15000, badge: '⭐' },
  { name: 'Shadow Ops', minXp: 50000, badge: '🌑' },
] as const;

// ─── Reputation Decay ───────────────────────────────────────────────────────

/** Users who don't engage lose 5% of their XP per week. */
export const WEEKLY_DECAY_RATE = 0.05;

// ─── Perpetual Beta ─────────────────────────────────────────────────────────

export const BETA_PHASES = [
  { name: 'Phase 0: Genesis', description: 'Core systems online' },
  { name: 'Phase 1: First Light', description: 'Initial public access' },
  { name: 'Phase 2: Expansion', description: 'New modules deploying' },
  { name: 'Phase 3: Consolidation', description: 'Ecosystem integration' },
  { name: 'Phase 4: Emergence', description: 'Advanced features unlocking' },
] as const;

export const CURRENT_PHASE = BETA_PHASES[0];

// ─── Incident Codename Generation ───────────────────────────────────────────

const CODENAME_ADJECTIVES = [
  'Silent', 'Crimson', 'Phantom', 'Obsidian', 'Hollow',
  'Burning', 'Frozen', 'Electric', 'Velvet', 'Iron',
] as const;

const CODENAME_NOUNS = [
  'Eclipse', 'Cascade', 'Vortex', 'Fracture', 'Storm',
  'Breach', 'Collapse', 'Meridian', 'Exodus', 'Zenith',
] as const;

export function generateCodename(): string {
  const adj = CODENAME_ADJECTIVES[Math.floor(Math.random() * CODENAME_ADJECTIVES.length)];
  const noun = CODENAME_NOUNS[Math.floor(Math.random() * CODENAME_NOUNS.length)];
  return `${adj} ${noun}`;
}

// ─── Sahur Mode ─────────────────────────────────────────────────────────────

export const SAHUR_WINDOW = {
  startHour: 3,
  endHour: 4,
  xpMultiplier: 3.0,
  greeting: 'TUNG TUNG TUNG SAHUUUUUR',
} as const;

// ─── Divisiveness Thresholds ────────────────────────────────────────────────

/** Content with DI above this is boosted in feed. */
export const DI_BOOST_THRESHOLD = 70;

/** Content with DI below this is deprioritized. */
export const DI_SUPPRESS_THRESHOLD = 20;

/** Minimum reactions before DI is calculated. */
export const DI_MIN_REACTIONS = 10;
