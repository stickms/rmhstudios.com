/**
 * RMHbox — Minimalist Masterpiece Minigame Server Handler
 *
 * Players draw a prompt with ≤5 strokes, then anonymously bid on each
 * other's artwork in an auction. Market value determines rankings;
 * top bidders on the winning drawing earn an investment bonus.
 *
 * Phases:
 *   PROMPT_REVEAL → DRAWING → GALLERY → AUCTION → RESULTS
 *
 * Join-in-progress policy: spectate_only — late joiners receive
 * spectator state and do not participate until the next game.
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §3.4
 */

import crypto from 'crypto';
import { BaseMinigame } from '../base-minigame';
import type { MinigameContext, MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import type { DrawingPrompt } from '@/lib/rmhbox/minimalist-masterpiece/data-loader';
import { loadPrompts, selectPromptForGame } from '@/lib/rmhbox/minimalist-masterpiece/data-loader';
import { SubmitDrawingSchema, PlaceBidSchema } from '@/lib/rmhbox/minimalist-masterpiece/schemas';
import {
  MM_PROMPT_REVEAL_SECONDS,
  MM_DRAWING_DURATION_SECONDS,
  MM_GALLERY_DURATION_SECONDS,
  MM_AUCTION_DURATION_SECONDS,
  MM_RESULTS_DURATION_SECONDS,
  MM_DEFAULT_ROUNDS,
  MM_MAX_STROKES,
  MM_COLOR_PALETTE,
  MM_STARTING_CURRENCY,
  MM_BID_INCREMENT,
} from '@/lib/rmhbox/constants';
import { logger } from '../../logger';
import type {
  MMPhase,
  MMStroke,
  PlayerDrawing,
  DrawingBids,
  MMRanking,
  PlayerScoreBreakdown,
  GalleryDrawing,
  AuctionDrawing,
  MinimalistMasterpieceState,
} from './types';

// ─── Minimalist Masterpiece Minigame ─────────────────────────────

export class MinimalistMasterpieceGame extends BaseMinigame {
  private promptPool: DrawingPrompt[];
  private usedPromptTexts: Set<string> = new Set();
  private state!: MinimalistMasterpieceState;
  private startedAt: number = 0;
  private actionSeq = 0;

  get spectatorMode(): 'competitive-individual' { return 'competitive-individual'; }

  constructor(context: MinigameContext) {
    super(context);
    this.promptPool = loadPrompts();
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();

    const totalRounds = this.getSetting('roundCount', MM_DEFAULT_ROUNDS);

    // Initialize cumulative scores
    const cumulativeScores = new Map<string, number>();
    for (const userId of this.context.players.keys()) {
      cumulativeScores.set(userId, 0);
    }

    const now = Date.now();
    // Use a placeholder prompt — will be set properly in startRound()
    const prompt = selectPromptForGame(this.promptPool, this.usedPromptTexts);
    this.usedPromptTexts.add(prompt.text);

    this.state = {
      prompt,
      phase: 'PROMPT_REVEAL',
      currentRound: 0,
      totalRounds,
      drawings: new Map(),
      drawingIdToUserId: new Map(),
      userIdToDrawingId: new Map(),
      playerCurrencies: new Map(),
      bids: new Map(),
      marketValues: new Map(),
      auctionWinners: new Map(),
      rankings: null,
      cumulativeScores,
      phaseStartedAt: now,
      phaseEndsAt: now,
      actionLog: [],
    };

    logger.info({
      event: 'mm:start',
      lobbyId: this.context.lobbyId,
      totalRounds,
      playerCount: this.context.players.size,
    });

    this.logAction('game_start', {
      totalRounds,
      playerCount: this.context.players.size,
    });

    // Start the first round using the prompt we already selected
    this.startRound(prompt);
  }

  /** Begin a new round with the given prompt. Sets up drawings, currencies, bids. */
  private startRound(prompt?: DrawingPrompt): void {
    if (!this.isRunning) return;

    this.state.currentRound++;

    const roundPrompt = prompt ?? selectPromptForGame(this.promptPool, this.usedPromptTexts);
    if (!prompt) this.usedPromptTexts.add(roundPrompt.text);
    this.state.prompt = roundPrompt;

    // Re-initialize per-round state
    const drawings = new Map<string, PlayerDrawing>();
    const drawingIdToUserId = new Map<string, string>();
    const userIdToDrawingId = new Map<string, string>();
    const playerCurrencies = new Map<string, number>();
    const bids = new Map<string, DrawingBids>();

    const startingCurrency = this.getSetting('startingCurrency', MM_STARTING_CURRENCY);

    for (const userId of this.context.players.keys()) {
      const drawingId = crypto.randomUUID();
      drawings.set(userId, {
        drawingId,
        strokes: [],
        backgroundColor: '#ffffff',
        submittedAt: null,
        strokeCount: 0,
      });
      drawingIdToUserId.set(drawingId, userId);
      userIdToDrawingId.set(userId, drawingId);
      playerCurrencies.set(userId, startingCurrency);
      bids.set(drawingId, { drawingId, totalValue: 0, bidders: new Map() });
    }

    this.state.drawings = drawings;
    this.state.drawingIdToUserId = drawingIdToUserId;
    this.state.userIdToDrawingId = userIdToDrawingId;
    this.state.playerCurrencies = playerCurrencies;
    this.state.bids = bids;
    this.state.marketValues = new Map();
    this.state.auctionWinners = new Map();
    this.state.rankings = null;

    const now = Date.now();
    this.state.phase = 'PROMPT_REVEAL';
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + MM_PROMPT_REVEAL_SECONDS * 1000;

    logger.info({
      event: 'mm:round_start',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      promptText: roundPrompt.text,
    });

    this.logAction('round_start', {
      round: this.state.currentRound,
      promptText: roundPrompt.text,
    });

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'MM_PROMPT',
      prompt: { text: roundPrompt.text, category: roundPrompt.category, difficulty: roundPrompt.difficulty },
      maxStrokes: this.getSetting('maxStrokes', MM_MAX_STROKES),
      colorPalette: MM_COLOR_PALETTE,
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      duration: MM_PROMPT_REVEAL_SECONDS,
    });

    this.startPhaseTimer(MM_PROMPT_REVEAL_SECONDS);
    this.setTimeout(() => this.startDrawingPhase(), MM_PROMPT_REVEAL_SECONDS * 1000);
  }

  // ─── Phase Management ────────────────────────────────────────

  private startDrawingPhase(): void {
    if (!this.isRunning) return;

    const drawingDuration = this.getSetting('drawingDuration', MM_DRAWING_DURATION_SECONDS);
    const maxStrokes = this.getSetting('maxStrokes', MM_MAX_STROKES);
    this.setPhase('DRAWING', drawingDuration);

    logger.info({
      event: 'mm:drawing_phase_start',
      lobbyId: this.context.lobbyId,
      duration: drawingDuration,
    });

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'MM_DRAWING_START',
      duration: drawingDuration,
      maxStrokes,
      colorPalette: MM_COLOR_PALETTE,
    });

    this.startPhaseTimer(drawingDuration);
    this.setTimeout(() => this.endDrawingPhase(), drawingDuration * 1000);
  }

  private endDrawingPhase(): void {
    if (!this.isRunning) return;
    this.clearPhaseTimer();

    // Auto-submit for players who haven't submitted
    const now = Date.now();
    for (const [userId, drawing] of this.state.drawings) {
      if (drawing.submittedAt === null) {
        drawing.submittedAt = now;
        this.logAction('auto_submit_drawing', { userId, drawingId: drawing.drawingId, strokeCount: drawing.strokeCount });
      }
    }

    logger.info({
      event: 'mm:drawing_phase_end',
      lobbyId: this.context.lobbyId,
      submissionCount: this.state.drawings.size,
    });

    this.startGalleryPhase();
  }

  private startGalleryPhase(): void {
    if (!this.isRunning) return;

    this.setPhase('GALLERY', MM_GALLERY_DURATION_SECONDS);

    const galleryDrawings = this.buildGalleryDrawings();

    logger.info({
      event: 'mm:gallery_phase_start',
      lobbyId: this.context.lobbyId,
      duration: MM_GALLERY_DURATION_SECONDS,
      drawingCount: galleryDrawings.length,
    });

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'MM_GALLERY_START',
      duration: MM_GALLERY_DURATION_SECONDS,
      drawings: galleryDrawings,
    });

    this.startPhaseTimer(MM_GALLERY_DURATION_SECONDS);
    this.setTimeout(() => this.startAuctionPhase(), MM_GALLERY_DURATION_SECONDS * 1000);
  }

  private startAuctionPhase(): void {
    if (!this.isRunning) return;

    const auctionDuration = this.getSetting('auctionDuration', MM_AUCTION_DURATION_SECONDS);
    this.setPhase('AUCTION', auctionDuration);

    logger.info({
      event: 'mm:auction_phase_start',
      lobbyId: this.context.lobbyId,
      duration: auctionDuration,
    });

    // Send per-player auction state (each sees isMine on their own drawing)
    for (const userId of this.context.players.keys()) {
      const auctionDrawings = this.buildAuctionDrawingsForPlayer(userId);
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'MM_AUCTION_START',
        duration: auctionDuration,
        drawings: auctionDrawings,
        currency: this.state.playerCurrencies.get(userId) ?? 0,
      });
    }

    this.context.sendToSpectators('rmhbox:game:action', {
      type: 'MM_AUCTION_START',
      duration: auctionDuration,
      drawings: this.buildGalleryDrawings().map((d) => ({
        ...d,
        currentBidTotal: this.state.bids.get(d.drawingId)?.totalValue ?? 0,
        myBidAmount: 0,
        isMine: false,
      })),
      currency: 0,
    });

    this.startPhaseTimer(auctionDuration);
    this.setTimeout(() => this.endAuctionPhase(), auctionDuration * 1000);
  }

  private endAuctionPhase(): void {
    if (!this.isRunning) return;
    this.clearPhaseTimer();

    // Second-price auction model:
    // Winner = highest bidder on each drawing; pays their bid amount
    // Market value = second highest bid (or 0 if ≤1 bidder)
    // Overbid penalty = 0.5 × (winnerBid - secondHighestBid)
    for (const [drawingId, bidInfo] of this.state.bids) {
      const sortedBids = Array.from(bidInfo.bidders.entries())
        .filter(([, amount]) => amount > 0)
        .sort(([, a], [, b]) => b - a);

      if (sortedBids.length === 0) {
        // No bids: market value = 0, no winner
        this.state.marketValues.set(drawingId, 0);
        continue;
      }

      const [winnerId, winnerBidAmount] = sortedBids[0];
      const secondHighest = sortedBids.length >= 2 ? sortedBids[1][1] : 0;
      this.state.marketValues.set(drawingId, secondHighest);

      const overbidPenalty = sortedBids.length >= 2
        ? Math.floor(0.5 * (winnerBidAmount - secondHighest))
        : 0;
      const winnerPlayer = this.context.players.get(winnerId);
      this.state.auctionWinners.set(drawingId, {
        drawingId,
        winnerId,
        winnerName: winnerPlayer?.userName ?? 'Unknown',
        amountPaid: winnerBidAmount,
        overbidPenalty,
      });

      this.logAction('auction_winner', {
        drawingId,
        winnerId,
        amountPaid: winnerBidAmount,
        marketValue: secondHighest,
        overbidPenalty,
      });
    }

    logger.info({
      event: 'mm:auction_phase_end',
      lobbyId: this.context.lobbyId,
      winnersCount: this.state.auctionWinners.size,
    });

    this.startResultsPhase();
  }

  private startResultsPhase(): void {
    if (!this.isRunning) return;

    this.setPhase('RESULTS', MM_RESULTS_DURATION_SECONDS);

    const mmRankings = this.buildMMRankings();
    this.state.rankings = mmRankings.length > 0 ? mmRankings : null;
    const scoreBreakdowns = this.computeScoreBreakdowns();

    // Accumulate round scores into cumulative totals
    for (const sb of scoreBreakdowns) {
      this.state.cumulativeScores.set(
        sb.userId,
        (this.state.cumulativeScores.get(sb.userId) ?? 0) + sb.totalScore,
      );
    }

    this.logAction('round_end', {
      round: this.state.currentRound,
      promptText: this.state.prompt.text,
      rankings: mmRankings.map((r) => ({
        artistUserId: r.artistUserId,
        artistUserName: r.artistUserName,
        marketValue: r.marketValue,
        rank: r.rank,
        points: r.points,
        winnerId: r.winnerId,
        winnerName: r.winnerName,
        winnerPaid: r.winnerPaid,
        overbidPenalty: r.winnerId
          ? (this.state.auctionWinners.get(r.drawingId)?.overbidPenalty ?? 0)
          : 0,
      })),
      scoreBreakdowns: scoreBreakdowns.map((sb) => ({
        userId: sb.userId,
        userName: sb.userName,
        paintedValue: sb.paintedValue,
        ownedValue: sb.ownedValue,
        overbidPenalty: sb.overbidPenalty,
        totalScore: sb.totalScore,
      })),
      // Store actual drawing data for history reconstruction
      drawings: mmRankings.map((r) => ({
        drawingId: r.drawingId,
        artistUserId: r.artistUserId,
        artistUserName: r.artistUserName,
        strokes: r.strokes,
        backgroundColor: r.backgroundColor,
      })),
    });

    logger.info({
      event: 'mm:results_phase_start',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      duration: MM_RESULTS_DURATION_SECONDS,
    });

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'MM_RESULTS',
      rankings: this.state.rankings,
      scoreBreakdowns,
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      duration: MM_RESULTS_DURATION_SECONDS,
    });

    this.startPhaseTimer(MM_RESULTS_DURATION_SECONDS);
    this.setTimeout(() => this.afterResults(), MM_RESULTS_DURATION_SECONDS * 1000);
  }

  /** After showing results, either start next round or end the game. */
  private afterResults(): void {
    if (!this.isRunning) return;

    if (this.state.currentRound < this.state.totalRounds) {
      // Start next round
      this.startRound();
    } else {
      this.endGame();
    }
  }

  private endGame(): void {
    if (!this.isRunning) return;

    logger.info({
      event: 'mm:game_end',
      lobbyId: this.context.lobbyId,
      rounds: this.state.currentRound,
      totalRounds: this.state.totalRounds,
    });

    this.cleanup();
    this.context.onComplete(this.computeResults());
  }

  // ─── Input Handling ──────────────────────────────────────────

  handleInput(userId: string, action: string, data: unknown): void {
    switch (action) {
      case 'SUBMIT_DRAWING':
        this.handleSubmitDrawing(userId, data);
        break;
      case 'PLACE_BID':
        this.handlePlaceBid(userId, data);
        break;
    }
  }

  private handleSubmitDrawing(userId: string, data: unknown): void {
    if (this.state.phase !== 'DRAWING') return;

    const drawing = this.state.drawings.get(userId);
    if (!drawing) return;

    const parsed = SubmitDrawingSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'MM_DRAWING_REJECTED',
        reason: 'invalid_input',
      });
      return;
    }

    const { strokes, backgroundColor } = parsed.data;

    // Anti-bot: validate stroke colors against palette or valid hex
    for (const stroke of strokes) {
      if (!MM_COLOR_PALETTE.includes(stroke.color) && !/^#[0-9a-fA-F]{6}$/.test(stroke.color)) {
        this.context.sendToPlayer(userId, 'rmhbox:game:action', {
          type: 'MM_DRAWING_REJECTED',
          reason: 'invalid_color',
        });
        return;
      }
    }

    // Accept the drawing (allow re-submissions for auto-save)
    const isFirstSubmission = drawing.submittedAt === null;
    drawing.strokes = strokes as MMStroke[];
    drawing.backgroundColor = backgroundColor;
    drawing.strokeCount = strokes.length;
    drawing.submittedAt = Date.now();

    if (isFirstSubmission) {
      this.logAction('submit_drawing', {
        userId,
        drawingId: drawing.drawingId,
        strokeCount: strokes.length,
      });

      logger.info({
        event: 'mm:drawing_submitted',
        lobbyId: this.context.lobbyId,
        userId,
        drawingId: drawing.drawingId,
        strokeCount: strokes.length,
      });
    }

    this.context.sendToPlayer(userId, 'rmhbox:game:action', {
      type: 'MM_DRAWING_ACCEPTED',
      drawingId: drawing.drawingId,
      strokeCount: strokes.length,
    });

    if (isFirstSubmission) {
      // Broadcast submission count to all
      const submittedCount = Array.from(this.state.drawings.values())
        .filter((d) => d.submittedAt !== null).length;
      this.context.broadcastToLobby('rmhbox:game:action', {
        type: 'MM_SUBMISSION_COUNT',
        submitted: submittedCount,
        total: this.state.drawings.size,
      });

      // Always allow the full drawing phase timer — no early end.
      // Auto-save means every player submits almost immediately,
      // but they should still have the full time to keep editing.
    }
  }

  private handlePlaceBid(userId: string, data: unknown): void {
    if (this.state.phase !== 'AUCTION') return;
    if (!this.context.players.has(userId)) return;

    const parsed = PlaceBidSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'MM_BID_REJECTED',
        reason: 'invalid_input',
      });
      return;
    }

    const { drawingId, amount } = parsed.data;

    // Validate drawing exists
    const artistUserId = this.state.drawingIdToUserId.get(drawingId);
    if (artistUserId === undefined) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'MM_BID_REJECTED',
        reason: 'invalid_drawing',
      });
      return;
    }

    // No self-bidding
    if (artistUserId === userId) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'MM_BID_REJECTED',
        reason: 'self_bid',
      });
      return;
    }

    const bidIncrement = this.getSetting('bidIncrement', MM_BID_INCREMENT);
    const bidInfo = this.state.bids.get(drawingId)!;
    const currentBid = bidInfo.bidders.get(userId) ?? 0;
    const currency = this.state.playerCurrencies.get(userId) ?? 0;

    if (amount === 0) {
      // Retract bid entirely
      if (currentBid > 0) {
        this.state.playerCurrencies.set(userId, currency + currentBid);
        bidInfo.totalValue -= currentBid;
        bidInfo.bidders.delete(userId);

        this.logAction('retract_bid', { userId, drawingId, retracted: currentBid });
      }
    } else {
      // Validate bid is a multiple of increment
      if (amount % bidIncrement !== 0) {
        this.context.sendToPlayer(userId, 'rmhbox:game:action', {
          type: 'MM_BID_REJECTED',
          reason: 'invalid_increment',
        });
        return;
      }

      // Calculate cost difference (amount is new total bid on this drawing)
      const diff = amount - currentBid;
      if (diff < 0) {
        // Partial retraction: refund the difference
        this.state.playerCurrencies.set(userId, currency + Math.abs(diff));
        bidInfo.totalValue += diff; // diff is negative
        bidInfo.bidders.set(userId, amount);

        this.logAction('reduce_bid', { userId, drawingId, newAmount: amount, refund: Math.abs(diff) });
      } else if (diff > 0) {
        // Increasing bid: check currency
        if (diff > currency) {
          this.context.sendToPlayer(userId, 'rmhbox:game:action', {
            type: 'MM_BID_REJECTED',
            reason: 'insufficient_currency',
          });
          return;
        }
        this.state.playerCurrencies.set(userId, currency - diff);
        bidInfo.totalValue += diff;
        bidInfo.bidders.set(userId, amount);

        this.logAction('place_bid', { userId, drawingId, newAmount: amount, cost: diff });
      }
    }

    logger.info({
      event: 'mm:bid_placed',
      lobbyId: this.context.lobbyId,
      userId,
      drawingId,
      amount,
    });

    // Confirm to the bidder
    this.context.sendToPlayer(userId, 'rmhbox:game:action', {
      type: 'MM_BID_ACCEPTED',
      drawingId,
      myBidAmount: bidInfo.bidders.get(userId) ?? 0,
      currency: this.state.playerCurrencies.get(userId) ?? 0,
    });

    // Broadcast updated totals (not who bid) to all
    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'MM_BID_UPDATE',
      drawingId,
      currentBidTotal: bidInfo.totalValue,
    });
  }

  // ─── State Masking ───────────────────────────────────────────

  getStateForPlayer(userId: string): unknown {
    const base = {
      phase: this.state.phase,
      prompt: { text: this.state.prompt.text, category: this.state.prompt.category },
      currentRound: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      phaseStartedAt: this.state.phaseStartedAt,
      phaseEndsAt: this.state.phaseEndsAt,
    };

    switch (this.state.phase) {
      case 'PROMPT_REVEAL':
        return { ...base };

      case 'DRAWING': {
        // Only show the player's own strokes
        const myDrawing = this.state.drawings.get(userId);
        return {
          ...base,
          myDrawing: myDrawing
            ? { drawingId: myDrawing.drawingId, strokes: myDrawing.strokes, strokeCount: myDrawing.strokeCount, submitted: myDrawing.submittedAt !== null }
            : null,
          maxStrokes: MM_MAX_STROKES,
          submittedCount: Array.from(this.state.drawings.values()).filter((d) => d.submittedAt !== null).length,
          totalPlayers: this.state.drawings.size,
        };
      }

      case 'GALLERY':
        return {
          ...base,
          drawings: this.buildGalleryDrawings(),
        };

      case 'AUCTION': {
        return {
          ...base,
          drawings: this.buildAuctionDrawingsForPlayer(userId),
          currency: this.state.playerCurrencies.get(userId) ?? 0,
        };
      }

      case 'RESULTS':
        return {
          ...base,
          rankings: this.state.rankings,
          scoreBreakdowns: this.computeScoreBreakdowns(),
        };

      default:
        return base;
    }
  }

  getStateForSpectator(): unknown {
    const base = {
      phase: this.state.phase,
      prompt: { text: this.state.prompt.text, category: this.state.prompt.category },
      phaseStartedAt: this.state.phaseStartedAt,
      phaseEndsAt: this.state.phaseEndsAt,
    };

    switch (this.state.phase) {
      case 'PROMPT_REVEAL':
        return { ...base };

      case 'DRAWING':
        // Spectators see all drawings (omniscient)
        return {
          ...base,
          drawings: Array.from(this.state.drawings.entries()).map(([uid, d]) => ({
            userId: uid,
            userName: this.context.players.get(uid)?.userName ?? 'Unknown',
            drawingId: d.drawingId,
            strokes: d.strokes,
            strokeCount: d.strokeCount,
            submitted: d.submittedAt !== null,
          })),
          submittedCount: Array.from(this.state.drawings.values()).filter((d) => d.submittedAt !== null).length,
          totalPlayers: this.state.drawings.size,
        };

      case 'GALLERY':
        return {
          ...base,
          drawings: this.buildGalleryDrawings(),
        };

      case 'AUCTION':
        return {
          ...base,
          drawings: this.buildGalleryDrawings().map((d) => ({
            ...d,
            currentBidTotal: this.state.bids.get(d.drawingId)?.totalValue ?? 0,
          })),
          bids: this.serializeBids(),
        };

      case 'RESULTS':
        return {
          ...base,
          rankings: this.state.rankings,
          scoreBreakdowns: this.computeScoreBreakdowns(),
        };

      default:
        return base;
    }
  }

  // ─── Join-in-Progress / Reconnection / Disconnect ────────────

  handlePlayerJoin(userId: string): void {
    this.context.sendToPlayer(userId, 'rmhbox:game:state_snapshot', this.getStateForSpectator());
  }

  handlePlayerDisconnect(userId: string): void {
    logger.info({
      event: 'mm:player_disconnect',
      lobbyId: this.context.lobbyId,
      userId,
      phase: this.state.phase,
    });
  }

  handlePlayerReconnect(userId: string): void {
    logger.info({
      event: 'mm:player_reconnect',
      lobbyId: this.context.lobbyId,
      userId,
      phase: this.state.phase,
    });
  }

  // ─── Results & Awards ────────────────────────────────────────

  computeResults(): MinigameResults {
    const rankings = this.computeRankings();
    const awards = this.computeAwards();
    const duration = Date.now() - this.startedAt;

    return {
      rankings,
      awards,
      gameSpecificData: {
        totalRounds: this.state.totalRounds,
        roundsPlayed: this.state.currentRound,
        gameLog: this.buildGameLog(),
      },
      duration,
    };
  }

  private buildMMRankings(): MMRanking[] {
    // Sort drawings by market value descending (market value = second highest bid)
    const entries: Array<{ drawingId: string; userId: string; marketValue: number }> = [];
    for (const [drawingId, userId] of this.state.drawingIdToUserId) {
      const marketValue = this.state.marketValues.get(drawingId) ?? 0;
      entries.push({ drawingId, userId, marketValue });
    }
    entries.sort((a, b) => b.marketValue - a.marketValue);

    // Assign ranks with tie handling: tied drawings share the higher rank
    const rankings: MMRanking[] = [];
    let currentRank = 1;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (i > 0 && entry.marketValue < entries[i - 1].marketValue) {
        currentRank = i + 1;
      }
      const player = this.context.players.get(entry.userId);
      const drawing = this.state.drawings.get(entry.userId);
      const winner = this.state.auctionWinners.get(entry.drawingId);

      // Points = market value itself (under new scoring model)
      rankings.push({
        drawingId: entry.drawingId,
        artistUserId: entry.userId,
        artistUserName: player?.userName ?? 'Unknown',
        marketValue: entry.marketValue,
        rank: currentRank,
        points: entry.marketValue,
        strokes: drawing?.strokes ?? [],
        backgroundColor: drawing?.backgroundColor ?? '#ffffff',
        winnerId: winner?.winnerId,
        winnerName: winner?.winnerName,
        winnerPaid: winner?.amountPaid,
      });
    }
    return rankings;
  }

  /**
   * Compute score breakdowns under the second-price auction model.
   * Each player's score = sum of market values of paintings they painted +
   *                       sum of market values of paintings they won in auction -
   *                       sum of overbid penalties on paintings they won.
   */
  private computeScoreBreakdowns(): PlayerScoreBreakdown[] {
    const breakdowns: PlayerScoreBreakdown[] = [];

    for (const userId of this.context.players.keys()) {
      const player = this.context.players.get(userId)!;
      let paintedValue = 0;
      let ownedValue = 0;
      let overbidPenalty = 0;

      // Value of paintings this player painted (as artist)
      const myDrawingId = this.state.userIdToDrawingId.get(userId);
      if (myDrawingId) {
        paintedValue += this.state.marketValues.get(myDrawingId) ?? 0;
      }

      // Value of paintings this player won in auction + overbid penalties
      for (const [drawingId, winner] of this.state.auctionWinners) {
        if (winner.winnerId === userId) {
          ownedValue += this.state.marketValues.get(drawingId) ?? 0;
          overbidPenalty += winner.overbidPenalty;
        }
      }

      breakdowns.push({
        userId,
        userName: player.userName,
        paintedValue,
        ownedValue,
        overbidPenalty,
        totalScore: paintedValue + ownedValue - overbidPenalty,
      });
    }

    return breakdowns;
  }

  private computeRankings(): PlayerRanking[] {
    // Use cumulative scores for final rankings (across all rounds)
    const entries: PlayerRanking[] = [];
    for (const userId of this.context.players.keys()) {
      const player = this.context.players.get(userId)!;
      const score = this.state.cumulativeScores.get(userId) ?? 0;
      entries.push({
        userId,
        userName: player.userName,
        score,
        rank: 0,
        deltas: {},
      });
    }

    entries.sort((a, b) => b.score - a.score);
    // Tie handling for final rankings
    let currentRank = 1;
    for (let i = 0; i < entries.length; i++) {
      if (i > 0 && entries[i].score < entries[i - 1].score) {
        currentRank = i + 1;
      }
      entries[i].rank = currentRank;
    }

    return entries;
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];
    const mmRankings = this.buildMMRankings();
    const scoreBreakdowns = this.computeScoreBreakdowns();

    // 1. Gallery Star — highest market value painting
    if (mmRankings.length > 0 && mmRankings[0].marketValue > 0) {
      awards.push({
        userId: mmRankings[0].artistUserId,
        title: 'Gallery Star',
        description: `Artwork valued at ${mmRankings[0].marketValue} coins`,
        icon: 'star',
      });
    }

    // 2. Art Collector — most paintings won in auction
    let topCollectorId: string | null = null;
    let topCollectedCount = 0;
    const winCounts = new Map<string, number>();
    for (const [, winner] of this.state.auctionWinners) {
      const count = (winCounts.get(winner.winnerId) ?? 0) + 1;
      winCounts.set(winner.winnerId, count);
      if (count > topCollectedCount) {
        topCollectedCount = count;
        topCollectorId = winner.winnerId;
      }
    }
    if (topCollectorId && topCollectedCount > 0) {
      awards.push({
        userId: topCollectorId,
        title: 'Art Collector',
        description: `Won ${topCollectedCount} painting${topCollectedCount === 1 ? '' : 's'} at auction`,
        icon: 'palette',
      });
    }

    // 3. Minimalist Master — fewest strokes in a submitted drawing (among submitted)
    let fewestStrokesUserId: string | null = null;
    let fewestStrokes = Infinity;
    for (const [userId, drawing] of this.state.drawings) {
      if (drawing.submittedAt !== null && drawing.strokeCount > 0 && drawing.strokeCount < fewestStrokes) {
        fewestStrokes = drawing.strokeCount;
        fewestStrokesUserId = userId;
      }
    }
    if (fewestStrokesUserId && fewestStrokes < Infinity) {
      awards.push({
        userId: fewestStrokesUserId,
        title: 'Minimalist Master',
        description: `Created art with just ${fewestStrokes} stroke${fewestStrokes === 1 ? '' : 's'}`,
        icon: 'minus',
      });
    }

    // 4. Smart Investor — highest owned painting value (from winning auctions)
    const topInvestor = scoreBreakdowns
      .filter((sb) => sb.ownedValue > 0)
      .sort((a, b) => b.ownedValue - a.ownedValue)[0];
    if (topInvestor) {
      awards.push({
        userId: topInvestor.userId,
        title: 'Smart Investor',
        description: `Owns paintings worth ${topInvestor.ownedValue} in market value`,
        icon: 'trending-up',
      });
    }

    // 5. Speed Painter — fastest submission time
    let fastestUserId: string | null = null;
    let fastestTime = Infinity;
    for (const [userId, drawing] of this.state.drawings) {
      if (drawing.submittedAt !== null && drawing.strokeCount > 0) {
        const elapsed = drawing.submittedAt - this.state.phaseStartedAt;
        if (elapsed < fastestTime) {
          fastestTime = elapsed;
          fastestUserId = userId;
        }
      }
    }
    if (fastestUserId && fastestTime < Infinity) {
      const seconds = Math.round(fastestTime / 1000);
      awards.push({
        userId: fastestUserId,
        title: 'Speed Painter',
        description: `Submitted drawing in ${seconds} seconds`,
        icon: 'zap',
      });
    }

    return awards;
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private setPhase(phase: MMPhase, durationSeconds: number): void {
    const now = Date.now();
    this.state.phase = phase;
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + durationSeconds * 1000;
  }

  private buildGalleryDrawings(): GalleryDrawing[] {
    // Anonymous labels: "Artist 1", "Artist 2", etc.
    const drawings: GalleryDrawing[] = [];
    let index = 1;
    for (const [, drawing] of this.state.drawings) {
      drawings.push({
        drawingId: drawing.drawingId,
        label: `Artist ${index}`,
        strokes: drawing.strokes,
        backgroundColor: drawing.backgroundColor,
      });
      index++;
    }
    return drawings;
  }

  private buildAuctionDrawingsForPlayer(userId: string): AuctionDrawing[] {
    const myDrawingId = this.state.userIdToDrawingId.get(userId);
    const gallery = this.buildGalleryDrawings();
    return gallery.map((d) => {
      const bidInfo = this.state.bids.get(d.drawingId);
      return {
        ...d,
        currentBidTotal: bidInfo?.totalValue ?? 0,
        myBidAmount: bidInfo?.bidders.get(userId) ?? 0,
        isMine: d.drawingId === myDrawingId,
      };
    });
  }

  private serializeBids(): Record<string, { drawingId: string; totalValue: number }> {
    const result: Record<string, { drawingId: string; totalValue: number }> = {};
    for (const [drawingId, bidInfo] of this.state.bids) {
      result[drawingId] = { drawingId, totalValue: bidInfo.totalValue };
    }
    return result;
  }

  // ─── Action Log / Game Log ───────────────────────────────────

  private logAction(type: string, payload: Record<string, unknown>): void {
    this.state.actionLog.push({
      seq: ++this.actionSeq,
      type,
      timestamp: Date.now(),
      payload,
    });
  }

  buildGameLog(): Record<string, unknown> {
    const players = Array.from(this.context.players.entries()).map(([userId, p]) => ({
      userId,
      userName: p.userName,
    }));

    const cumulativeScores: Record<string, number> = {};
    for (const [uid, s] of this.state.cumulativeScores) cumulativeScores[uid] = s;

    return {
      lobbyId: this.context.lobbyId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      totalRounds: this.state.totalRounds,
      roundsPlayed: this.state.currentRound,
      playerCount: this.context.players.size,
      players,
      actions: this.state.actionLog,
      cumulativeScores,
    };
  }
}
