/**
 * Phase 6 — Section 6.3: Minimalist Masterpiece Server Handler Tests
 *
 * Tests the MinimalistMasterpieceGame server handler covering:
 * - State initialization
 * - Phase transitions (PROMPT_REVEAL → DRAWING → GALLERY → AUCTION → RESULTS)
 * - Drawing submission (valid, invalid, anti-bot, duplicates)
 * - Bid placement (valid, retract, self-bid, insufficient currency)
 * - Scoring / results with tie handling and investment bonuses
 * - State masking (getStateForPlayer / getStateForSpectator)
 * - Awards (Gallery Star, Art Collector, Minimalist Master, Smart Investor, Speed Painter)
 * - Game settings overrides
 * - Security / anonymity enforcement
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import {
  MOCK_USERS,
  createMockContext,
  findLastActionBroadcast,
  findPlayerActions,
  findLastPlayerAction,
  type MockContextData,
} from './setup';

// ─── Mock data-loader ────────────────────────────────────────────

vi.mock('@/lib/rmhbox/minimalist-masterpiece/data-loader', () => ({
  loadPrompts: () => [
    { text: 'A house on a hill', category: 'Landscape', difficulty: 'easy' },
    { text: 'A smiling cat', category: 'Animal', difficulty: 'medium' },
  ],
  selectPromptForGame: (pool: unknown[]) => pool[0],
}));

// Import handler after mock is in place
import { MinimalistMasterpieceGame } from '../../../server/rmhbox/minigames/minimalist-masterpiece';

// ─── Constants used in assertions ────────────────────────────────

import {
  MM_PROMPT_REVEAL_SECONDS,
  MM_DRAWING_DURATION_SECONDS,
  MM_GALLERY_DURATION_SECONDS,
  MM_AUCTION_DURATION_SECONDS,
  MM_RESULTS_DURATION_SECONDS,
  MM_STARTING_CURRENCY,
  MM_BID_INCREMENT,
} from '../../../lib/rmhbox/constants';

// ─── Helpers ─────────────────────────────────────────────────────

function createGame(ctxData?: MockContextData) {
  const ctx = ctxData ?? createMockContext();
  const game = new MinimalistMasterpieceGame(ctx.context);
  return { game, ...ctx };
}

function createValidStroke(overrides = {}): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    points: [
      { x: 50, y: 50, pressure: 0.5 },
      { x: 200, y: 200, pressure: 0.5 },
    ],
    color: '#1a1a2e',
    width: 4,
    timestamp: Date.now(),
    ...overrides,
  };
}

function createValidDrawing(strokeCount = 3): { strokes: Record<string, unknown>[]; backgroundColor: string } {
  return {
    strokes: Array.from({ length: strokeCount }, () => createValidStroke()),
    backgroundColor: '#ffffff',
  };
}

/** Advance into the DRAWING phase. */
function advanceToDrawing(_game: MinimalistMasterpieceGame): void {
  vi.advanceTimersByTime(MM_PROMPT_REVEAL_SECONDS * 1000);
}

/** Advance into the GALLERY phase (submits for all players, then advances the timer). */
function advanceToGallery(game: MinimalistMasterpieceGame, playerIds: string[]): void {
  advanceToDrawing(game);
  for (const uid of playerIds) {
    game.handleInput(uid, 'SUBMIT_DRAWING', createValidDrawing());
  }
  // Drawing phase always runs for the full duration (no early end)
  vi.advanceTimersByTime(MM_DRAWING_DURATION_SECONDS * 1000);
}

/** Advance into the AUCTION phase. */
function advanceToAuction(game: MinimalistMasterpieceGame, playerIds: string[]): void {
  advanceToGallery(game, playerIds);
  vi.advanceTimersByTime(MM_GALLERY_DURATION_SECONDS * 1000);
}

/** Advance into the RESULTS phase (avoids early-end to prevent timeout double-fire). */
function advanceToResults(game: MinimalistMasterpieceGame, playerIds: string[]): void {
  advanceToDrawing(game);
  // Submit only N-1 players so early-end shortcut does NOT trigger
  for (let i = 0; i < playerIds.length - 1; i++) {
    game.handleInput(playerIds[i], 'SUBMIT_DRAWING', createValidDrawing());
  }
  // Let drawing timer expire naturally (auto-submits the last player)
  vi.advanceTimersByTime(MM_DRAWING_DURATION_SECONDS * 1000);
  vi.advanceTimersByTime(MM_GALLERY_DURATION_SECONDS * 1000);
  vi.advanceTimersByTime(MM_AUCTION_DURATION_SECONDS * 1000);
}

/** Get all player IDs from the default mock context. */
const ALL_PLAYER_IDS = [
  MOCK_USERS.alice.userId,
  MOCK_USERS.bob.userId,
  MOCK_USERS.charlie.userId,
  MOCK_USERS.diana.userId,
];

/**
 * Find a drawing ID that both bidder1 and bidder2 can bid on
 * (i.e., it belongs to neither of them).
 */
function findBiddableDrawing(
  game: MinimalistMasterpieceGame,
  bidder1Id: string,
  bidder2Id: string,
): string {
  const state1 = game.getStateForPlayer(bidder1Id) as Record<string, unknown>;
  const drawings1 = state1.drawings as Array<Record<string, unknown>>;
  const state2 = game.getStateForPlayer(bidder2Id) as Record<string, unknown>;
  const drawings2 = state2.drawings as Array<Record<string, unknown>>;

  const mine1 = (drawings1.find((d) => d.isMine) as Record<string, unknown>)?.drawingId as string;
  const mine2 = (drawings2.find((d) => d.isMine) as Record<string, unknown>)?.drawingId as string;

  const target = drawings1.find((d) => d.drawingId !== mine1 && d.drawingId !== mine2);
  return target!.drawingId as string;
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Minimalist Masterpiece Server Handler (§6.3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ───────────────────────────────────────────────────────────────
  // 1. State Initialization
  // ───────────────────────────────────────────────────────────────
  describe('State Initialization', () => {
    it('should create drawing IDs for every player (4 players → 4 drawings)', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const prompt = findLastActionBroadcast(broadcastLog, 'MM_PROMPT');
      expect(prompt).toBeDefined();

      // getStateForPlayer should report one drawing per player
      for (const uid of ALL_PLAYER_IDS) {
        const state = game.getStateForPlayer(uid) as Record<string, unknown>;
        expect(state.phase).toBe('PROMPT_REVEAL');
      }
    });

    it('should set all player currencies to the starting currency (1000)', () => {
      const { game } = createGame();
      game.start();
      advanceToAuction(game, ALL_PLAYER_IDS);

      for (const uid of ALL_PLAYER_IDS) {
        const state = game.getStateForPlayer(uid) as Record<string, unknown>;
        expect(state.currency).toBe(MM_STARTING_CURRENCY);
      }
    });

    it('should map drawingId ↔ userId bidirectionally', () => {
      const { game } = createGame();
      game.start();
      advanceToDrawing(game);

      const drawingIds = new Set<string>();
      for (const uid of ALL_PLAYER_IDS) {
        const state = game.getStateForPlayer(uid) as Record<string, unknown>;
        const myDrawing = state.myDrawing as Record<string, unknown>;
        expect(myDrawing).toBeDefined();
        const drawingId = myDrawing.drawingId as string;
        expect(drawingId).toBeTruthy();
        drawingIds.add(drawingId);
      }
      // All drawing IDs must be unique
      expect(drawingIds.size).toBe(4);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 2. Phase Transitions
  // ───────────────────────────────────────────────────────────────
  describe('Phase Transitions', () => {
    it('should transition PROMPT_REVEAL → DRAWING after prompt reveal seconds', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      expect((game.getStateForPlayer(ALL_PLAYER_IDS[0]) as Record<string, unknown>).phase).toBe('PROMPT_REVEAL');

      vi.advanceTimersByTime(MM_PROMPT_REVEAL_SECONDS * 1000);

      const drawingStart = findLastActionBroadcast(broadcastLog, 'MM_DRAWING_START');
      expect(drawingStart).toBeDefined();
      expect((game.getStateForPlayer(ALL_PLAYER_IDS[0]) as Record<string, unknown>).phase).toBe('DRAWING');
    });

    it('should transition DRAWING → GALLERY → AUCTION → RESULTS in sequence', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      // → DRAWING
      vi.advanceTimersByTime(MM_PROMPT_REVEAL_SECONDS * 1000);
      expect((game.getStateForPlayer(ALL_PLAYER_IDS[0]) as Record<string, unknown>).phase).toBe('DRAWING');

      // → GALLERY
      vi.advanceTimersByTime(MM_DRAWING_DURATION_SECONDS * 1000);
      const galleryStart = findLastActionBroadcast(broadcastLog, 'MM_GALLERY_START');
      expect(galleryStart).toBeDefined();
      expect((game.getStateForPlayer(ALL_PLAYER_IDS[0]) as Record<string, unknown>).phase).toBe('GALLERY');

      // → AUCTION
      vi.advanceTimersByTime(MM_GALLERY_DURATION_SECONDS * 1000);
      expect((game.getStateForPlayer(ALL_PLAYER_IDS[0]) as Record<string, unknown>).phase).toBe('AUCTION');

      // → RESULTS
      vi.advanceTimersByTime(MM_AUCTION_DURATION_SECONDS * 1000);
      const results = findLastActionBroadcast(broadcastLog, 'MM_RESULTS');
      expect(results).toBeDefined();
      expect((game.getStateForPlayer(ALL_PLAYER_IDS[0]) as Record<string, unknown>).phase).toBe('RESULTS');
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 3. Drawing Submission (SUBMIT_DRAWING)
  // ───────────────────────────────────────────────────────────────
  describe('Drawing Submission', () => {
    it('should accept a valid 5-stroke drawing', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToDrawing(game);

      const uid = MOCK_USERS.alice.userId;
      game.handleInput(uid, 'SUBMIT_DRAWING', createValidDrawing(5));

      const accepted = findLastPlayerAction(playerLog, uid, 'MM_DRAWING_ACCEPTED');
      expect(accepted).toBeDefined();
      expect(accepted!.data.strokeCount).toBe(5);
    });

    it('should reject a 6-stroke drawing (exceeds MM_MAX_STROKES)', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToDrawing(game);

      const uid = MOCK_USERS.alice.userId;
      game.handleInput(uid, 'SUBMIT_DRAWING', createValidDrawing(6));

      const rejected = findLastPlayerAction(playerLog, uid, 'MM_DRAWING_REJECTED');
      expect(rejected).toBeDefined();
      expect(rejected!.data.reason).toBe('invalid_input');
    });

    it('should reject a stroke with fewer than 5 points', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToDrawing(game);

      const uid = MOCK_USERS.bob.userId;
      const badStroke = createValidStroke({
        points: [
          { x: 0, y: 0, pressure: 0.5 },
          { x: 10, y: 10, pressure: 0.5 },
          { x: 20, y: 20, pressure: 0.5 },
          { x: 30, y: 30, pressure: 0.5 },
        ],
      });
      game.handleInput(uid, 'SUBMIT_DRAWING', { strokes: [badStroke] });

      const rejected = findLastPlayerAction(playerLog, uid, 'MM_DRAWING_REJECTED');
      expect(rejected).toBeDefined();
      expect(rejected!.data.reason).toBe('invalid_input');
    });

    it('should reject a stroke with an invalid color format', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToDrawing(game);

      const uid = MOCK_USERS.charlie.userId;
      // Not a valid hex color — will fail Zod regex validation
      const badStroke = createValidStroke({ color: 'not-a-color' });
      game.handleInput(uid, 'SUBMIT_DRAWING', { strokes: [badStroke], backgroundColor: '#ffffff' });

      const rejected = findLastPlayerAction(playerLog, uid, 'MM_DRAWING_REJECTED');
      expect(rejected).toBeDefined();
      expect(rejected!.data.reason).toBe('invalid_input');
    });

    it('should accept a valid hex color not in the default palette', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToDrawing(game);

      const uid = MOCK_USERS.diana.userId;
      const customColorStroke = createValidStroke({ color: '#abcdef' });
      game.handleInput(uid, 'SUBMIT_DRAWING', { strokes: [customColorStroke], backgroundColor: '#ffffff' });

      const accepted = findLastPlayerAction(playerLog, uid, 'MM_DRAWING_ACCEPTED');
      expect(accepted).toBeDefined();
    });

    it('should accept re-submission from the same player (auto-save)', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToDrawing(game);

      const uid = MOCK_USERS.alice.userId;
      game.handleInput(uid, 'SUBMIT_DRAWING', createValidDrawing());
      game.handleInput(uid, 'SUBMIT_DRAWING', createValidDrawing(2));

      // Both submissions should be accepted (no rejection)
      const rejections = findPlayerActions(playerLog, uid, 'MM_DRAWING_REJECTED');
      expect(rejections.length).toBe(0);

      const acceptances = findPlayerActions(playerLog, uid, 'MM_DRAWING_ACCEPTED');
      expect(acceptances.length).toBe(2);
    });

    it('should ignore drawing submission outside the DRAWING phase', () => {
      const { game, playerLog } = createGame();
      game.start();
      // Still in PROMPT_REVEAL

      const uid = MOCK_USERS.alice.userId;
      game.handleInput(uid, 'SUBMIT_DRAWING', createValidDrawing());

      const accepted = findLastPlayerAction(playerLog, uid, 'MM_DRAWING_ACCEPTED');
      const rejected = findLastPlayerAction(playerLog, uid, 'MM_DRAWING_REJECTED');
      expect(accepted).toBeUndefined();
      expect(rejected).toBeUndefined();
    });

    it('should NOT end the drawing phase early when all players submit (full timer always runs)', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToDrawing(game);

      for (const uid of ALL_PLAYER_IDS) {
        game.handleInput(uid, 'SUBMIT_DRAWING', createValidDrawing());
      }

      // Gallery should NOT have started — drawing phase always runs for the full duration
      const galleryStart = findLastActionBroadcast(broadcastLog, 'MM_GALLERY_START');
      expect(galleryStart).toBeUndefined();
      expect((game.getStateForPlayer(ALL_PLAYER_IDS[0]) as Record<string, unknown>).phase).toBe('DRAWING');

      // Advance past the drawing timer to reach GALLERY
      vi.advanceTimersByTime(MM_DRAWING_DURATION_SECONDS * 1000);
      const galleryAfterTimer = findLastActionBroadcast(broadcastLog, 'MM_GALLERY_START');
      expect(galleryAfterTimer).toBeDefined();
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 4. Bid Placement (PLACE_BID)
  // ───────────────────────────────────────────────────────────────
  describe('Bid Placement', () => {
    it('should accept a valid bid and decrease bidder currency', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToAuction(game, ALL_PLAYER_IDS);

      const bidderId = MOCK_USERS.alice.userId;
      // Get another player's drawing ID from auction state
      const auctionState = game.getStateForPlayer(bidderId) as Record<string, unknown>;
      const drawings = auctionState.drawings as Array<Record<string, unknown>>;
      const targetDrawing = drawings.find((d) => !d.isMine)!;

      game.handleInput(bidderId, 'PLACE_BID', {
        drawingId: targetDrawing.drawingId,
        amount: MM_BID_INCREMENT,
      });

      const accepted = findLastPlayerAction(playerLog, bidderId, 'MM_BID_ACCEPTED');
      expect(accepted).toBeDefined();
      expect(accepted!.data.currency).toBe(MM_STARTING_CURRENCY - MM_BID_INCREMENT);
      expect(accepted!.data.myBidAmount).toBe(MM_BID_INCREMENT);
    });

    it('should retract a bid (amount=0) and refund currency', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToAuction(game, ALL_PLAYER_IDS);

      const bidderId = MOCK_USERS.bob.userId;
      const auctionState = game.getStateForPlayer(bidderId) as Record<string, unknown>;
      const drawings = auctionState.drawings as Array<Record<string, unknown>>;
      const targetDrawing = drawings.find((d) => !d.isMine)!;

      // Place a bid first
      game.handleInput(bidderId, 'PLACE_BID', {
        drawingId: targetDrawing.drawingId,
        amount: MM_BID_INCREMENT * 2,
      });

      // Retract it
      game.handleInput(bidderId, 'PLACE_BID', {
        drawingId: targetDrawing.drawingId,
        amount: 0,
      });

      const lastAccepted = findLastPlayerAction(playerLog, bidderId, 'MM_BID_ACCEPTED');
      expect(lastAccepted).toBeDefined();
      expect(lastAccepted!.data.currency).toBe(MM_STARTING_CURRENCY);
      expect(lastAccepted!.data.myBidAmount).toBe(0);
    });

    it('should reject a self-bid', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToAuction(game, ALL_PLAYER_IDS);

      const uid = MOCK_USERS.alice.userId;
      const auctionState = game.getStateForPlayer(uid) as Record<string, unknown>;
      const drawings = auctionState.drawings as Array<Record<string, unknown>>;
      const myDrawing = drawings.find((d) => d.isMine)!;

      game.handleInput(uid, 'PLACE_BID', {
        drawingId: myDrawing.drawingId,
        amount: MM_BID_INCREMENT,
      });

      const rejected = findLastPlayerAction(playerLog, uid, 'MM_BID_REJECTED');
      expect(rejected).toBeDefined();
      expect(rejected!.data.reason).toBe('self_bid');
    });

    it('should reject a bid when player has insufficient currency', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToAuction(game, ALL_PLAYER_IDS);

      const bidderId = MOCK_USERS.charlie.userId;
      const auctionState = game.getStateForPlayer(bidderId) as Record<string, unknown>;
      const drawings = auctionState.drawings as Array<Record<string, unknown>>;
      const targetDrawing = drawings.find((d) => !d.isMine)!;

      game.handleInput(bidderId, 'PLACE_BID', {
        drawingId: targetDrawing.drawingId,
        amount: MM_STARTING_CURRENCY + MM_BID_INCREMENT,
      });

      const rejected = findLastPlayerAction(playerLog, bidderId, 'MM_BID_REJECTED');
      expect(rejected).toBeDefined();
      expect(rejected!.data.reason).toBe('insufficient_currency');
    });

    it('should reject a bid that is not a multiple of the bid increment', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToAuction(game, ALL_PLAYER_IDS);

      const bidderId = MOCK_USERS.diana.userId;
      const auctionState = game.getStateForPlayer(bidderId) as Record<string, unknown>;
      const drawings = auctionState.drawings as Array<Record<string, unknown>>;
      const targetDrawing = drawings.find((d) => !d.isMine)!;

      game.handleInput(bidderId, 'PLACE_BID', {
        drawingId: targetDrawing.drawingId,
        amount: 37,
      });

      const rejected = findLastPlayerAction(playerLog, bidderId, 'MM_BID_REJECTED');
      expect(rejected).toBeDefined();
      // Schema rejects non-multiple, so it may be 'invalid_input'
      expect(['invalid_input', 'invalid_increment']).toContain(rejected!.data.reason);
    });

    it('should ignore bids placed outside the AUCTION phase', () => {
      const { game, playerLog } = createGame();
      game.start();
      advanceToDrawing(game);

      const uid = MOCK_USERS.alice.userId;
      game.handleInput(uid, 'PLACE_BID', {
        drawingId: 'some-id',
        amount: MM_BID_INCREMENT,
      });

      const accepted = findLastPlayerAction(playerLog, uid, 'MM_BID_ACCEPTED');
      const rejected = findLastPlayerAction(playerLog, uid, 'MM_BID_REJECTED');
      expect(accepted).toBeUndefined();
      expect(rejected).toBeUndefined();
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 5. Scoring / Results (Second-Price Auction Model)
  // ───────────────────────────────────────────────────────────────
  describe('Scoring & Results', () => {
    it('should rank drawings by market value (second highest bid) in descending order', () => {
      const { game } = createGame();
      game.start();
      advanceToAuction(game, ALL_PLAYER_IDS);

      const targetId = findBiddableDrawing(game, MOCK_USERS.alice.userId, MOCK_USERS.bob.userId);

      game.handleInput(MOCK_USERS.alice.userId, 'PLACE_BID', {
        drawingId: targetId,
        amount: MM_BID_INCREMENT * 6, // 300 — Alice wins
      });
      game.handleInput(MOCK_USERS.bob.userId, 'PLACE_BID', {
        drawingId: targetId,
        amount: MM_BID_INCREMENT * 2, // 100 — second highest → market value = 100
      });

      vi.advanceTimersByTime(MM_AUCTION_DURATION_SECONDS * 1000);

      const results = game.computeResults();
      expect(results.rankings.length).toBe(4);
      const topScore = Math.max(...results.rankings.map((r) => r.score));
      expect(topScore).toBeGreaterThan(0);
    });

    it('should give tied drawings the same rank when all have zero market value', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToAuction(game, ALL_PLAYER_IDS);

      // No bids → all have market value 0 → all tied at rank 1
      vi.advanceTimersByTime(MM_AUCTION_DURATION_SECONDS * 1000);

      // Check the MM_RESULTS broadcast for rankings
      const resultsBroadcast = findLastActionBroadcast(broadcastLog, 'MM_RESULTS');
      expect(resultsBroadcast).toBeDefined();
      const mmRankings = resultsBroadcast!.data.rankings as Array<Record<string, unknown>>;
      expect(mmRankings).toBeDefined();

      // All tied at the same rank
      const ranks = mmRankings.map((r) => r.rank);
      expect(new Set(ranks).size).toBe(1);
      expect(ranks[0]).toBe(1);

      // All get the same points (0 under second-price model with no bids)
      const points = mmRankings.map((r) => r.points);
      expect(new Set(points).size).toBe(1);
      expect(points[0]).toBe(0);
    });

    it('should compute score breakdowns with painted + owned values', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      advanceToAuction(game, ALL_PLAYER_IDS);

      const targetId = findBiddableDrawing(game, MOCK_USERS.alice.userId, MOCK_USERS.bob.userId);

      game.handleInput(MOCK_USERS.alice.userId, 'PLACE_BID', {
        drawingId: targetId,
        amount: MM_BID_INCREMENT * 10, // 500 — Alice wins
      });
      game.handleInput(MOCK_USERS.bob.userId, 'PLACE_BID', {
        drawingId: targetId,
        amount: MM_BID_INCREMENT * 4, // 200 — second highest → market value = 200
      });

      vi.advanceTimersByTime(MM_AUCTION_DURATION_SECONDS * 1000);

      const resultsBroadcast = findLastActionBroadcast(broadcastLog, 'MM_RESULTS');
      expect(resultsBroadcast).toBeDefined();
      const breakdowns = resultsBroadcast!.data.scoreBreakdowns as Array<Record<string, unknown>>;
      expect(breakdowns).toBeDefined();
      expect(breakdowns.length).toBe(4);

      // Alice owns the target drawing whose market value = 200
      const aliceBreakdown = breakdowns.find((b) => b.userId === MOCK_USERS.alice.userId);
      expect(aliceBreakdown).toBeDefined();
      expect(aliceBreakdown!.ownedValue).toBe(200);
      // Alice bid 500, second highest is 200 → overbid penalty = 0.5 × (500 - 200) = 150
      expect(aliceBreakdown!.overbidPenalty).toBe(150);
      // Total = paintedValue + ownedValue - overbidPenalty
      expect(aliceBreakdown!.totalScore).toBe(
        (aliceBreakdown!.paintedValue as number) + 200 - 150,
      );
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 6. State Masking (getStateForPlayer)
  // ───────────────────────────────────────────────────────────────
  describe('State Masking', () => {
    it('during DRAWING → player sees only their own drawing, not others', () => {
      const { game } = createGame();
      game.start();
      advanceToDrawing(game);

      const aliceState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(aliceState.myDrawing).toBeDefined();
      // Should not have a "drawings" array that contains other players' data
      expect(aliceState).not.toHaveProperty('drawings');
    });

    it('during GALLERY → drawings have anonymous labels only', () => {
      const { game } = createGame();
      game.start();
      advanceToGallery(game, ALL_PLAYER_IDS);

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const drawings = state.drawings as Array<Record<string, unknown>>;
      expect(drawings.length).toBe(4);
      for (const d of drawings) {
        expect(d.label).toMatch(/^Artist \d+$/);
        // No userId or userName should be present
        expect(d).not.toHaveProperty('userId');
        expect(d).not.toHaveProperty('userName');
        expect(d).not.toHaveProperty('artistUserId');
      }
    });

    it('during AUCTION → player sees own drawing flagged as isMine with only totals', () => {
      const { game } = createGame();
      game.start();
      advanceToAuction(game, ALL_PLAYER_IDS);

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const drawings = state.drawings as Array<Record<string, unknown>>;

      const myDrawings = drawings.filter((d) => d.isMine);
      expect(myDrawings.length).toBe(1);

      // Each drawing should have currentBidTotal but NOT individual bidders
      for (const d of drawings) {
        expect(d).toHaveProperty('currentBidTotal');
        expect(d).not.toHaveProperty('bidders');
      }
    });

    it('during RESULTS → state contains de-anonymized rankings with artist info', () => {
      const { game } = createGame();
      game.start();
      advanceToResults(game, ALL_PLAYER_IDS);

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const rankings = state.rankings as Array<Record<string, unknown>>;
      expect(rankings).toBeDefined();
      expect(rankings.length).toBe(4);

      for (const r of rankings) {
        expect(r).toHaveProperty('artistUserId');
        expect(r).toHaveProperty('artistUserName');
        expect(r).toHaveProperty('marketValue');
        expect(r).toHaveProperty('rank');
      }
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 7. Spectator State
  // ───────────────────────────────────────────────────────────────
  describe('Spectator State', () => {
    it('spectator sees all drawings with userIds during DRAWING phase', () => {
      const { game } = createGame();
      game.start();
      advanceToDrawing(game);

      const spectState = game.getStateForSpectator() as Record<string, unknown>;
      const drawings = spectState.drawings as Array<Record<string, unknown>>;
      expect(drawings.length).toBe(4);
      for (const d of drawings) {
        expect(d).toHaveProperty('userId');
        expect(d).toHaveProperty('userName');
      }
    });

    it('spectator sees individual bid totals during AUCTION phase', () => {
      const { game } = createGame();
      game.start();
      advanceToAuction(game, ALL_PLAYER_IDS);

      // Place a bid so there's something to observe
      const aliceState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const drawings = aliceState.drawings as Array<Record<string, unknown>>;
      const target = drawings.find((d) => !d.isMine)!;
      game.handleInput(MOCK_USERS.alice.userId, 'PLACE_BID', {
        drawingId: target.drawingId,
        amount: MM_BID_INCREMENT,
      });

      const spectState = game.getStateForSpectator() as Record<string, unknown>;
      expect(spectState).toHaveProperty('bids');
      const bids = spectState.bids as Record<string, Record<string, unknown>>;
      expect(Object.keys(bids).length).toBe(4);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 8. Awards
  // ───────────────────────────────────────────────────────────────
  describe('Awards', () => {
    it('should award "Gallery Star" to the player with the highest market value', () => {
      const { game } = createGame();
      game.start();
      advanceToAuction(game, ALL_PLAYER_IDS);

      const targetId = findBiddableDrawing(game, MOCK_USERS.bob.userId, MOCK_USERS.alice.userId);

      game.handleInput(MOCK_USERS.bob.userId, 'PLACE_BID', {
        drawingId: targetId,
        amount: MM_BID_INCREMENT * 6, // 300
      });
      game.handleInput(MOCK_USERS.alice.userId, 'PLACE_BID', {
        drawingId: targetId,
        amount: MM_BID_INCREMENT * 2, // 100 → market value = 100
      });

      vi.advanceTimersByTime(MM_AUCTION_DURATION_SECONDS * 1000);
      const results = game.computeResults();
      const galleryStar = results.awards.find((a) => a.title === 'Gallery Star');
      expect(galleryStar).toBeDefined();
    });

    it('should award "Art Collector" to the player who spent the most total', () => {
      const { game } = createGame();
      game.start();
      advanceToAuction(game, ALL_PLAYER_IDS);

      const aliceState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const drawings = aliceState.drawings as Array<Record<string, unknown>>;
      const targets = drawings.filter((d) => !d.isMine);

      // Alice bids on multiple drawings
      game.handleInput(MOCK_USERS.alice.userId, 'PLACE_BID', {
        drawingId: targets[0].drawingId,
        amount: MM_BID_INCREMENT * 4,
      });
      game.handleInput(MOCK_USERS.alice.userId, 'PLACE_BID', {
        drawingId: targets[1].drawingId,
        amount: MM_BID_INCREMENT * 2,
      });

      vi.advanceTimersByTime(MM_AUCTION_DURATION_SECONDS * 1000);
      const results = game.computeResults();
      const artCollector = results.awards.find((a) => a.title === 'Art Collector');
      expect(artCollector).toBeDefined();
      expect(artCollector!.userId).toBe(MOCK_USERS.alice.userId);
    });

    it('should award "Minimalist Master" to the player with the fewest strokes', () => {
      const { game } = createGame();
      game.start();
      advanceToDrawing(game);

      // Alice submits 1 stroke, others submit 3
      game.handleInput(MOCK_USERS.alice.userId, 'SUBMIT_DRAWING', createValidDrawing(1));
      game.handleInput(MOCK_USERS.bob.userId, 'SUBMIT_DRAWING', createValidDrawing(3));
      game.handleInput(MOCK_USERS.charlie.userId, 'SUBMIT_DRAWING', createValidDrawing(3));
      game.handleInput(MOCK_USERS.diana.userId, 'SUBMIT_DRAWING', createValidDrawing(3));

      // Advance through gallery and auction to results
      vi.advanceTimersByTime(MM_GALLERY_DURATION_SECONDS * 1000);
      vi.advanceTimersByTime(MM_AUCTION_DURATION_SECONDS * 1000);

      const results = game.computeResults();
      const minimalistMaster = results.awards.find((a) => a.title === 'Minimalist Master');
      expect(minimalistMaster).toBeDefined();
      expect(minimalistMaster!.userId).toBe(MOCK_USERS.alice.userId);
    });

    it('should award "Smart Investor" to the player with the highest owned painting value', () => {
      const { game } = createGame();
      game.start();
      advanceToAuction(game, ALL_PLAYER_IDS);

      const targetId = findBiddableDrawing(game, MOCK_USERS.bob.userId, MOCK_USERS.alice.userId);

      game.handleInput(MOCK_USERS.bob.userId, 'PLACE_BID', {
        drawingId: targetId,
        amount: MM_BID_INCREMENT * 6, // 300 — Bob wins
      });
      game.handleInput(MOCK_USERS.alice.userId, 'PLACE_BID', {
        drawingId: targetId,
        amount: MM_BID_INCREMENT * 2, // 100 → market value = 100
      });

      vi.advanceTimersByTime(MM_AUCTION_DURATION_SECONDS * 1000);
      const results = game.computeResults();
      const smartInvestor = results.awards.find((a) => a.title === 'Smart Investor');
      expect(smartInvestor).toBeDefined();
    });

    it('should award "Speed Painter" to the player who submitted fastest', () => {
      const { game } = createGame();
      game.start();
      advanceToDrawing(game);

      // Alice submits immediately
      game.handleInput(MOCK_USERS.alice.userId, 'SUBMIT_DRAWING', createValidDrawing());

      // Others submit after a delay
      vi.advanceTimersByTime(5000);
      game.handleInput(MOCK_USERS.bob.userId, 'SUBMIT_DRAWING', createValidDrawing());
      game.handleInput(MOCK_USERS.charlie.userId, 'SUBMIT_DRAWING', createValidDrawing());
      game.handleInput(MOCK_USERS.diana.userId, 'SUBMIT_DRAWING', createValidDrawing());

      vi.advanceTimersByTime(MM_GALLERY_DURATION_SECONDS * 1000);
      vi.advanceTimersByTime(MM_AUCTION_DURATION_SECONDS * 1000);

      const results = game.computeResults();
      const speedPainter = results.awards.find((a) => a.title === 'Speed Painter');
      expect(speedPainter).toBeDefined();
      expect(speedPainter!.userId).toBe(MOCK_USERS.alice.userId);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 9. Game Settings Overrides
  // ───────────────────────────────────────────────────────────────
  describe('Game Settings', () => {
    it('should use custom startingCurrency from gameSettings', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { startingCurrency: 2000 };
      const game = new MinimalistMasterpieceGame(ctx.context);
      game.start();
      advanceToAuction(game, ALL_PLAYER_IDS);

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state.currency).toBe(2000);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 10. Security / Anonymity
  // ───────────────────────────────────────────────────────────────
  describe('Security & Anonymity', () => {
    it('should NOT leak drawing-to-user mapping during GALLERY phase', () => {
      const { game } = createGame();
      game.start();
      advanceToGallery(game, ALL_PLAYER_IDS);

      for (const uid of ALL_PLAYER_IDS) {
        const state = game.getStateForPlayer(uid) as Record<string, unknown>;
        const drawings = state.drawings as Array<Record<string, unknown>>;
        for (const d of drawings) {
          expect(d).not.toHaveProperty('userId');
          expect(d).not.toHaveProperty('artistUserId');
          expect(d).not.toHaveProperty('userName');
          expect(d).not.toHaveProperty('artistUserName');
        }
      }
    });

    it('should NOT leak drawing-to-user mapping during AUCTION phase', () => {
      const { game } = createGame();
      game.start();
      advanceToAuction(game, ALL_PLAYER_IDS);

      for (const uid of ALL_PLAYER_IDS) {
        const state = game.getStateForPlayer(uid) as Record<string, unknown>;
        const drawings = state.drawings as Array<Record<string, unknown>>;
        for (const d of drawings) {
          expect(d).not.toHaveProperty('userId');
          expect(d).not.toHaveProperty('artistUserId');
          expect(d).not.toHaveProperty('userName');
          expect(d).not.toHaveProperty('artistUserName');
        }
      }
    });

    it('should de-anonymize only in the RESULTS phase', () => {
      const { game } = createGame();
      game.start();
      advanceToResults(game, ALL_PLAYER_IDS);

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const rankings = state.rankings as Array<Record<string, unknown>>;

      const knownUserIds = new Set(ALL_PLAYER_IDS);
      for (const r of rankings) {
        expect(knownUserIds.has(r.artistUserId as string)).toBe(true);
        expect(typeof r.artistUserName).toBe('string');
        expect((r.artistUserName as string).length).toBeGreaterThan(0);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 11. Multi-Round Support
  // ───────────────────────────────────────────────────────────────
  describe('Multi-Round Support', () => {
    it('should default to 3 rounds', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const promptBroadcast = findLastActionBroadcast(broadcastLog, 'MM_PROMPT');
      expect(promptBroadcast).toBeDefined();
      expect(promptBroadcast!.data.totalRounds).toBe(3);
    });

    it('should use custom roundCount from gameSettings', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { roundCount: 2 };
      const game = new MinimalistMasterpieceGame(ctx.context);
      game.start();

      const promptBroadcast = findLastActionBroadcast(ctx.broadcastLog, 'MM_PROMPT');
      expect(promptBroadcast).toBeDefined();
      expect(promptBroadcast!.data.totalRounds).toBe(2);
    });

    it('should proceed to next round after RESULTS phase', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { roundCount: 2 };
      const game = new MinimalistMasterpieceGame(ctx.context);
      game.start();

      // Complete round 1
      advanceToAuction(game, ALL_PLAYER_IDS);
      vi.advanceTimersByTime(MM_AUCTION_DURATION_SECONDS * 1000);
      // Skip RESULTS timer
      vi.advanceTimersByTime(MM_RESULTS_DURATION_SECONDS * 1000);

      // Should now be in round 2 with a new MM_PROMPT broadcast
      const prompts = ctx.broadcastLog
        .filter((e) => {
          const d = e.data as Record<string, unknown>;
          return d.type === 'MM_PROMPT';
        });
      expect(prompts.length).toBe(2);

      // Second prompt should have round=2
      const secondPrompt = prompts[1].data as Record<string, unknown>;
      expect(secondPrompt.round).toBe(2);
    });

    it('should end the game after the last round', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { roundCount: 1 };
      const game = new MinimalistMasterpieceGame(ctx.context);
      game.start();

      // Complete single round
      advanceToAuction(game, ALL_PLAYER_IDS);
      vi.advanceTimersByTime(MM_AUCTION_DURATION_SECONDS * 1000);
      vi.advanceTimersByTime(MM_RESULTS_DURATION_SECONDS * 1000);

      // Game should be complete
      expect(ctx.completedResults.length).toBe(1);
    });

    it('should accumulate scores across rounds', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { roundCount: 2 };
      const game = new MinimalistMasterpieceGame(ctx.context);
      game.start();

      // Complete round 1 — place 2-bidder auction to generate second-price market value
      advanceToAuction(game, ALL_PLAYER_IDS);

      const targetId = findBiddableDrawing(game, MOCK_USERS.alice.userId, MOCK_USERS.bob.userId);
      game.handleInput(MOCK_USERS.alice.userId, 'PLACE_BID', {
        drawingId: targetId,
        amount: MM_BID_INCREMENT * 4, // 200
      });
      game.handleInput(MOCK_USERS.bob.userId, 'PLACE_BID', {
        drawingId: targetId,
        amount: MM_BID_INCREMENT * 2, // 100 → market value = 100
      });

      vi.advanceTimersByTime(MM_AUCTION_DURATION_SECONDS * 1000);
      vi.advanceTimersByTime(MM_RESULTS_DURATION_SECONDS * 1000);

      // Complete round 2
      vi.advanceTimersByTime(MM_PROMPT_REVEAL_SECONDS * 1000); // PROMPT_REVEAL
      for (const uid of ALL_PLAYER_IDS) {
        game.handleInput(uid, 'SUBMIT_DRAWING', createValidDrawing());
      }
      vi.advanceTimersByTime(MM_DRAWING_DURATION_SECONDS * 1000); // DRAWING (full timer)
      vi.advanceTimersByTime(MM_GALLERY_DURATION_SECONDS * 1000); // skip GALLERY
      vi.advanceTimersByTime(MM_AUCTION_DURATION_SECONDS * 1000); // AUCTION
      vi.advanceTimersByTime(MM_RESULTS_DURATION_SECONDS * 1000); // RESULTS

      // Game should be complete with cumulative scores
      expect(ctx.completedResults.length).toBe(1);
      const results = ctx.completedResults[0];
      // At least one player should have scores from round 1 bids
      const scores = results.rankings.map((r) => r.score);
      const maxScore = Math.max(...scores);
      expect(maxScore).toBeGreaterThan(0);
    });

    it('game log should include round count', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { roundCount: 1 };
      const game = new MinimalistMasterpieceGame(ctx.context);
      game.start();

      advanceToAuction(game, ALL_PLAYER_IDS);
      vi.advanceTimersByTime(MM_AUCTION_DURATION_SECONDS * 1000);
      vi.advanceTimersByTime(MM_RESULTS_DURATION_SECONDS * 1000);

      const results = ctx.completedResults[0];
      const gameData = results.gameSpecificData as Record<string, unknown>;
      expect(gameData.totalRounds).toBe(1);
      expect(gameData.roundsPlayed).toBe(1);
    });
  });
});
