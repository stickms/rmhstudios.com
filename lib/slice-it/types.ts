/**
 * Slice It — the data shapes shared by the engine, the API and the hub.
 *
 * Browser-free and Node-free, for the same reason as `constants.ts`: the
 * esbuild server bundle compiles this file directly.
 */

import type { Difficulty, HitResult, SliceType } from './constants';

export type { Difficulty, HitResult, SliceType };

/** One note in a chart. `hit`/`hitTime` are runtime render state, never stored. */
export interface Slice {
  id: string;
  /** Seconds from the start of the track. */
  time: number;
  type: SliceType;
  /** LONG notes only — how long the note is held, in seconds. */
  duration?: number;
  /** 0 = top/left, 1 = bottom/right. */
  lane: number;
  /** SPEED notes only. */
  speedMultiplier?: number;
  hit?: boolean;
  /** `performance.now()` when it was resolved, for the fade-out. */
  hitTime?: number;
}

/**
 * A generated chart.
 *
 * `slices` is either one flat list (legacy maps generated before per-difficulty
 * charts existed) or a record keyed by difficulty. Both shapes are still in the
 * database, so both have to keep loading — `resolveSlices` in `chart.ts` is the
 * single place that knows the difference.
 */
export interface BeatMap {
  id: string;
  name: string;
  artist: string;
  audioUrl: string;
  bpm: number;
  slices: Slice[] | Record<Difficulty, Slice[]>;
}

/** The per-player run configuration. Chosen client-side, verified server-side. */
export interface Modifiers {
  /** Notes fade out before the hit line. */
  invisible: boolean;
  /** Playback rate. Below 1.0 is unranked and banned in multiplayer. */
  speed: number;
  /** One miss ends the run. */
  suddenDeath: boolean;
  /** Some notes become bombs you must not slice. */
  bombs: boolean;
  /** Some notes jump lanes on approach. */
  switching: boolean;
  /** The playfield rotates. */
  spin: boolean;
  /** Hit windows shrink to 70%. */
  strictTiming: boolean;
  /** Every note arrives on one lane. */
  oneTrack: boolean;
  /** Note density. */
  difficulty: Difficulty;
}

/** The tally the engine keeps and the score route re-derives its checks from. */
export interface RunStats {
  score: number;
  maxCombo: number;
  /** 0–1. */
  accuracy: number;
  /** Non-bomb, non-silent notes that were resolved one way or the other. */
  notesResolved: number;
  /** Judgement histogram, for the results screen. */
  judgements: Record<Exclude<HitResult, 'NONE'>, number>;
}

/**
 * A song as the client sees it.
 *
 * The API returns exactly this — no Prisma row leaks through, which is how
 * `uploadedBy` used to reach every anonymous visitor alongside the uploader's
 * name. `analysisData` is omitted from list responses (a chart is hundreds of
 * kilobytes; thirty of them is a multi-megabyte page) and only present on the
 * single-song read the player is about to play.
 */
export interface SliceSong {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  description: string | null;
  /** Seconds. */
  duration: number;
  bpm: number;
  coverUrl: string | null;
  /** The stream endpoint, never a storage key. */
  audioUrl: string;
  uploader: {
    id: string;
    name: string;
    image: string | null;
  };
  /** True when the signed-in caller uploaded it. */
  isOwner: boolean;
  plays: number;
  likeCount: number;
  scoreCount: number;
  commentCount: number;
  isLiked: boolean;
  /** How many times the signed-in caller has played it; 0 when anonymous. */
  userPlays: number;
  createdAt: string;
  /** Present only on the single-song read. */
  analysisData?: BeatMap | null;
  /**
   * Signed receipt that this run started now, returned to a signed-in caller by
   * the single-song read and handed back with the score. See
   * `lib/slice-it/run-token.server.ts`.
   */
  runToken?: string;
}

export interface SongPage {
  songs: SliceSong[];
  /** Opaque cursor for the next page, or null at the end. */
  nextCursor: string | null;
  /**
   * Total matching rows — present on the FIRST page only.
   *
   * It exists for one label ("Load more (N total)"), and computing it means an
   * unindexable `ILIKE '%…%'` count under a search term. Every page of a given
   * query would return the same number, so it is paid for once and the client
   * keeps it.
   */
  total?: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  image: string | null;
  score: number;
  maxCombo: number;
  accuracy: number | null;
  speedMod: number;
  modifiers: Partial<Modifiers> | null;
  achievedAt: string;
  /** True for the signed-in caller's own row. */
  isSelf: boolean;
}
