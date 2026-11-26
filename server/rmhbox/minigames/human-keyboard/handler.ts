/**
 * RMHbox — Human Keyboard Minigame Server Handler
 *
 * A cooperative round. The 26 letters are dealt among the players and the table
 * types one bundled sentence together, each player pressing only the letters
 * they hold. The hub judges every press:
 *
 *   the next letter, pressed by its holder     -> the cursor advances
 *   a letter the presser does not hold         -> ignored for everyone else ("Not yours")
 *   a held letter that is not the next one     -> the cursor locks 500 ms for the table, -5 points
 *   a space                                    -> advances by itself after 200 ms
 *
 * The keys are dealt out again every `reshuffleSeconds` (with a 3 s warning);
 * the cursor never moves on a reshuffle. A disconnected player's letters go to
 * the others after 5 s and are dealt back at the next reshuffle once they are
 * connected again.
 *
 * Phases per round: REVEAL (3 s) -> TYPING (up to 90 s, or until the sentence is
 * complete) -> ROUND_RESULT (5 s) -> next round or end.
 *
 * Secrecy: a player's state carries their own letters only. The count of
 * letters each player holds is public, and a spectator sees every deal. The
 * sentence is public from its reveal; later rounds' sentences stay on the hub.
 *
 * Every timer is a BaseMinigame tracked timeout, so a pause suspends them all.
 *
 * Join-in-progress policy: spectate_only.
 */

import { BaseMinigame } from '../base-minigame';
import type { MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import { loadSentences } from '@/lib/rmhbox/human-keyboard/data-loader';
import type { Sentence } from '@/lib/rmhbox/human-keyboard/rules';
import { loadPackLines } from '../../pack-loader';
import { PressInputSchema } from '@/lib/rmhbox/human-keyboard/schemas';
import {
  dealLetters,
  isValidSentenceText,
  judgePress,
  letterCounts,
  nextLetterIndex,
  pickSentence,
  pruneTimes,
  redistributeLetters,
  scoreRound,
} from '@/lib/rmhbox/human-keyboard/rules';
import {
  HK_DEFAULT_RESHUFFLE_SECONDS,
  HK_DEFAULT_ROUNDS,
  HK_INPUT_RATE_LIMIT,
  HK_RATE_WINDOW_MS,
  HK_REDEAL_GRACE_MS,
  HK_RESHUFFLE_WARNING_SECONDS,
  HK_RESULT_SECONDS,
  HK_REVEAL_SECONDS,
  HK_SPACE_DELAY_MS,
  HK_TYPING_SECONDS,
  HK_WRONG_KEY_LOCK_MS,
} from '@/lib/rmhbox/human-keyboard/settings';
import { ranksWithTies } from '@/lib/rmhbox/ranking-file/scoring';
import { logger } from '../../logger';
import type { GameLogAction, HKPlayerRoundResult, HKRoundResult, HumanKeyboardState } from './types';

/** Shape version of the stored game log (see GameLog in the history registry). */
const GAME_LOG_VERSION = 1;
const EVENT = 'rmhbox:game:action';

/**
 * A community pack's lines as sentences. Each is checked again with the game's own rule (lowercase letters and single
 * spaces, 20 to 60 characters); one that fails is dropped. A pack has no categories or difficulties.
 */
export function packSentences(lines: readonly string[]): Sentence[] {
  const out: Sentence[] = [];
  lines.forEach((text, i) => {
    if (isValidSentenceText(text)) out.push({ id: `pack-${i + 1}`, text, difficulty: 'easy', category: 'pack' });
  });
  return out;
}

export class HumanKeyboardGame extends BaseMinigame {
  private state!: HumanKeyboardState;
  private startedAt = 0;
  private actionLog: GameLogAction[] = [];
  private phaseHandle: NodeJS.Timeout | null = null;
  private reshuffleHandle: NodeJS.Timeout | null = null;
  private spaceHandle: NodeJS.Timeout | null = null;
  private redealHandles = new Map<string, NodeJS.Timeout>();
  private settingsUsed: Record<string, unknown> = {};
  private pausedAt = 0;

  /** Everyone is on the same team: a spectator sees the table and every deal. */
  get spectatorMode(): 'shared-privileged' {
    return 'shared-privileged';
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();

    const totalRounds = this.getSetting('rounds', HK_DEFAULT_ROUNDS);
    const reshuffleSeconds = this.getSetting('reshuffleSeconds', HK_DEFAULT_RESHUFFLE_SECONDS);

    const packCode = this.getSetting<string>('packCode', '');
    if (!packCode) {
      this.deal(loadSentences(), totalRounds, reshuffleSeconds);
      return;
    }
    // Optional community pack: resolve it before the first round; any failure falls back to the bundled sentences.
    void loadPackLines(packCode, 'human-keyboard').then((lines) => {
      if (!this.isRunning) return;
      const own = lines ? packSentences(lines) : [];
      this.deal(own.length > 0 ? own : loadSentences(), totalRounds, reshuffleSeconds);
      // The coordinator's first snapshot went out before the rounds existed; send it again now that they do.
      if (this.isRunning && this.state) this.broadcastInitialState('rmhbox:game:state_snapshot');
    });
  }

  /** Choose the round sentences from `sentences` and open the first round. */
  private deal(sentences: readonly Sentence[], totalRounds: number, reshuffleSeconds: number): void {
    const participants = new Set(this.context.players.keys());
    const used = new Set<string>();
    const chosen = [];
    for (let r = 0; r < totalRounds; r++) {
      const sentence = pickSentence(sentences, participants.size, used);
      if (!sentence) break;
      used.add(sentence.id);
      chosen.push(sentence);
    }

    const scores = new Map<string, number>();
    const totalCorrect = new Map<string, number>();
    const totalWrong = new Map<string, number>();
    const totalNotYours = new Map<string, number>();
    for (const userId of participants) {
      scores.set(userId, 0);
      totalCorrect.set(userId, 0);
      totalWrong.set(userId, 0);
      totalNotYours.set(userId, 0);
    }

    this.settingsUsed = { rounds: chosen.length, reshuffleSeconds };

    this.state = {
      sentences: chosen,
      currentRound: -1,
      totalRounds: chosen.length,
      phase: 'REVEAL',
      participants,
      cursor: 0,
      complete: false,
      deal: new Map(),
      lockedUntil: 0,
      pressTimes: new Map(),
      correct: new Map(),
      wrong: new Map(),
      scores,
      totalCorrect,
      totalWrong,
      totalNotYours,
      results: [],
      reshuffleSeconds,
      phaseStartedAt: Date.now(),
      phaseEndsAt: 0,
      nextReshuffleAt: 0,
    };

    logger.info({
      event: 'human_keyboard:start',
      lobbyId: this.context.lobbyId,
      totalRounds: chosen.length,
      playerCount: participants.size,
    });

    this.startNextRound();
  }

  // ─── Timers ──────────────────────────────────────────────────

  private schedulePhase(callback: () => void, delayMs: number): void {
    this.clearTrackedTimeout(this.phaseHandle);
    this.phaseHandle = this.setTimeout(callback, delayMs);
  }

  private clearRoundTimers(): void {
    this.clearTrackedTimeout(this.phaseHandle);
    this.phaseHandle = null;
    this.clearTrackedTimeout(this.reshuffleHandle);
    this.reshuffleHandle = null;
    this.clearTrackedTimeout(this.spaceHandle);
    this.spaceHandle = null;
    for (const handle of this.redealHandles.values()) this.clearTrackedTimeout(handle);
    this.redealHandles.clear();
  }

  /** Every tracked timer and the phase clock go; the base class clears the rest. */
  override cleanup(): void {
    this.redealHandles.clear();
    super.cleanup();
  }

  // ─── Round Flow ──────────────────────────────────────────────

  private startNextRound(): void {
    if (!this.isRunning) return;

    this.state.currentRound++;
    if (this.state.currentRound >= this.state.totalRounds) {
      this.endGame();
      return;
    }
    const round = this.state.currentRound;
    const sentence = this.state.sentences[round]!;

    this.clearRoundTimers();
    this.state.phase = 'REVEAL';
    this.state.cursor = 0;
    this.state.complete = false;
    this.state.lockedUntil = 0;
    this.state.nextReshuffleAt = 0;
    this.state.pressTimes = new Map();
    this.state.correct = new Map();
    this.state.wrong = new Map();
    for (const userId of this.state.participants) {
      this.state.correct.set(userId, 0);
      this.state.wrong.set(userId, 0);
    }
    this.state.deal = this.dealToConnected();

    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + HK_REVEAL_SECONDS * 1000;

    this.broadcastRound(round + 1, this.state.totalRounds);
    this.logAction('round_start', { roundIndex: round, sentenceId: sentence.id });

    this.broadcastGameAction({
      type: 'HK_ROUND',
      roundIndex: round,
      totalRounds: this.state.totalRounds,
      sentence: sentence.text,
      duration: HK_REVEAL_SECONDS,
    });
    this.sendDeal('round');

    this.startPhaseTimer(HK_REVEAL_SECONDS);
    this.schedulePhase(() => this.startTyping(), HK_REVEAL_SECONDS * 1000);
  }

  private startTyping(): void {
    if (!this.isRunning || this.state.phase !== 'REVEAL') return;
    const now = Date.now();
    this.state.phase = 'TYPING';
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + HK_TYPING_SECONDS * 1000;
    this.state.nextReshuffleAt = now + this.state.reshuffleSeconds * 1000;

    this.broadcastGameAction({
      type: 'HK_TYPING',
      roundIndex: this.state.currentRound,
      duration: HK_TYPING_SECONDS,
      phaseEndsAt: this.state.phaseEndsAt,
      nextReshuffleAt: this.state.nextReshuffleAt,
    });
    this.startPhaseTimer(HK_TYPING_SECONDS);
    this.schedulePhase(() => this.endRound(false), HK_TYPING_SECONDS * 1000);
    this.scheduleReshuffleWarning();
  }

  // ─── Reshuffle ───────────────────────────────────────────────

  private scheduleReshuffleWarning(): void {
    this.clearTrackedTimeout(this.reshuffleHandle);
    const lead = Math.max(0, this.state.reshuffleSeconds - HK_RESHUFFLE_WARNING_SECONDS);
    this.reshuffleHandle = this.setTimeout(() => this.warnReshuffle(), lead * 1000);
  }

  private warnReshuffle(): void {
    if (!this.isRunning || this.state.phase !== 'TYPING') return;
    this.broadcastGameAction({ type: 'HK_RESHUFFLE_WARNING', nextReshuffleAt: this.state.nextReshuffleAt });
    this.reshuffleHandle = this.setTimeout(() => this.reshuffle(), HK_RESHUFFLE_WARNING_SECONDS * 1000);
  }

  /** Deal the letters out again among the connected players. The cursor does not move. */
  private reshuffle(): void {
    if (!this.isRunning || this.state.phase !== 'TYPING') return;
    this.state.deal = this.dealToConnected();
    this.state.nextReshuffleAt = Date.now() + this.state.reshuffleSeconds * 1000;
    this.logAction('reshuffle', { roundIndex: this.state.currentRound, cursor: this.state.cursor });
    this.sendDeal('reshuffle');
    this.scheduleReshuffleWarning();
  }

  /** Send the deal: each player their own letters, the table the counts, spectators every letter. */
  private sendDeal(reason: 'round' | 'reshuffle' | 'redeal'): void {
    const counts = letterCounts(this.state.deal);
    for (const userId of this.state.participants) {
      this.context.sendToPlayer(userId, EVENT, {
        type: 'HK_DEAL',
        reason,
        letters: [...(this.state.deal.get(userId) ?? [])],
        counts,
        nextReshuffleAt: this.state.nextReshuffleAt,
      });
    }
    this.context.sendToSpectators(EVENT, {
      type: 'HK_DEAL',
      reason,
      deal: this.dealRecord(),
      counts,
      nextReshuffleAt: this.state.nextReshuffleAt,
    });
  }

  // ─── Input Handling ──────────────────────────────────────────

  /**
   * `press` ({ key }). A press outside TYPING, while paused, from someone not in
   * the match, with a key outside a-z, or past the rate limit is ignored.
   */
  handleInput(userId: string, action: string, data: unknown): void {
    if (!this.isRunning || !this.state) return;
    if (action !== 'press' && action !== 'input') return;
    if (this.state.phase !== 'TYPING' || this.state.complete || this.isPhaseTimerPaused) return;
    if (!this.state.participants.has(userId)) return;

    const parsed = PressInputSchema.safeParse(data);
    if (!parsed.success) return;
    const { key } = parsed.data;

    // More than five presses a second from one player are dropped
    const now = Date.now();
    const times = pruneTimes(this.state.pressTimes.get(userId) ?? [], now, HK_RATE_WINDOW_MS);
    if (times.length >= HK_INPUT_RATE_LIMIT) {
      this.state.pressTimes.set(userId, times);
      return;
    }
    times.push(now);
    this.state.pressTimes.set(userId, times);

    // The table is locked after a wrong letter
    if (now < this.state.lockedUntil) return;

    const sentence = this.state.sentences[this.state.currentRound]!;
    const verdict = judgePress(sentence.text, this.state.cursor, key, this.state.deal.get(userId) ?? []);

    switch (verdict) {
      case 'done':
      case 'spacing':
        return;
      case 'not_yours':
        this.state.totalNotYours.set(userId, (this.state.totalNotYours.get(userId) ?? 0) + 1);
        // Only the presser hears this
        this.context.sendToPlayer(userId, EVENT, { type: 'HK_KEY_NOT_YOURS', key });
        return;
      case 'wrong':
        this.state.wrong.set(userId, (this.state.wrong.get(userId) ?? 0) + 1);
        this.state.lockedUntil = now + HK_WRONG_KEY_LOCK_MS;
        this.context.sendToPlayer(userId, EVENT, { type: 'HK_KEY_WRONG', key });
        this.broadcastGameAction({ type: 'HK_LOCK', presserId: userId, until: this.state.lockedUntil });
        return;
      case 'correct':
        this.state.correct.set(userId, (this.state.correct.get(userId) ?? 0) + 1);
        this.state.cursor++;
        // One small broadcast per press: the cursor and who pressed
        this.broadcastGameAction({ type: 'HK_PRESS', cursor: this.state.cursor, presserId: userId });
        if (this.state.cursor >= sentence.text.length) {
          this.state.complete = true;
          this.endRound(true);
        } else if (sentence.text[this.state.cursor] === ' ') {
          this.scheduleSpace();
        }
        return;
    }
  }

  /** A space has no holder: the cursor steps over it by itself after a short wait. */
  private scheduleSpace(): void {
    this.clearTrackedTimeout(this.spaceHandle);
    this.spaceHandle = this.setTimeout(() => {
      this.spaceHandle = null;
      if (!this.isRunning || this.state.phase !== 'TYPING' || this.state.complete) return;
      const text = this.state.sentences[this.state.currentRound]!.text;
      if (text[this.state.cursor] !== ' ') return;
      this.state.cursor = nextLetterIndex(text, this.state.cursor);
      this.broadcastGameAction({ type: 'HK_PRESS', cursor: this.state.cursor, presserId: null });
    }, HK_SPACE_DELAY_MS);
  }

  // ─── Round End ───────────────────────────────────────────────

  private endRound(completed: boolean): void {
    if (!this.isRunning) return;
    // Phase guard: a late timer cannot end a round twice
    if (this.state.phase !== 'TYPING') return;

    const now = Date.now();
    const limitMs = HK_TYPING_SECONDS * 1000;
    const msLeft = Math.max(0, this.state.phaseEndsAt - now);
    const elapsedMs = completed ? Math.min(limitMs, limitMs - msLeft) : limitMs;
    const secondsLeft = completed ? Math.floor(msLeft / 1000) : 0;

    this.clearRoundTimers();
    this.clearPhaseTimer();

    const round = this.state.currentRound;
    const sentence = this.state.sentences[round]!;
    const scored = scoreRound({
      players: Array.from(this.state.participants).map((userId) => ({
        userId,
        correct: this.state.correct.get(userId) ?? 0,
        wrong: this.state.wrong.get(userId) ?? 0,
      })),
      completed,
      secondsLeft,
      elapsedMs,
      limitMs,
    });

    const results: HKPlayerRoundResult[] = scored.players.map((p) => {
      const total = (this.state.scores.get(p.userId) ?? 0) + p.points;
      this.state.scores.set(p.userId, total);
      this.state.totalCorrect.set(p.userId, (this.state.totalCorrect.get(p.userId) ?? 0) + p.correct);
      this.state.totalWrong.set(p.userId, (this.state.totalWrong.get(p.userId) ?? 0) + p.wrong);
      return {
        userId: p.userId,
        userName: this.context.players.get(p.userId)?.userName ?? 'Unknown',
        correct: p.correct,
        wrong: p.wrong,
        points: p.points,
        perfect: p.perfect,
        mvp: p.mvp,
        newTotalScore: total,
      };
    });
    results.sort((a, b) => b.points - a.points || a.userName.localeCompare(b.userName));

    const result: HKRoundResult = {
      roundIndex: round,
      sentenceId: sentence.id,
      sentence: sentence.text,
      completed,
      elapsedMs,
      secondsLeft,
      multiplier: scored.multiplier,
      results,
    };
    this.state.results.push(result);

    this.state.phase = 'ROUND_RESULT';
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + HK_RESULT_SECONDS * 1000;
    this.state.nextReshuffleAt = 0;

    this.logAction('round_result', {
      roundIndex: round,
      sentenceId: sentence.id,
      sentence: sentence.text,
      completed,
      elapsedMs,
      multiplier: scored.multiplier,
      results: results.map((r) => ({ ...r })),
    });

    logger.info({ event: 'human_keyboard:round_result', lobbyId: this.context.lobbyId, roundIndex: round, completed });

    this.broadcastGameAction({ type: 'HK_RESULT', ...result, duration: HK_RESULT_SECONDS });
    this.broadcastGameAction({ type: 'HK_SCORE_UPDATE', scores: this.scoresRecord() });

    const over = this.state.results.length >= this.state.totalRounds;
    this.startPhaseTimer(HK_RESULT_SECONDS);
    this.schedulePhase(() => (over ? this.endGame() : this.startNextRound()), HK_RESULT_SECONDS * 1000);
  }

  // ─── State Masking ───────────────────────────────────────────

  /** The part of the state every viewer may see, built field by field. */
  private baseState(): Record<string, unknown> {
    const timer = this.getPhaseTimerSnapshot();
    const fallback = Math.max(0, Math.ceil((this.state.phaseEndsAt - Date.now()) / 1000));
    const lastResult = this.state.results[this.state.results.length - 1] ?? null;
    const sentence = this.state.sentences[this.state.currentRound];

    return {
      phase: this.state.phase,
      currentRoundIndex: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      // The current sentence is public from its reveal; later ones stay here
      sentence: sentence ? sentence.text : '',
      cursor: this.state.cursor,
      complete: this.state.complete,
      lockedUntil: this.state.lockedUntil,
      // How many letters each player holds, never which
      counts: letterCounts(this.state.deal),
      scores: this.scoresRecord(),
      phaseStartedAt: this.state.phaseStartedAt,
      phaseEndsAt: this.state.phaseEndsAt,
      nextReshuffleAt: this.state.nextReshuffleAt,
      timeRemaining: timer && !timer.infinite ? timer.remaining : fallback,
      paused: this.isPhaseTimerPaused,
      // Present only once the round has ended
      result: this.state.phase === 'ROUND_RESULT' ? lastResult : null,
    };
  }

  getStateForPlayer(userId: string): unknown {
    // A pack is still loading (the deal waits on it): a snapshot asked for now has no phase, which the client ignores;
    // the deal's own snapshot follows.
    if (!this.state) return {};
    return {
      ...this.baseState(),
      myLetters: [...(this.state.deal.get(userId) ?? [])],
      imIn: this.state.participants.has(userId),
      deal: null,
    };
  }

  getStateForSpectator(): unknown {
    if (!this.state) return {};
    return { ...this.baseState(), myLetters: [], imIn: false, deal: this.dealRecord() };
  }

  // ─── Pause ───────────────────────────────────────────────────

  pausePhaseTimer(): void {
    if (!this.isPhaseTimerPaused) this.pausedAt = Date.now();
    super.pausePhaseTimer();
  }

  /** Time spent paused is not the table's: the phase end, the next reshuffle and a lock move with it. */
  resumePhaseTimer(): void {
    if (this.isPhaseTimerPaused && this.pausedAt > 0 && this.state) {
      const paused = Date.now() - this.pausedAt;
      this.state.phaseEndsAt += paused;
      if (this.state.nextReshuffleAt > 0) this.state.nextReshuffleAt += paused;
      if (this.state.lockedUntil > 0) this.state.lockedUntil += paused;
    }
    this.pausedAt = 0;
    super.resumePhaseTimer();
  }

  // ─── Reconnection / Disconnect ───────────────────────────────

  /**
   * A dropped player's letters would stall the sentence, so after a grace they
   * go to the players still connected. The cursor does not move.
   */
  handlePlayerDisconnect(userId: string): void {
    if (!this.isRunning || !this.state) return;
    if (!this.state.participants.has(userId) || this.redealHandles.has(userId)) return;
    const handle = this.setTimeout(() => {
      this.redealHandles.delete(userId);
      if (!this.isRunning) return;
      if (this.state.phase === 'ROUND_RESULT') return;
      if (this.context.players.get(userId)?.isConnected) return;
      const staying = this.connectedIds();
      if (staying.length === 0) return;
      this.state.deal = redistributeLetters(this.state.deal, [userId], staying);
      this.logAction('redeal', { roundIndex: this.state.currentRound, userId });
      this.sendDeal('redeal');
    }, HK_REDEAL_GRACE_MS);
    this.redealHandles.set(userId, handle);
  }

  /** Back before the grace ran out: nothing changed. Later: the letters come back at the next reshuffle. */
  handlePlayerReconnect(userId: string): void {
    const handle = this.redealHandles.get(userId);
    if (handle) this.clearTrackedTimeout(handle);
    this.redealHandles.delete(userId);
  }

  // ─── Results & Awards ────────────────────────────────────────

  computeResults(): MinigameResults {
    // Ended (a host skip) while a pack was still loading: nobody played, so nobody placed.
    if (!this.state) return { rankings: [], awards: [], gameSpecificData: {}, duration: Date.now() - this.startedAt };
    return {
      rankings: this.computeRankings(),
      awards: this.computeAwards(),
      gameSpecificData: {
        totalRounds: this.state.totalRounds,
        roundHistory: this.state.results,
        gameLog: this.buildGameLog(),
      },
      duration: Date.now() - this.startedAt,
    };
  }

  private computeRankings(): PlayerRanking[] {
    const entries = Array.from(this.context.players.entries()).map(([userId, player]) => {
      const deltas: Record<string, number> = {};
      for (const result of this.state.results) {
        const mine = result.results.find((r) => r.userId === userId);
        deltas[`round_${result.roundIndex + 1}`] = mine?.points ?? 0;
      }
      return { userId, userName: player.userName, score: this.state.scores.get(userId) ?? 0, deltas };
    });
    entries.sort((a, b) => b.score - a.score);
    return ranksWithTies(entries);
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];
    const ids = Array.from(this.context.players.keys());
    const correct = (id: string) => this.state.totalCorrect.get(id) ?? 0;
    const wrong = (id: string) => this.state.totalWrong.get(id) ?? 0;

    const mostCorrect = Math.max(0, ...ids.map(correct));
    if (mostCorrect > 0) {
      for (const id of ids.filter((i) => correct(i) === mostCorrect)) {
        awards.push({
          userId: id,
          title: 'MVP Typist',
          description: `${mostCorrect} correct presses`,
          icon: 'crown',
        });
      }
    }
    for (const id of ids.filter((i) => correct(i) > 0 && wrong(i) === 0)) {
      awards.push({
        userId: id,
        title: 'Perfect Fingers',
        description: 'No wrong key all game',
        icon: 'check-circle',
      });
    }
    const mostWrong = Math.max(0, ...ids.map(wrong));
    if (mostWrong > 0) {
      for (const id of ids.filter((i) => wrong(i) === mostWrong)) {
        awards.push({
          userId: id,
          title: 'Butterfingers',
          description: `${mostWrong} wrong presses`,
          icon: 'x-circle',
        });
      }
    }
    const notYours = (id: string) => this.state.totalNotYours.get(id) ?? 0;
    const mostNotYours = Math.max(0, ...ids.map(notYours));
    if (mostNotYours > 0) {
      for (const id of ids.filter((i) => notYours(i) === mostNotYours)) {
        awards.push({
          userId: id,
          title: 'Not My Job',
          description: `${mostNotYours} presses of letters someone else held`,
          icon: 'user-x',
        });
      }
    }
    if (this.state.results.length > 0 && this.state.results.every((r) => r.completed)) {
      for (const id of ids) {
        awards.push({
          userId: id,
          title: 'Team Spirit',
          description: 'The table finished every sentence',
          icon: 'users',
        });
      }
    }
    return awards;
  }

  // ─── Game Log ────────────────────────────────────────────────

  private logAction(type: string, payload: Record<string, unknown>): void {
    this.actionLog.push({ seq: this.actionLog.length + 1, type, payload, timestamp: Date.now() });
  }

  private buildGameLog(): Record<string, unknown> {
    const ranked = this.computeRankings();
    return {
      minigameId: 'human-keyboard',
      version: GAME_LOG_VERSION,
      lobbyId: this.context.lobbyId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      players: Array.from(this.context.players.entries()).map(([userId, p]) => ({
        userId,
        userName: p.userName,
      })),
      initialState: { ...this.settingsUsed },
      actions: this.actionLog,
      finalResults: ranked.map((r) => ({ userId: r.userId, userName: r.userName, score: r.score, rank: r.rank })),
    };
  }

  // ─── End Game ────────────────────────────────────────────────

  private endGame(): void {
    if (!this.isRunning) return;
    logger.info({
      event: 'human_keyboard:game_end',
      lobbyId: this.context.lobbyId,
      roundsPlayed: this.state.results.length,
    });
    this.cleanup();
    this.context.onComplete(this.computeResults());
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private scoresRecord(): Record<string, number> {
    const scores: Record<string, number> = {};
    for (const [uid, score] of this.state.scores) scores[uid] = score;
    return scores;
  }

  private dealRecord(): Record<string, string[]> {
    const deal: Record<string, string[]> = {};
    for (const [uid, letters] of this.state.deal) deal[uid] = [...letters];
    return deal;
  }

  /** A fresh deal among the connected players; a player who is not connected holds no letters but stays in the table. */
  private dealToConnected(): Map<string, string[]> {
    const deal = dealLetters(this.connectedIds());
    for (const userId of this.state.participants) if (!deal.has(userId)) deal.set(userId, []);
    return deal;
  }

  /** Players in the match who are connected now; everyone when nobody is. */
  private connectedIds(): string[] {
    const all = Array.from(this.state.participants);
    const connected = all.filter((id) => this.context.players.get(id)?.isConnected);
    return connected.length > 0 ? connected : all;
  }
}
