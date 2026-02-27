/**
 * RMHbox — Wit-War Minigame Server Handler
 *
 * A Quiplash-style party game. Players receive prompts, write funny
 * answers, then answers face off head-to-head while the audience votes.
 * Points are awarded based on vote percentage; a unanimous vote triggers
 * a "Wit-War!" bonus.
 *
 * Phases per round:
 *   PROMPT_REVEAL → WRITING → VOTING (per matchup) → MATCHUP_RESULTS
 *     → ROUND_RESULTS → (next round or GAME_OVER)
 *
 * Join-in-progress policy: spectate_only — prompts are assigned at round
 * start, so late joiners cannot participate mid-round.
 *
 * Spectator mode: shared-privileged — spectators see the omniscient view
 * including all prompts, answers, and voting data.
 *
 * Reference: docs/rmhbox/design-spec/wit-war.md
 */

import { BaseMinigame } from '../base-minigame';
import type { MinigameContext, MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import { selectRoundPrompts, assignPromptsToPlayers } from '@/lib/rmhbox/wit-war/data-loader';
import { SubmitAnswerSchema, CastVoteSchema } from '@/lib/rmhbox/wit-war/schemas';
import {
  WW_TOTAL_ROUNDS,
  WW_WRITING_DURATION,
  WW_VOTING_DURATION,
  WW_MATCHUP_RESULTS_DURATION,
  WW_ROUND_RESULTS_DURATION,
  WW_PROMPT_REVEAL_DURATION,
  WW_MAX_MATCHUP_POINTS,
  WW_QUIPLASH_BONUS,
  WW_SAFETY_QUIP,
} from '@/lib/rmhbox/constants';
import { logger } from '../../logger';
import {
  WitWarPhase,
  type WWMatchup,
  type WWPromptAssignment,
  type WitWarState,
} from './types';

// ─── Wit-War Minigame ───────────────────────────────────────────

export class WitWarMinigame extends BaseMinigame {
  private state!: WitWarState;
  private startedAt: number = 0;
  /** Handle for the current voting timeout, so early-end can cancel it. */
  private votingTimeoutHandle: NodeJS.Timeout | null = null;

  get spectatorMode(): 'competitive-individual' { return 'competitive-individual'; }

  constructor(context: MinigameContext) {
    super(context);
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();
    this.initializeState();

    logger.info({
      event: 'wit_war:start',
      lobbyId: this.context.lobbyId,
      totalRounds: this.getSetting('totalRounds', WW_TOTAL_ROUNDS),
      playerCount: this.context.players.size,
    });

    this.startRound();
  }

  private initializeState(): void {
    const scores: Record<string, number> = {};
    for (const userId of this.context.players.keys()) {
      scores[userId] = 0;
    }

    this.state = {
      phase: WitWarPhase.PROMPT_REVEAL,
      currentRound: 0,
      totalRounds: this.getSetting('totalRounds', WW_TOTAL_ROUNDS),
      matchups: [],
      assignments: {},
      submitted: new Set(),
      currentMatchupIndex: 0,
      scores,
      usedPromptIndices: new Set(),
      roundMatchups: [],
      actionLog: [],
      timeRemaining: 0,
    };
  }

  // ─── Round Flow ─────────────────────────────────────────────

  private startRound(): void {
    this.state.currentRound++;
    this.state.submitted = new Set();
    this.state.currentMatchupIndex = 0;

    const playerIds = Array.from(this.context.players.keys());
    const promptCount = playerIds.length;
    const prompts = selectRoundPrompts(promptCount, this.state.usedPromptIndices);

    for (const p of prompts) {
      this.state.usedPromptIndices.add(p.index);
    }

    const pairings = assignPromptsToPlayers(prompts, playerIds);

    const matchups: WWMatchup[] = pairings.map((p) => ({
      promptIndex: p.promptIndex,
      promptText: p.promptText,
      playerA: p.playerA,
      playerB: p.playerB,
      answerA: null,
      answerB: null,
      votes: {},
      votePercentA: 0,
      votePercentB: 0,
      winnerId: null,
      isQuiplash: false,
    }));

    this.state.matchups = matchups;

    // Build per-player assignments
    const assignments: Record<string, WWPromptAssignment[]> = {};
    for (const userId of playerIds) {
      assignments[userId] = [];
    }
    matchups.forEach((m, idx) => {
      if (assignments[m.playerA]) {
        assignments[m.playerA].push({
          promptIndex: m.promptIndex,
          promptText: m.promptText,
          opponentId: m.playerB,
          matchupIndex: idx,
        });
      }
      if (assignments[m.playerB]) {
        assignments[m.playerB].push({
          promptIndex: m.promptIndex,
          promptText: m.promptText,
          opponentId: m.playerA,
          matchupIndex: idx,
        });
      }
    });
    this.state.assignments = assignments;

    this.broadcastRound(this.state.currentRound, this.state.totalRounds);
    this.startPromptReveal();
  }

  private startPromptReveal(): void {
    this.state.phase = WitWarPhase.PROMPT_REVEAL;

    // Send each player their own prompt assignments
    for (const [userId, playerAssignments] of Object.entries(this.state.assignments)) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'WW_PROMPT_REVEAL',
        payload: {
          round: this.state.currentRound,
          totalRounds: this.state.totalRounds,
          prompts: playerAssignments.map((a) => ({
            promptIndex: a.promptIndex,
            promptText: a.promptText,
            matchupIndex: a.matchupIndex,
          })),
        },
      });
    }

    // Send spectators the full state
    this.context.sendToSpectators('rmhbox:game:state_snapshot', this.getStateForSpectator());

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'WW_PHASE_CHANGE',
      payload: { phase: 'PROMPT_REVEAL', round: this.state.currentRound },
    });

    this.logAction('prompt_reveal', {
      round: this.state.currentRound,
      matchupCount: this.state.matchups.length,
    });

    this.setTimeout(() => this.startWritingPhase(), WW_PROMPT_REVEAL_DURATION * 1000);
  }

  private startWritingPhase(): void {
    this.state.phase = WitWarPhase.WRITING;
    const duration = this.getSetting('writingDuration', WW_WRITING_DURATION);

    this.context.broadcastAction({
      type: 'WW_WRITING_START',
      payload: { durationSeconds: duration },
    });

    this.startPhaseTimer(duration);

    this.setTimeout(() => this.endWritingPhase(), duration * 1000);
  }

  private endWritingPhase(): void {
    this.clearPhaseTimer();

    // Broadcast writing end so clients can auto-submit typed answers
    this.context.broadcastAction({
      type: 'WW_WRITING_END',
    });

    // Brief grace period for client auto-submitted answers to arrive
    this.setTimeout(() => {
      // Fill in safety quips for still-missing answers
      for (const matchup of this.state.matchups) {
        if (!matchup.answerA) matchup.answerA = WW_SAFETY_QUIP;
        if (!matchup.answerB) matchup.answerB = WW_SAFETY_QUIP;
      }

      this.logAction('writing_end', {
        round: this.state.currentRound,
        submittedCount: this.state.submitted.size,
        totalPlayers: this.context.players.size,
      });

      this.startMatchupVoting();
    }, 1000);
  }

  // ─── Voting Flow ────────────────────────────────────────────

  private startMatchupVoting(): void {
    if (this.state.currentMatchupIndex >= this.state.matchups.length) {
      this.showRoundResults();
      return;
    }

    this.state.phase = WitWarPhase.VOTING;
    const matchup = this.state.matchups[this.state.currentMatchupIndex];
    const duration = this.getSetting('votingDuration', WW_VOTING_DURATION);

    this.context.broadcastAction({
      type: 'WW_MATCHUP_START',
      payload: {
        matchupIndex: this.state.currentMatchupIndex,
        totalMatchups: this.state.matchups.length,
        promptText: matchup.promptText,
        answerA: matchup.answerA,
        answerB: matchup.answerB,
        playerA: matchup.playerA,
        playerB: matchup.playerB,
        durationSeconds: duration,
      },
    });

    // Update spectator state for reconnection
    this.context.sendToSpectators('rmhbox:game:state_snapshot', this.getStateForSpectator());

    this.startPhaseTimer(duration);

    this.votingTimeoutHandle = this.setTimeout(() => this.endMatchupVoting(), duration * 1000);
  }

  private endMatchupVoting(): void {
    this.votingTimeoutHandle = null;
    this.clearPhaseTimer();
    const matchup = this.state.matchups[this.state.currentMatchupIndex];

    this.resolveMatchup(matchup);
    this.showMatchupResults(matchup);
  }

  private resolveMatchup(matchup: WWMatchup): void {
    const votesForA = Object.values(matchup.votes).filter((v) => v === matchup.playerA).length;
    const votesForB = Object.values(matchup.votes).filter((v) => v === matchup.playerB).length;
    const totalVotes = votesForA + votesForB;

    if (totalVotes === 0) {
      matchup.votePercentA = 50;
      matchup.votePercentB = 50;
      matchup.winnerId = null;
      matchup.isQuiplash = false;
    } else {
      matchup.votePercentA = Math.round((votesForA / totalVotes) * 100);
      matchup.votePercentB = 100 - matchup.votePercentA;

      if (votesForA > votesForB) {
        matchup.winnerId = matchup.playerA;
      } else if (votesForB > votesForA) {
        matchup.winnerId = matchup.playerB;
      } else {
        matchup.winnerId = null;
      }

      matchup.isQuiplash = totalVotes >= 2 && (votesForA === totalVotes || votesForB === totalVotes);
    }

    // Award points
    const isSafetyA = matchup.answerA === WW_SAFETY_QUIP;
    const isSafetyB = matchup.answerB === WW_SAFETY_QUIP;

    const scoreA = isSafetyA ? 0 : Math.round((matchup.votePercentA / 100) * WW_MAX_MATCHUP_POINTS);
    const scoreB = isSafetyB ? 0 : Math.round((matchup.votePercentB / 100) * WW_MAX_MATCHUP_POINTS);

    const bonusA = matchup.isQuiplash && matchup.winnerId === matchup.playerA ? WW_QUIPLASH_BONUS : 0;
    const bonusB = matchup.isQuiplash && matchup.winnerId === matchup.playerB ? WW_QUIPLASH_BONUS : 0;

    this.state.scores[matchup.playerA] = (this.state.scores[matchup.playerA] ?? 0) + scoreA + bonusA;
    this.state.scores[matchup.playerB] = (this.state.scores[matchup.playerB] ?? 0) + scoreB + bonusB;

    this.logAction('matchup_resolved', {
      round: this.state.currentRound,
      matchupIndex: this.state.currentMatchupIndex,
      prompt: matchup.promptText,
      playerA: matchup.playerA,
      playerB: matchup.playerB,
      answerA: matchup.answerA,
      answerB: matchup.answerB,
      votePercentA: matchup.votePercentA,
      votePercentB: matchup.votePercentB,
      winnerId: matchup.winnerId,
      isQuiplash: matchup.isQuiplash,
      scoreA: scoreA + bonusA,
      scoreB: scoreB + bonusB,
    });
  }

  private showMatchupResults(matchup: WWMatchup): void {
    this.state.phase = WitWarPhase.MATCHUP_RESULTS;

    const playerAName = this.context.players.get(matchup.playerA)?.userName ?? 'Unknown';
    const playerBName = this.context.players.get(matchup.playerB)?.userName ?? 'Unknown';

    this.context.broadcastAction({
      type: 'WW_MATCHUP_RESULT',
      payload: {
        matchupIndex: this.state.currentMatchupIndex,
        promptText: matchup.promptText,
        playerA: matchup.playerA,
        playerAName,
        answerA: matchup.answerA,
        playerB: matchup.playerB,
        playerBName,
        answerB: matchup.answerB,
        votePercentA: matchup.votePercentA,
        votePercentB: matchup.votePercentB,
        winnerId: matchup.winnerId,
        isQuiplash: matchup.isQuiplash,
        scores: { ...this.state.scores },
      },
    });

    this.setTimeout(() => {
      this.state.currentMatchupIndex++;
      this.startMatchupVoting();
    }, WW_MATCHUP_RESULTS_DURATION * 1000);
  }

  // ─── Round Results ──────────────────────────────────────────

  private showRoundResults(): void {
    this.state.phase = WitWarPhase.ROUND_RESULTS;

    this.state.roundMatchups.push([...this.state.matchups]);

    this.context.broadcastAction({
      type: 'WW_ROUND_RESULTS',
      payload: {
        round: this.state.currentRound,
        totalRounds: this.state.totalRounds,
        scores: { ...this.state.scores },
        matchups: this.state.matchups.map((m) => ({
          promptText: m.promptText,
          playerA: m.playerA,
          playerAName: this.context.players.get(m.playerA)?.userName ?? 'Unknown',
          answerA: m.answerA,
          playerB: m.playerB,
          playerBName: this.context.players.get(m.playerB)?.userName ?? 'Unknown',
          answerB: m.answerB,
          votePercentA: m.votePercentA,
          votePercentB: m.votePercentB,
          winnerId: m.winnerId,
          isQuiplash: m.isQuiplash,
        })),
      },
    });

    this.startPhaseTimer(WW_ROUND_RESULTS_DURATION);

    this.setTimeout(() => {
      this.clearPhaseTimer();
      if (this.state.currentRound < this.state.totalRounds) {
        this.startRound();
      } else {
        this.endGame();
      }
    }, WW_ROUND_RESULTS_DURATION * 1000);
  }

  private endGame(): void {
    this.state.phase = WitWarPhase.GAME_OVER;
    this.cleanup();
    this.context.onComplete(this.computeResults());
  }

  // ─── Input Handling ─────────────────────────────────────────

  handleInput(userId: string, action: string, data: unknown): void {
    switch (action) {
      case 'WW_SUBMIT_ANSWER':
        this.handleSubmitAnswer(userId, data);
        break;
      case 'WW_CAST_VOTE':
        this.handleCastVote(userId, data);
        break;
      default:
        logger.warn({
          event: 'wit_war:unknown_action',
          lobbyId: this.context.lobbyId,
          userId,
          action,
        });
    }
  }

  private handleSubmitAnswer(userId: string, data: unknown): void {
    if (this.state.phase !== WitWarPhase.WRITING) return;

    const parsed = SubmitAnswerSchema.safeParse(data);
    if (!parsed.success) return;

    const { promptIndex, answer } = parsed.data;

    // Find the matchup this player is assigned to for this prompt
    const matchup = this.state.matchups.find(
      (m) =>
        m.promptIndex === promptIndex &&
        (m.playerA === userId || m.playerB === userId),
    );
    if (!matchup) return;

    if (matchup.playerA === userId) {
      matchup.answerA = answer;
    } else {
      matchup.answerB = answer;
    }

    // Check if this player has submitted all their answers
    const playerAssignments = this.state.assignments[userId] ?? [];
    const allSubmitted = playerAssignments.every((a) => {
      const m = this.state.matchups[a.matchupIndex];
      if (!m) return false;
      return m.playerA === userId ? m.answerA !== null : m.answerB !== null;
    });

    if (allSubmitted) {
      this.state.submitted.add(userId);
    }

    this.context.broadcastAction({
      type: 'WW_SUBMIT_COUNT',
      payload: {
        submittedCount: this.state.submitted.size,
        totalPlayers: this.context.players.size,
      },
    });

    this.context.sendToPlayer(userId, 'rmhbox:game:action', {
      type: 'WW_ANSWER_ACCEPTED',
      payload: { promptIndex },
    });

    this.logAction('answer_submitted', { userId, promptIndex });
  }

  private handleCastVote(userId: string, data: unknown): void {
    if (this.state.phase !== WitWarPhase.VOTING) return;

    const parsed = CastVoteSchema.safeParse(data);
    if (!parsed.success) return;

    const { matchupIndex, votedForUserId } = parsed.data;

    if (matchupIndex !== this.state.currentMatchupIndex) return;

    const matchup = this.state.matchups[matchupIndex];
    if (!matchup) return;

    // Authors cannot vote on their own matchup
    if (userId === matchup.playerA || userId === matchup.playerB) return;

    // Must vote for one of the two contestants
    if (votedForUserId !== matchup.playerA && votedForUserId !== matchup.playerB) return;

    matchup.votes[userId] = votedForUserId;

    const voterCount = this.context.players.size - 2;
    const voteCount = Object.keys(matchup.votes).length;

    this.context.broadcastAction({
      type: 'WW_VOTE_COUNT',
      payload: {
        matchupIndex,
        voteCount,
        totalVoters: Math.max(voterCount, 1),
      },
    });

    // End voting early if all eligible voters have voted
    if (voteCount >= Math.max(voterCount, 1) && this.votingTimeoutHandle) {
      this.clearTrackedTimeout(this.votingTimeoutHandle);
      this.endMatchupVoting();
    }
  }

  // ─── State Getters ──────────────────────────────────────────

  getStateForPlayer(userId: string): unknown {
    const base = {
      phase: this.state.phase,
      currentRound: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      scores: this.state.scores,
      timeRemaining: this.state.timeRemaining,
    };

    switch (this.state.phase) {
      case WitWarPhase.PROMPT_REVEAL:
      case WitWarPhase.WRITING: {
        const myAssignments = this.state.assignments[userId] ?? [];
        return {
          ...base,
          prompts: myAssignments.map((a) => ({
            promptIndex: a.promptIndex,
            promptText: a.promptText,
            matchupIndex: a.matchupIndex,
          })),
          submittedCount: this.state.submitted.size,
          totalPlayers: this.context.players.size,
          hasSubmitted: this.state.submitted.has(userId),
        };
      }

      case WitWarPhase.VOTING: {
        const matchup = this.state.matchups[this.state.currentMatchupIndex];
        const isAuthor = matchup && (matchup.playerA === userId || matchup.playerB === userId);
        return {
          ...base,
          matchupIndex: this.state.currentMatchupIndex,
          totalMatchups: this.state.matchups.length,
          promptText: matchup?.promptText,
          answerA: matchup?.answerA,
          answerB: matchup?.answerB,
          playerA: matchup?.playerA,
          playerB: matchup?.playerB,
          isAuthor,
          myVote: matchup?.votes[userId] ?? null,
          voteCount: matchup ? Object.keys(matchup.votes).length : 0,
          totalVoters: Math.max(this.context.players.size - 2, 1),
        };
      }

      case WitWarPhase.MATCHUP_RESULTS: {
        const matchup = this.state.matchups[this.state.currentMatchupIndex];
        return {
          ...base,
          matchupIndex: this.state.currentMatchupIndex,
          matchup: matchup ? {
            promptText: matchup.promptText,
            playerA: matchup.playerA,
            playerAName: this.context.players.get(matchup.playerA)?.userName,
            answerA: matchup.answerA,
            playerB: matchup.playerB,
            playerBName: this.context.players.get(matchup.playerB)?.userName,
            answerB: matchup.answerB,
            votePercentA: matchup.votePercentA,
            votePercentB: matchup.votePercentB,
            winnerId: matchup.winnerId,
            isQuiplash: matchup.isQuiplash,
          } : null,
        };
      }

      case WitWarPhase.ROUND_RESULTS:
      case WitWarPhase.GAME_OVER:
        return base;

      default:
        return base;
    }
  }

  getStateForSpectator(): unknown {
    const matchup = this.state.matchups[this.state.currentMatchupIndex];
    const allPrompts = this.state.matchups.map((m) => ({
      promptText: m.promptText,
      playerA: m.playerA,
      playerAName: this.context.players.get(m.playerA)?.userName ?? 'Unknown',
      answerA: m.answerA,
      playerB: m.playerB,
      playerBName: this.context.players.get(m.playerB)?.userName ?? 'Unknown',
      answerB: m.answerB,
      votePercentA: m.votePercentA,
      votePercentB: m.votePercentB,
      winnerId: m.winnerId,
      isQuiplash: m.isQuiplash,
    }));

    return {
      phase: this.state.phase,
      currentRound: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      scores: this.state.scores,
      matchupIndex: this.state.currentMatchupIndex,
      totalMatchups: this.state.matchups.length,
      timeRemaining: this.state.timeRemaining,
      submittedCount: this.state.submitted.size,
      totalPlayers: this.context.players.size,
      allPrompts,
      currentMatchup: matchup ? {
        promptText: matchup.promptText,
        playerA: matchup.playerA,
        playerAName: this.context.players.get(matchup.playerA)?.userName ?? 'Unknown',
        answerA: matchup.answerA,
        playerB: matchup.playerB,
        playerBName: this.context.players.get(matchup.playerB)?.userName ?? 'Unknown',
        answerB: matchup.answerB,
        votePercentA: matchup.votePercentA,
        votePercentB: matchup.votePercentB,
        winnerId: matchup.winnerId,
        isQuiplash: matchup.isQuiplash,
        votes: matchup.votes,
      } : null,
    };
  }

  // ─── Results & Awards ──────────────────────────────────────

  computeResults(): MinigameResults {
    const rankings = this.computeRankings();
    const awards = this.computeAwards();
    const duration = Date.now() - this.startedAt;

    return {
      rankings,
      awards,
      gameSpecificData: {
        roundMatchups: this.state.roundMatchups,
        totalRounds: this.state.totalRounds,
        gameLog: this.buildGameLog(),
      },
      duration,
    };
  }

  private computeRankings(): PlayerRanking[] {
    const entries: PlayerRanking[] = [];

    for (const userId of this.context.players.keys()) {
      const player = this.context.players.get(userId)!;
      const score = this.state.scores[userId] ?? 0;

      const deltas: Record<string, number> = {};
      this.state.roundMatchups.forEach((matchups, roundIdx) => {
        let roundScore = 0;
        for (const m of matchups) {
          if (m.playerA === userId) {
            const pts = m.answerA === WW_SAFETY_QUIP ? 0 : Math.round((m.votePercentA / 100) * WW_MAX_MATCHUP_POINTS);
            const bonus = m.isQuiplash && m.winnerId === userId ? WW_QUIPLASH_BONUS : 0;
            roundScore += pts + bonus;
          } else if (m.playerB === userId) {
            const pts = m.answerB === WW_SAFETY_QUIP ? 0 : Math.round((m.votePercentB / 100) * WW_MAX_MATCHUP_POINTS);
            const bonus = m.isQuiplash && m.winnerId === userId ? WW_QUIPLASH_BONUS : 0;
            roundScore += pts + bonus;
          }
        }
        deltas[`round_${roundIdx + 1}`] = roundScore;
      });

      entries.push({
        userId,
        userName: player.userName,
        score,
        rank: 0,
        deltas,
      });
    }

    entries.sort((a, b) => b.score - a.score);
    entries.forEach((e, i) => {
      e.rank = i + 1;
    });

    return entries;
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];
    const allMatchups = this.state.roundMatchups.flat();

    // Stats per player
    const stats: Record<string, {
      totalVotePct: number;
      matchupsPlayed: number;
      quiplashWins: number;
      biggestUpset: number;
      safetyQuips: number;
    }> = {};

    for (const userId of this.context.players.keys()) {
      stats[userId] = {
        totalVotePct: 0,
        matchupsPlayed: 0,
        quiplashWins: 0,
        biggestUpset: 0,
        safetyQuips: 0,
      };
    }

    for (const m of allMatchups) {
      if (stats[m.playerA]) {
        stats[m.playerA].matchupsPlayed++;
        stats[m.playerA].totalVotePct += m.votePercentA;
        if (m.answerA === WW_SAFETY_QUIP) stats[m.playerA].safetyQuips++;
        if (m.isQuiplash && m.winnerId === m.playerA) stats[m.playerA].quiplashWins++;
        if (m.votePercentA > 50 && m.votePercentA > stats[m.playerA].biggestUpset) {
          stats[m.playerA].biggestUpset = m.votePercentA;
        }
      }
      if (stats[m.playerB]) {
        stats[m.playerB].matchupsPlayed++;
        stats[m.playerB].totalVotePct += m.votePercentB;
        if (m.answerB === WW_SAFETY_QUIP) stats[m.playerB].safetyQuips++;
        if (m.isQuiplash && m.winnerId === m.playerB) stats[m.playerB].quiplashWins++;
        if (m.votePercentB > 50 && m.votePercentB > stats[m.playerB].biggestUpset) {
          stats[m.playerB].biggestUpset = m.votePercentB;
        }
      }
    }

    // Crowd Pleaser — highest average vote percentage
    let crowdPleaser: { userId: string; avgPct: number } | null = null;
    for (const [userId, s] of Object.entries(stats)) {
      if (s.matchupsPlayed === 0) continue;
      const avg = s.totalVotePct / s.matchupsPlayed;
      if (!crowdPleaser || avg > crowdPleaser.avgPct) {
        crowdPleaser = { userId, avgPct: avg };
      }
    }
    if (crowdPleaser && crowdPleaser.avgPct > 0) {
      awards.push({
        userId: crowdPleaser.userId,
        title: 'Crowd Pleaser',
        description: `Averaged ${Math.round(crowdPleaser.avgPct)}% of votes per matchup`,
        icon: 'heart',
      });
    }

    // Wit-War! — most unanimous wins
    let witWarChamp: { userId: string; count: number } | null = null;
    for (const [userId, s] of Object.entries(stats)) {
      if (s.quiplashWins > 0 && (!witWarChamp || s.quiplashWins > witWarChamp.count)) {
        witWarChamp = { userId, count: s.quiplashWins };
      }
    }
    if (witWarChamp) {
      awards.push({
        userId: witWarChamp.userId,
        title: 'Wit-War!',
        description: `Won ${witWarChamp.count} matchup${witWarChamp.count > 1 ? 's' : ''} unanimously`,
        icon: 'zap',
      });
    }

    // Dark Horse — biggest single upset (highest vote % in a single matchup)
    let darkHorse: { userId: string; pct: number } | null = null;
    for (const [userId, s] of Object.entries(stats)) {
      if (s.biggestUpset > 0 && (!darkHorse || s.biggestUpset > darkHorse.pct)) {
        darkHorse = { userId, pct: s.biggestUpset };
      }
    }
    if (darkHorse && darkHorse.pct > 75) {
      awards.push({
        userId: darkHorse.userId,
        title: 'Dark Horse',
        description: `Won a matchup with ${darkHorse.pct}% of the vote`,
        icon: 'trending-up',
      });
    }

    return awards;
  }

  private buildGameLog(): Record<string, unknown> {
    return {
      type: 'wit-war',
      initialState: {
        totalRounds: this.state.totalRounds,
        playerCount: this.context.players.size,
      },
      actions: this.state.actionLog,
    };
  }

  private logAction(type: string, payload: Record<string, unknown>): void {
    this.state.actionLog.push({
      seq: this.state.actionLog.length + 1,
      type,
      timestamp: Date.now(),
      payload,
    });
  }

  // ─── Disconnect Handling ───────────────────────────────────

  handlePlayerDisconnect(userId: string): void {
    logger.info({
      event: 'wit_war:player_disconnect',
      lobbyId: this.context.lobbyId,
      userId,
      round: this.state.currentRound,
      phase: this.state.phase,
    });
  }
}
