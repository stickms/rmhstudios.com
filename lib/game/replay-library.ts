/**
 * The replay library, as pure logic (client-safe): what kind of record a row is, and which actions its owner may
 * take. The database side is `lib/replays.server.ts`; the pages are `components/replays/*`.
 *
 * A replay is one of three kinds:
 * - `run`: an ordinary saved run. The owner may publish, unlist and delete it.
 * - `ghost`: a race trace (Neon Driftway). Always unlisted, never public, deletable.
 * - `speedrun`: the proof behind a speedrun entry. Deleting or unlisting it would remove the run's evidence, so it
 *   can be neither.
 */
import { games } from '@/lib/catalog';
import { REPLAY_GAME_TITLES } from '@/lib/game/replay-meta';

export type ReplayVisibility = 'public' | 'unlisted';
export type ReplayKind = 'run' | 'ghost' | 'speedrun';

/** Games whose keyframe replays are race ghosts: saved unlisted, to be raced and not browsed. */
export const GHOST_GAME_IDS: readonly string[] = ['neon-driftway'];

/** One row of the member's own list. */
export interface LibraryReplay {
  id: string;
  game: string;
  score: number | null;
  durationMs: number;
  visibility: ReplayVisibility;
  kind: ReplayKind;
  createdAt: string;
}

export interface MyReplaysPage {
  items: LibraryReplay[];
  nextCursor: string | null;
  /** Every game the member has replays for (the filter's options), regardless of the filter applied. */
  games: string[];
}

/** One row of a game's public board. */
export interface BoardReplay {
  id: string;
  score: number | null;
  durationMs: number;
  createdAt: string;
  author: { id: string; name: string | null; image: string | null; handle: string | null };
}

export function replayKind(game: string, isSpeedrunProof: boolean): ReplayKind {
  if (isSpeedrunProof) return 'speedrun';
  return GHOST_GAME_IDS.includes(game) ? 'ghost' : 'run';
}

export function normalizeVisibility(value: string): ReplayVisibility {
  return value === 'public' ? 'public' : 'unlisted';
}

/** Why an action is refused: the reason the page shows as text. */
export type ReplayLock = 'speedrun' | 'ghost';

export interface ReplayActions {
  /** Whether the visibility switch can be changed at all. */
  canChangeVisibility: boolean;
  /** Whether the replay can be deleted. */
  canDelete: boolean;
  /** The reason an action is unavailable, or null when everything is allowed. */
  lock: ReplayLock | null;
}

export function allowedActions(kind: ReplayKind): ReplayActions {
  switch (kind) {
    case 'speedrun':
      return { canChangeVisibility: false, canDelete: false, lock: 'speedrun' };
    case 'ghost':
      return { canChangeVisibility: false, canDelete: true, lock: 'ghost' };
    case 'run':
      return { canChangeVisibility: true, canDelete: true, lock: null };
  }
}

/** Whether a replay of this kind may be set to `next`; the lock that refuses it otherwise. */
export function visibilityChangeRefusal(kind: ReplayKind, next: ReplayVisibility): ReplayLock | null {
  if (kind === 'speedrun') return 'speedrun';
  if (kind === 'ghost' && next === 'public') return 'ghost';
  return null;
}

/** Catalog title of a replayable game; the replay table's own name for the few that are not in the catalog. */
export function replayGameTitle(game: string): string {
  return games.find((g) => g.id === game)?.title ?? REPLAY_GAME_TITLES[game] ?? game;
}
