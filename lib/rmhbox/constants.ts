/**
 * RMHbox — Shared Constants
 *
 * All tuning constants used by both client and server.
 * Server-specific configuration lives in server/rmhbox/config.ts.
 *
 * Reference: docs/rmhbox/design-spec/core.md §23
 */

// ─── Lobby ───────────────────────────────────────────────────────

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DEFAULT_MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
export const ABSOLUTE_MAX_PLAYERS = 16;
export const DEFAULT_MAX_SPECTATORS = 20;
export const MAX_SPECTATORS = 50;
export const CHAT_MAX_LENGTH = 200;
export const CHAT_HISTORY_LENGTH = 100;

// ─── Timers ──────────────────────────────────────────────────────

export const HEARTBEAT_INTERVAL_MS = 10_000;
export const LOBBY_IDLE_TIMEOUT_MS = 15 * 60 * 1000;       // 15 min
export const LOBBY_ABSOLUTE_TIMEOUT_MS = 30 * 60 * 1000;   // 30 min
export const LOBBY_EMPTY_TIMEOUT_MS = 2 * 60 * 1000;       // 2 min
export const DISCONNECT_GRACE_PERIOD_MS = 120_000;          // 2 min
export const GAME_DISCONNECT_GRACE_MS = 15_000;             // 15 sec (in-game)
export const VOTE_DURATION_SECONDS = 30;
export const DEFAULT_INSTRUCTION_DURATION_SECONDS = 15;
export const PRELOAD_TIMEOUT_MS = 30_000;                   // 30 sec
export const COUNTDOWN_SECONDS = 3;
export const RESULTS_DISPLAY_SECONDS = 10;
export const LOBBY_GC_INTERVAL_MS = 60_000;                 // 1 min

// ─── Voting ──────────────────────────────────────────────────────

export const VOTE_CANDIDATE_COUNT = 5;

// ─── Game Settings (§12A) ────────────────────────────────────────

export const GAME_SETTINGS_POST_VOTE_TIMEOUT = 30;
export const MAX_GAME_SETTINGS_PER_MINIGAME = 20;

// ─── Rate Limits ─────────────────────────────────────────────────

export const SOCKET_RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  'rmhbox:lobby:create':       { max: 5,   windowMs: 60_000 },
  'rmhbox:lobby:join':         { max: 10,  windowMs: 60_000 },
  'rmhbox:lobby:chat':         { max: 20,  windowMs: 60_000 },
  'rmhbox:game:input':         { max: 100, windowMs: 10_000 },
  'rmhbox:game:cast_vote':     { max: 10,  windowMs: 60_000 },
  'rmhbox:leaderboard:fetch':  { max: 5,   windowMs: 60_000 },
};

// ─── Rhyme Time (RT) ─────────────────────────────────────────────

export const RT_TOTAL_ROUNDS = 3;
export const RT_INPUT_DURATION = 45;
export const RT_SCORING_DURATION = 10;
export const RT_INTERMISSION_DURATION = 10;
export const RT_ROUND_START_DURATION = 2;
export const RT_MAX_SUBMISSIONS = 30;
export const RT_COMMON_POINTS = 1;
export const RT_UNCOMMON_POINTS = 3;
export const RT_RARE_POINTS = 5;
export const RT_MULTI_SYLLABLE_MULT = 2;
export const RT_SPEED_BONUS = 2;
export const RT_INVALID_PENALTY = -1;
export const RT_MIN_RHYMES = 15;
export const RT_MAX_FREQ_RANK = 5000;
export const RT_MIN_WORD_LEN = 2;
export const RT_MAX_WORD_LEN = 30;

// ─── Undercover Agent (UA) ───────────────────────────────────────

export const UA_GRID_SIZE = 25;
export const UA_GRID_COLS = 5;
export const UA_FIRST_TEAM_AGENTS = 9;
export const UA_SECOND_TEAM_AGENTS = 8;
export const UA_ASSASSIN = 1;
export const UA_BYSTANDER = 7;
export const UA_SETUP_DURATION = 2;
export const UA_SPYMASTER_TIMEOUT = 90;
export const UA_OPERATIVE_TIMEOUT = 120;
export const UA_TURN_TRANSITION = 3;
export const UA_MAX_UNLIMITED = 25;
export const UA_MAX_PASSES = 6;
export const UA_WIN = 500;
export const UA_WIN_OPERATIVE = 500;
export const UA_LOSE = 100;
export const UA_CLUE_EFFICIENCY = 20;
export const UA_CORRECT_GUESS = 50;
export const UA_ASSASSIN_PENALTY = -100;

// ─── Category Crash (CC) ────────────────────────────────────────

export const CC_TOTAL_ROUNDS = 2;
export const CC_CATEGORIES_PER_ROUND = 5;
export const CC_INPUT_DURATION = 60;
export const CC_PEER_REVIEW_DURATION = 30;
export const CC_CRASH_RESOLUTION = 5;
export const CC_ROUND_RESULTS = 8;
export const CC_REVEAL = 3;
export const CC_MAX_ANSWER_LENGTH = 50;
export const CC_MAX_CRASHES = 5;
export const CC_CRASH_THRESHOLD_PERCENT = 50;
export const CC_UNIQUE_POINTS = 10;
export const CC_SHARED_POINTS = 5;
export const CC_CRASH_BONUS = 2;
export const CC_CRASH_PENALTY = -1;
export const CC_FUZZY_THRESHOLD = 0.85;
export const CC_SAVE_DEBOUNCE = 500;
export const CC_CATEGORY_DISTRIBUTION = { easy: 2, medium: 2, hard: 1 };
export const CC_LETTER_WEIGHTS: Record<string, number> = {
  A: 10, B: 5, C: 5, D: 5, E: 8, F: 4, G: 4, H: 4, I: 5, J: 2,
  K: 2, L: 5, M: 5, N: 5, O: 5, P: 5, Q: 1, R: 5, S: 8, T: 8,
  U: 3, V: 2, W: 3, X: 1, Y: 2, Z: 1,
};

// ─── Wiki-Race (WR) ─────────────────────────────────────────────

export const WR_TOTAL_ROUNDS = 3;
export const WR_NAV_DURATION = 180;
export const WR_REVEAL = 5;
export const WR_RESULTS = 8;
export const WR_MIN_PATH = 3;
export const WR_MAX_PATH = 8;
export const WR_FINISH_BASE = 500;
export const WR_SPEED_BONUS_PER_SEC = 5;
export const WR_EFFICIENCY_BONUS = 50;
export const WR_ONE_AWAY = 200;
export const WR_DNF_BASE = 50;
export const WR_DNF_CLICK_BONUS = 10;
export const WR_CACHE_MAX = 500;
export const WR_CACHE_TTL = 600000;
export const WR_NAV_RATE_LIMIT = 3;
export const WR_MAX_PAIR_POOL = 200;

// ─── Minimalist Masterpiece (MM) ────────────────────────────────

export const MM_PROMPT_REVEAL_SECONDS = 3;
export const MM_DRAWING_DURATION_SECONDS = 60;
export const MM_GALLERY_DURATION_SECONDS = 15;
export const MM_AUCTION_DURATION_SECONDS = 60;
export const MM_RESULTS_DURATION_SECONDS = 10;
export const MM_DEFAULT_ROUNDS = 3;
export const MM_MAX_STROKES = 5;
export const MM_CANVAS_SIZE = 400;
export const MM_STROKE_WIDTH = 4;
export const MM_MIN_POINTS_PER_STROKE = 2;
export const MM_MAX_POINTS_PER_STROKE = 2;
export const MM_MIN_STROKE_DURATION_MS = 100;
export const MM_COLOR_PALETTE = [
  '#1a1a2e',
  '#e0e0f0',
  '#f87171',
  '#4ade80',
  '#60a5fa',
  '#fbbf24',
  '#fb923c',
  '#c084fc',
];
export const MM_STARTING_CURRENCY = 1000;
export const MM_BID_INCREMENT = 50;
export const MM_RANK_1_POINTS = 500;
export const MM_RANK_2_POINTS = 350;
export const MM_RANK_3_POINTS = 250;
export const MM_PARTICIPATION_POINTS = 100;
export const MM_INVESTMENT_BONUS = 50;

// ─── Emoji Cinema (EC) ─────────────────────────────────────────

export const EC_MAX_ROUNDS = 6;
export const EC_PRODUCER_ASSIGNMENT_SECONDS = 2;
export const EC_MOVIE_SELECTION_SECONDS = 15;
export const EC_MOVIE_CHOICES_COUNT = 3;
export const EC_ROUND_DURATION_SECONDS = 45;
export const EC_ROUND_RESULTS_SECONDS = 5;
export const EC_TRANSITION_SECONDS = 1;
export const EC_MAX_EMOJIS = 12;
export const EC_MAX_GUESSES_PER_PLAYER = 15;
export const EC_MAX_GUESS_LENGTH = 200;
export const EC_FUZZY_MATCH_THRESHOLD = 0.80;
export const EC_CLOSE_THRESHOLD = 0.60;
export const EC_MIN_POPULARITY = 40;
export const EC_PRODUCER_BASE_POINTS = 100;
export const EC_PRODUCER_SPEED_BONUS = 10;
export const EC_FIRST_GUESS_POINTS = 300;
export const EC_SECOND_GUESS_POINTS = 150;
export const EC_OTHER_GUESS_POINTS = 75;
export const EC_PRODUCER_DISCONNECT_WAIT_SECONDS = 10;
export const EC_EMOJI_PALETTE_SIZE = 200;

// ─── Wit-War (WW) ───────────────────────────────────────────────

export const WW_TOTAL_ROUNDS = 2;
export const WW_PROMPTS_PER_PLAYER = 2;
export const WW_WRITING_DURATION = 60;
export const WW_VOTING_DURATION = 15;
export const WW_MATCHUP_RESULTS_DURATION = 5;
export const WW_ROUND_RESULTS_DURATION = 8;
export const WW_PROMPT_REVEAL_DURATION = 3;
export const WW_MAX_ANSWER_LENGTH = 200;
export const WW_MAX_MATCHUP_POINTS = 1000;
export const WW_WITWHAM_BONUS = 500;
export const WW_SAFETY_QUIP = '(no answer submitted)';
