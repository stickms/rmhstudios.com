/**
 * RMHbox — Rhyme Time Minigame Server Handler
 *
 * Players are given a root word each round and must submit as many
 * valid rhyming words as possible within the time limit. Submissions
 * are validated server-side using the `rhyming-part` package, which
 * checks phonetic rhyme matching via the CMU Pronouncing Dictionary.
 *
 * Scoring rewards rarity (how few players found the same word),
 * multi-syllable rhymes (2× multiplier), and speed (first player to
 * submit a rare word gets a bonus). Invalid submissions incur a penalty.
 *
 * Phases per round:
 *   ROUND_START → INPUT → SCORING → INTERMISSION → (next round or end)
 *
 * Join-in-progress policy: spectate_only — late joiners receive
 * spectator state and do not participate until the next game.
 *
 * Reference: docs/rmhbox/design-spec/minigames/rhyme-time.md
 */

import { BaseMinigame } from '../base-minigame';
import type { MinigameContext, MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import type { RootWord } from '@/lib/rmhbox/rhyme-time/dictionary-loader';
import { loadRootWords, isValidRhyme, isMultiSyllableRhyme, isKnownWord } from '@/lib/rmhbox/rhyme-time/dictionary-loader';
import { SubmitRhymeSchema } from '@/lib/rmhbox/rhyme-time/schemas';
import {
  RT_TOTAL_ROUNDS,
  RT_INPUT_DURATION,
  RT_SCORING_DURATION,
  RT_INTERMISSION_DURATION,
  RT_ROUND_START_DURATION,
  RT_MAX_SUBMISSIONS,
  RT_COMMON_POINTS,
  RT_UNCOMMON_POINTS,
  RT_RARE_POINTS,
  RT_MULTI_SYLLABLE_MULT,
  RT_SPEED_BONUS,
  RT_INVALID_PENALTY,
} from '@/lib/rmhbox/constants';
import { logger } from '../../logger';
import {
  RhymeTimePhase,
  type PlayerSubmission,
  type WordBreakdown,
  type RoundResult,
  type PlayerRoundResult,
  type RhymeTimeState,
} from './types';

// ─── Rhyme Time Minigame ─────────────────────────────────────────

export class RhymeTimeMinigame extends BaseMinigame {
  private rootWords: RootWord[];
  private usedRootWords: Set<string> = new Set();
  private state!: RhymeTimeState;
  private startedAt: number = 0;

  get spectatorMode(): 'competitive-individual' { return 'competitive-individual'; }

  constructor(context: MinigameContext) {
    super(context);
    this.rootWords = loadRootWords();
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();
    this.initializeState();

    const totalRounds = this.getSetting('totalRounds', RT_TOTAL_ROUNDS);
    logger.info({
      event: 'rhyme_time:start',
      lobbyId: this.context.lobbyId,
      totalRounds,
      playerCount: this.context.players.size,
    });

    this.startRound();
  }

  private initializeState(): void {
    const scores: Record<string, number> = {};
    Array.from(this.context.players.keys()).forEach((userId) => {
      scores[userId] = 0;
    });
    this.state = {
      phase: RhymeTimePhase.ROUND_START,
      currentRound: 0,
      totalRounds: this.getSetting('totalRounds', RT_TOTAL_ROUNDS),
      rootWord: null,
      timeRemaining: 0,
      submissions: {},
      roundResults: [],
      scores,
      actionLog: [],
    };
  }

  private selectRootWord(): RootWord {
    const available = this.rootWords.filter((rw) => !this.usedRootWords.has(rw.word));
    const pool = available.length > 0 ? available : this.rootWords;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    this.usedRootWords.add(selected.word);
    return selected;
  }

  private startRound(): void {
    if (!this.isRunning) return;

    this.state.currentRound++;
    this.state.rootWord = this.selectRootWord();
    this.state.phase = RhymeTimePhase.ROUND_START;
    this.state.timeRemaining = RT_ROUND_START_DURATION;

    // Reset submissions for this round
    this.state.submissions = {};
    Array.from(this.context.players.keys()).forEach((userId) => {
      this.state.submissions[userId] = [];
    });

    this.logAction('round_start', {
      round: this.state.currentRound,
      rootWord: this.state.rootWord.word,
      difficulty: this.state.rootWord.difficulty,
    });

    logger.info({
      event: 'rhyme_time:round_start',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
      rootWord: this.state.rootWord.word,
    });

    // Broadcast sub-round to the footer counter
    this.broadcastRound(this.state.currentRound, this.state.totalRounds);

    this.broadcastGameAction({
      type: 'RT_ROUND_START',
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      rootWord: this.state.rootWord,
      duration: RT_ROUND_START_DURATION,
    });

    // Show reveal countdown in the header timer
    this.startPhaseTimer(RT_ROUND_START_DURATION);

    this.setTimeout(() => this.startInputPhase(), RT_ROUND_START_DURATION * 1000);
  }

  private startInputPhase(): void {
    if (!this.isRunning) return;

    const inputDuration = this.getSetting('inputDuration', RT_INPUT_DURATION);
    this.state.phase = RhymeTimePhase.INPUT;
    this.state.timeRemaining = inputDuration;

    logger.info({
      event: 'rhyme_time:input_phase_start',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
      duration: inputDuration,
    });

    this.broadcastGameAction({
      type: 'RT_INPUT_START',
      duration: inputDuration,
      timeRemaining: inputDuration,
    });

    // Drive the header timer ring for the input phase
    this.startPhaseTimer(inputDuration);

    this.setTimeout(() => this.endInputPhase(), inputDuration * 1000);
  }

  private endInputPhase(): void {
    if (!this.isRunning) return;

    // Clear the phase timer before changing phase
    this.clearPhaseTimer();

    this.state.phase = RhymeTimePhase.SCORING;
    this.state.timeRemaining = RT_SCORING_DURATION;

    const roundResult = this.computeRoundResults();
    this.state.roundResults.push(roundResult);

    // Update cumulative scores
    for (const [userId, playerResult] of Object.entries(roundResult.playerResults)) {
      this.state.scores[userId] = (this.state.scores[userId] ?? 0) + playerResult.roundScore;
    }

    // Determine round winner (highest score)
    const roundWinnerUserId = Object.entries(roundResult.playerResults)
      .sort(([, a], [, b]) => b.roundScore - a.roundScore)[0]?.[0] ?? null;

    this.logAction('round_end', {
      round: this.state.currentRound,
      rootWord: this.state.rootWord!.word,
      roundWinner: roundWinnerUserId,
      submissions: Object.entries(roundResult.playerResults).flatMap(([uid, pr]) =>
        pr.breakdown.map((wb) => ({
          userId: uid,
          word: wb.word,
          valid: wb.isValid,
          rarityTier: wb.rarity ?? 'invalid',
          score: wb.totalPoints,
          isMultiSyllable: wb.isMultiSyllable,
        })),
      ),
    });

    logger.info({
      event: 'rhyme_time:round_end',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
    });

    this.broadcastGameAction({
      type: 'RT_ROUND_RESULTS',
      round: this.state.currentRound,
      results: roundResult,
      scores: this.state.scores,
      duration: RT_SCORING_DURATION,
    });

    // Show scoring countdown in the header timer
    this.startPhaseTimer(RT_SCORING_DURATION);

    this.setTimeout(() => {
      if (this.state.currentRound >= this.state.totalRounds) {
        this.endGame();
      } else {
        this.startIntermission();
      }
    }, RT_SCORING_DURATION * 1000);
  }

  private startIntermission(): void {
    if (!this.isRunning) return;

    this.state.phase = RhymeTimePhase.INTERMISSION;
    this.state.timeRemaining = RT_INTERMISSION_DURATION;

    logger.info({
      event: 'rhyme_time:intermission',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
    });

    this.broadcastGameAction({
      type: 'RT_INTERMISSION',
      duration: RT_INTERMISSION_DURATION,
      nextRound: this.state.currentRound + 1,
      scores: this.state.scores,
    });

    // Show intermission countdown in the header timer
    this.startPhaseTimer(RT_INTERMISSION_DURATION);

    this.setTimeout(() => this.startRound(), RT_INTERMISSION_DURATION * 1000);
  }

  private endGame(): void {
    if (!this.isRunning) return;

    logger.info({
      event: 'rhyme_time:game_end',
      lobbyId: this.context.lobbyId,
      rounds: this.state.currentRound,
    });

    this.cleanup();
    this.context.onComplete(this.computeResults());
  }

  // ─── Input Handling ──────────────────────────────────────────

  handleInput(userId: string, action: string, data: unknown): void {
    if (action !== 'SUBMIT_RHYME') return;
    if (this.state.phase !== RhymeTimePhase.INPUT) return;

    const parsed = SubmitRhymeSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'RT_RHYME_REJECTED',
        reason: 'invalid_input',
      });
      return;
    }

    const { word } = parsed.data;
    const playerSubs = this.state.submissions[userId];
    if (!playerSubs) return; // not a participant

    if (playerSubs.length >= this.getSetting('maxSubmissions', RT_MAX_SUBMISSIONS)) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'RT_RHYME_REJECTED',
        reason: 'max_submissions',
      });
      return;
    }

    // Check for duplicate submission by this player
    if (playerSubs.some((s) => s.word === word)) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'RT_RHYME_REJECTED',
        reason: 'duplicate',
      });
      return;
    }

    // Validate the rhyme server-side using rhyming-part
    const rootWord = this.state.rootWord!;
    const isValid = this.validateRhyme(word, rootWord);
    const multiSyllable = isValid ? isMultiSyllableRhyme(word, rootWord.syllableCount) : false;

    // Determine invalid reason for client feedback
    let invalidReason: string | undefined;
    if (!isValid) {
      invalidReason = isKnownWord(word) ? 'does_not_rhyme' : 'not_in_dictionary';
    }

    const submission: PlayerSubmission = {
      word,
      timestamp: Date.now(),
      isValid,
      isMultiSyllable: multiSyllable,
      invalidReason: invalidReason as PlayerSubmission['invalidReason'],
    };

    playerSubs.push(submission);

    this.logAction('submission', {
      round: this.state.currentRound,
      userId,
      word,
      valid: isValid,
      duplicate: false,
      isMultiSyllable: multiSyllable,
    });

    // Notify the submitter
    this.context.sendToPlayer(userId, 'rmhbox:game:action', {
      type: 'RT_RHYME_SUBMITTED',
      word,
      isValid,
      invalidReason,
      submissionCount: playerSubs.length,
      maxSubmissions: this.getSetting('maxSubmissions', RT_MAX_SUBMISSIONS),
    });

    // Mirror to spectators following this player
    this.context.sendToSpectatorFollowers(userId, 'rmhbox:game:action', {
      type: 'RT_RHYME_SUBMITTED',
      word,
      isValid,
      invalidReason,
      submissionCount: playerSubs.length,
      maxSubmissions: this.getSetting('maxSubmissions', RT_MAX_SUBMISSIONS),
    });

    // Broadcast valid submission count to all
    const validCount = playerSubs.filter((s) => s.isValid).length;
    this.broadcastGameAction({
      type: 'RT_SUBMISSION_COUNT',
      userId,
      count: validCount,
    });
  }

  private validateRhyme(word: string, rootWord: RootWord): boolean {
    return isValidRhyme(word, rootWord.word);
  }

  // ─── Scoring ─────────────────────────────────────────────────

  private computeRoundResults(): RoundResult {
    const rootWord = this.state.rootWord!;

    // Count how many players submitted each valid word
    const wordSubmitterCounts: Record<string, number> = {};
    // Track who first submitted each valid word (for speed bonus on rare words)
    const wordFirstSubmitter: Record<string, { userId: string; timestamp: number }> = {};

    for (const [userId, subs] of Object.entries(this.state.submissions)) {
      for (const sub of subs) {
        if (!sub.isValid) continue;
        wordSubmitterCounts[sub.word] = (wordSubmitterCounts[sub.word] ?? 0) + 1;
        const first = wordFirstSubmitter[sub.word];
        if (!first || sub.timestamp < first.timestamp) {
          wordFirstSubmitter[sub.word] = { userId, timestamp: sub.timestamp };
        }
      }
    }

    const totalPlayers = Object.keys(this.state.submissions).length;
    const playerResults: Record<string, PlayerRoundResult> = {};

    for (const [userId, subs] of Object.entries(this.state.submissions)) {
      const player = this.context.players.get(userId);
      const userName = player?.userName ?? 'Unknown';
      const breakdown: WordBreakdown[] = [];
      let roundScore = 0;
      let validCount = 0;
      let invalidCount = 0;

      for (const sub of subs) {
        if (!sub.isValid) {
          // Not-in-dictionary words get 0 points (no penalty) and are NOT counted as invalid;
          // known words that don't rhyme get -1 penalty and ARE counted as invalid
          const invalidPenalty = this.getSetting('invalidPenalty', RT_INVALID_PENALTY);
          const penalty = sub.invalidReason === 'not_in_dictionary' ? 0 : invalidPenalty;
          if (sub.invalidReason !== 'not_in_dictionary') {
            invalidCount++;
          }
          breakdown.push({
            word: sub.word,
            isValid: false,
            invalidReason: sub.invalidReason,
            rarity: null,
            basePoints: penalty,
            multiSyllableMultiplier: 1,
            speedBonus: 0,
            totalPoints: penalty,
            submitterCount: 0,
            isMultiSyllable: false,
          });
          roundScore += penalty;
          continue;
        }

        validCount++;
        const submitterCount = wordSubmitterCounts[sub.word] ?? 1;
        const rarity = this.computeRarity(submitterCount, totalPlayers);
        const basePoints = this.getBasePoints(rarity);
        const isMultiSyllable = sub.isMultiSyllable;
        const enableMultiSyllable = this.getSetting('enableMultiSyllableBonus', RT_MULTI_SYLLABLE_MULT > 1);
        const multiSyllableMultiplier = (isMultiSyllable && enableMultiSyllable) ? RT_MULTI_SYLLABLE_MULT : 1;

        // Speed bonus: first submitter of a word
        const enableSpeed = this.getSetting('enableSpeedBonus', RT_SPEED_BONUS > 0);
        let speedBonus = 0;
        if (enableSpeed && submitterCount === 1) {
          const first = wordFirstSubmitter[sub.word];
          if (first && first.userId === userId) {
            speedBonus = RT_SPEED_BONUS;
          }
        }

        const totalPoints = basePoints * multiSyllableMultiplier + speedBonus;
        breakdown.push({
          word: sub.word,
          isValid: true,
          rarity,
          basePoints,
          multiSyllableMultiplier,
          speedBonus,
          totalPoints,
          submitterCount,
          isMultiSyllable,
        });
        roundScore += totalPoints;
      }

      playerResults[userId] = {
        userId,
        userName,
        breakdown,
        roundScore,
        validCount,
        invalidCount,
      };
    }

    return {
      roundNumber: this.state.currentRound,
      rootWord,
      playerResults,
    };
  }

  private computeRarity(
    submitterCount: number,
    totalPlayers: number,
  ): 'common' | 'uncommon' | 'rare' {
    if (totalPlayers <= 1) return 'rare';
    const ratio = submitterCount / totalPlayers;
    if (ratio > 0.5) return 'common';
    if (ratio > 0.2) return 'uncommon';
    return 'rare';
  }

  private getBasePoints(rarity: 'common' | 'uncommon' | 'rare'): number {
    switch (rarity) {
      case 'common': return RT_COMMON_POINTS;
      case 'uncommon': return RT_UNCOMMON_POINTS;
      case 'rare': return RT_RARE_POINTS;
    }
  }

  // ─── State Masking ───────────────────────────────────────────

  getStateForPlayer(userId: string): unknown {
    const base = {
      phase: this.state.phase,
      currentRound: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      rootWord: this.state.rootWord,
      timeRemaining: this.state.timeRemaining,
      scores: this.state.scores,
    };

    if (this.state.phase === RhymeTimePhase.INPUT) {
      return {
        ...base,
        mySubmissions: this.state.submissions[userId] ?? [],
        roundResults: [],
      };
    }

    // SCORING or INTERMISSION — show all results
    return {
      ...base,
      mySubmissions: this.state.submissions[userId] ?? [],
      roundResults: this.state.roundResults,
    };
  }

  getStateForSpectator(): unknown {
    const base = {
      phase: this.state.phase,
      currentRound: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      rootWord: this.state.rootWord,
      timeRemaining: this.state.timeRemaining,
      scores: this.state.scores,
    };

    if (this.state.phase === RhymeTimePhase.INPUT) {
      return {
        ...base,
        mySubmissions: [],
        roundResults: [],
      };
    }

    return {
      ...base,
      mySubmissions: [],
      roundResults: this.state.roundResults,
    };
  }

  // ─── Join-in-Progress / Reconnection / Disconnect ────────────

  handlePlayerJoin(userId: string): void {
    // spectate_only: JIP players get spectator state
    this.context.sendToPlayer(
      userId,
      'rmhbox:game:state_snapshot',
      this.getStateForSpectator(),
    );
  }

  handlePlayerDisconnect(_userId: string): void {
    // Submissions are preserved and scored normally at round end
    logger.info({
      event: 'rhyme_time:player_disconnect',
      lobbyId: this.context.lobbyId,
      userId: _userId,
      round: this.state.currentRound,
      submissionsPreserved: (this.state.submissions[_userId] ?? []).length,
    });
  }

  handlePlayerReconnect(userId: string): void {
    logger.info({
      event: 'rhyme_time:player_reconnect',
      lobbyId: this.context.lobbyId,
      userId,
      round: this.state.currentRound,
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
        roundResults: this.state.roundResults,
        totalRounds: this.state.totalRounds,
        gameLog: this.buildGameLog(),
      },
      duration,
    };
  }

  private computeRankings(): PlayerRanking[] {
    const entries: PlayerRanking[] = [];

    Array.from(this.context.players.keys()).forEach((userId) => {
      const player = this.context.players.get(userId)!;
      const score = this.state.scores[userId] ?? 0;

      // Build per-round deltas
      const deltas: Record<string, number> = {};
      for (const rr of this.state.roundResults) {
        const pr = rr.playerResults[userId];
        deltas[`round_${rr.roundNumber}`] = pr?.roundScore ?? 0;
      }

      entries.push({
        userId,
        userName: player.userName,
        score,
        rank: 0,
        deltas,
      });
    });
    entries.sort((a, b) => b.score - a.score);
    entries.forEach((e, i) => { e.rank = i + 1; });

    return entries;
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];

    // Aggregate stats per player across all rounds
    const stats: Record<string, {
      validCount: number;
      rareCount: number;
      multiSyllableCount: number;
      speedBonusCount: number;
      hitMaxSubmissions: boolean;
    }> = {};

    Array.from(this.context.players.keys()).forEach((userId) => {
      stats[userId] = {
        validCount: 0,
        rareCount: 0,
        multiSyllableCount: 0,
        speedBonusCount: 0,
        hitMaxSubmissions: false,
      };
    });

    for (const rr of this.state.roundResults) {
      for (const [userId, pr] of Object.entries(rr.playerResults)) {
        if (!stats[userId]) continue;
        stats[userId].validCount += pr.validCount;
        for (const wb of pr.breakdown) {
          if (wb.isValid && wb.rarity === 'rare') stats[userId].rareCount++;
          if (wb.isValid && wb.isMultiSyllable) stats[userId].multiSyllableCount++;
          if (wb.speedBonus > 0) stats[userId].speedBonusCount++;
        }
      }
    }

    // Check max submissions per round
    for (const rr of this.state.roundResults) {
      for (const [userId, pr] of Object.entries(rr.playerResults)) {
        if (stats[userId] && pr.breakdown.length >= RT_MAX_SUBMISSIONS) {
          stats[userId].hitMaxSubmissions = true;
        }
      }
    }

    // Wordsmith — most valid submissions
    const wordsmithEntry = this.findTopPlayer(stats, (s) => s.validCount);
    if (wordsmithEntry && wordsmithEntry.value > 0) {
      awards.push({
        userId: wordsmithEntry.userId,
        title: 'Wordsmith',
        description: `Submitted ${wordsmithEntry.value} valid rhymes`,
        icon: 'pencil-line',
      });
    }

    // Diamond in the Rough — most rare words
    const diamondEntry = this.findTopPlayer(stats, (s) => s.rareCount);
    if (diamondEntry && diamondEntry.value > 0) {
      awards.push({
        userId: diamondEntry.userId,
        title: 'Diamond in the Rough',
        description: `Found ${diamondEntry.value} rare rhymes`,
        icon: 'gem',
      });
    }

    // Syllable Surfer — most multi-syllable rhymes
    const syllableEntry = this.findTopPlayer(stats, (s) => s.multiSyllableCount);
    if (syllableEntry && syllableEntry.value > 0) {
      awards.push({
        userId: syllableEntry.userId,
        title: 'Syllable Surfer',
        description: `Submitted ${syllableEntry.value} multi-syllable rhymes`,
        icon: 'waves',
      });
    }

    // Quick Draw — most speed bonuses
    const quickDrawEntry = this.findTopPlayer(stats, (s) => s.speedBonusCount);
    if (quickDrawEntry && quickDrawEntry.value > 0) {
      awards.push({
        userId: quickDrawEntry.userId,
        title: 'Quick Draw',
        description: `Earned ${quickDrawEntry.value} speed bonuses`,
        icon: 'zap',
      });
    }

    // Overachiever — hit max submissions in at least one round
    for (const [userId, s] of Object.entries(stats)) {
      if (s.hitMaxSubmissions) {
        awards.push({
          userId,
          title: 'Overachiever',
          description: `Hit the ${RT_MAX_SUBMISSIONS}-word submission limit`,
          icon: 'trophy',
        });
      }
    }

    return awards;
  }

  private findTopPlayer<T>(
    stats: Record<string, T>,
    getValue: (s: T) => number,
  ): { userId: string; value: number } | null {
    let topUserId: string | null = null;
    let topValue = -1;
    for (const [userId, s] of Object.entries(stats)) {
      const v = getValue(s);
      if (v > topValue) {
        topValue = v;
        topUserId = userId;
      }
    }
    return topUserId ? { userId: topUserId, value: topValue } : null;
  }

  // ─── Action Log / Game Log ───────────────────────────────────

  private actionSeq = 0;

  private logAction(type: string, payload: Record<string, unknown>): void {
    this.state.actionLog.push({
      seq: ++this.actionSeq,
      type,
      timestamp: Date.now(),
      payload,
    });
  }

  private buildGameLog(): Record<string, unknown> {
    const players = Array.from(this.context.players.entries()).map(([userId, p]) => ({
      userId,
      userName: p.userName,
    }));

    return {
      lobbyId: this.context.lobbyId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      totalRounds: this.state.totalRounds,
      roundsPlayed: this.state.currentRound,
      playerCount: this.context.players.size,
      players,
      initialState: {
        rounds: this.state.totalRounds,
        secondsPerRound: this.getSetting('inputDuration', 45),
        maxSubmissionsPerRound: this.getSetting('maxSubmissions', 10),
      },
      actions: this.state.actionLog,
      finalResults: Array.from(this.context.players.keys()).map((userId) => ({
        userId,
        userName: this.context.players.get(userId)?.userName ?? 'Unknown',
        score: this.state.scores[userId] ?? 0,
      })),
    };
  }
}
