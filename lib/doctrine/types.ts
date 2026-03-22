/**
 * Doctrine Engine — Shared Type Definitions
 *
 * All TypeScript interfaces for the Doctrine Engine platform layer.
 */

// ─── Tiers ──────────────────────────────────────────────────────────────────

export type TierId = 'PUBLIC' | 'INSIDER' | 'OPERATOR';

export interface TierDefinition {
  id: TierId;
  name: string;
  price: number; // cents/month (0 for free)
  color: string;
  access: readonly string[];
}

// ─── Reputation ─────────────────────────────────────────────────────────────

export interface RankDefinition {
  name: string;
  minXp: number;
  badge: string;
}

export interface UserReputation {
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveAt: Date;
  coalitionScore: number;
  sahurCount: number;
  rank: RankDefinition;
}

// ─── Puzzles ────────────────────────────────────────────────────────────────

export type PuzzleMode = 'alibi' | 'spectrum' | 'outcast' | 'chainlink' | 'impostor';

export interface PuzzleData {
  mode: PuzzleMode;
  seed: number;
  difficulty: number;
  content: unknown; // Mode-specific
}

export interface DailyPuzzle {
  id: string;
  mode: PuzzleMode;
  date: string; // YYYY-MM-DD
  seed: number;
  data: PuzzleData;
  difficulty: number;
  resetsAt: Date;
  isSahur: boolean;
  stats: PuzzleStats;
}

export interface PuzzleStats {
  totalAttempts: number;
  totalSolves: number;
  averageTimeMs: number;
  firstSolveUserId: string | null;
  firstSolveAt: Date | null;
}

export interface PuzzleSubmission {
  puzzleId: string;
  userId: string;
  answer: unknown;
  timeMs: number;
  attempts: number;
  correct: boolean;
  score: number;
}

// ─── Reactions ──────────────────────────────────────────────────────────────

export type Reaction = 'fire' | 'based' | 'mid' | 'cringe' | 'trash' | 'tung';

export interface ReactionCount {
  fire: number;
  based: number;
  mid: number;
  cringe: number;
  trash: number;
  tung: number;
}

export const EMPTY_REACTIONS: ReactionCount = {
  fire: 0,
  based: 0,
  mid: 0,
  cringe: 0,
  trash: 0,
  tung: 0,
};

// ─── Safehouse ──────────────────────────────────────────────────────────────

export type SafehouseContentType =
  | 'DEV_LOG'
  | 'BUILD'
  | 'POSTMORTEM'
  | 'DECISION'
  | 'RAW_FOOTAGE'
  | 'FINANCIAL'
  | 'VOTE';

export interface SafehouseContent {
  id: string;
  type: SafehouseContentType;
  title: string;
  body: string;
  minTier: TierId;
  authorId: string;
  mediaUrls: string[];
  publishedAt: Date | null;
  reactions: ReactionCount;
  divisiveness: number;
}

// ─── Disclosures ────────────────────────────────────────────────────────────

export type DisclosureStatus = 'CLASSIFIED' | 'TEASED' | 'DISCLOSED' | 'ARCHIVED';

export interface Disclosure {
  id: string;
  codename: string;
  publicTitle: string;
  content: string;
  narrative: string;
  minTierTeaser: TierId;
  status: DisclosureStatus;
  scheduledAt: Date | null;
  teasedAt: Date | null;
  disclosedAt: Date | null;
  mediaUrls: string[];
  reactions: ReactionCount;
}

// ─── Recruitment ────────────────────────────────────────────────────────────

export interface Recruitment {
  id: string;
  recruiterId: string;
  code: string;
  personalMessage: string;
  targetSkills: string[];
  uses: number;
  maxUses: number;
  expiresAt: Date;
  convertedIds: string[];
}

// ─── Incidents ──────────────────────────────────────────────────────────────

export type IncidentSeverity = 'COSMETIC' | 'DEGRADED' | 'CRITICAL' | 'CATASTROPHIC';
export type IncidentStatus = 'ACTIVE' | 'MITIGATED' | 'RESOLVED' | 'LEGENDARY';

export type IncidentEventType =
  | 'detected'
  | 'acknowledged'
  | 'investigating'
  | 'update'
  | 'mitigated'
  | 'resolved';

export interface Incident {
  id: string;
  codename: string;
  severity: IncidentSeverity;
  title: string;
  narrative: string;
  status: IncidentStatus;
  firstReporterId: string | null;
  postmortemId: string | null;
  timeline: IncidentEvent[];
  reactions: ReactionCount;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface IncidentEvent {
  id: string;
  incidentId: string;
  type: IncidentEventType;
  message: string;
  createdAt: Date;
}

// ─── Sahur Mode ─────────────────────────────────────────────────────────────

export interface SahurModeConfig {
  active: boolean;
  theme: 'sahur';
  xpMultiplier: number;
  greeting: string;
  minutesRemaining: number;
}

export interface SahurStatus {
  active: boolean;
  minutesRemaining: number;
  nextSahurAt: Date | null;
}

// ─── Feed ───────────────────────────────────────────────────────────────────

export type FeedSortMode = 'recent' | 'divisive' | 'trending';

export interface FeedItem {
  id: string;
  type: 'safehouse' | 'disclosure' | 'incident' | 'changelog';
  title: string;
  preview: string;
  createdAt: Date;
  reactions: ReactionCount;
  divisiveness: number;
}

// ─── Changelog ──────────────────────────────────────────────────────────────

export interface ChangelogEntry {
  id: string;
  type: 'disclosure' | 'incident_resolved' | 'phase_transition' | 'feature_launch';
  codename: string;
  headline: string;
  narrative: string;
  date: Date;
  divisiveness: number;
  reactions: ReactionCount;
}
