/**
 * RMHbox — Identity Crisis Minigame Server Handler
 *
 * Every player is dealt a well-known person or character. Everyone can see
 * everybody else's, never their own. In a random order each player gets
 * `questionsPerPlayer` turns: on a turn the asker types one yes-or-no question
 * about themselves, the rest of the table votes yes / no / maybe at once, and
 * the result is the three counts and the plurality ("split" on a tie), never
 * who voted what. A guess can be sent early (right: 200 + up to 300 by how many
 * question slots are left, and the player stops asking; wrong: -100, no more
 * questions) and once more in the final phase (right: 200, no bonus).
 * 20 points for every question slot a correct guesser did not use.
 *
 *   ASSIGN -> ( ASK -> VOTE -> RESULT )* -> FINAL -> REVEAL -> end
 *
 * Secrecy. The server holds every identity in `state.players`. A player's
 * state, and every event sent to a player, is built from an allowlist of
 * fields (`othersView`, `baseState`): a player's own identity is not among
 * them in any play phase, a reconnect included. `IC_TURN_START` carries the
 * asker's identity and goes to everyone but the asker, who gets
 * `IC_TURN_START_SELF` without it. A guess's text reaches nobody but the
 * guesser (and spectators); the others learn only that it was right or wrong.
 * Individual votes are kept only until the vote closes: they are never sent
 * (a voter is told their own vote) and never logged. The identities are shown
 * to everybody in the REVEAL phase, once nothing is left to guess.
 *
 * `onAsk` is the one place a question's text enters, so a member restriction
 * (feature 17) can guard it without restructuring.
 *
 * Join-in-progress policy: spectate_only.
 */

import Fuse from 'fuse.js';
import { BaseMinigame } from '../base-minigame';
import type { MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import { AskInputSchema, GuessInputSchema, VoteInputSchema } from '@/lib/rmhbox/identity-crisis/schemas';
import type { Vote } from '@/lib/rmhbox/identity-crisis/schemas';
import {
  EARLY_WRONG_POINTS,
  FINAL_CORRECT_POINTS,
  cleanQuestion,
  drawIdentities,
  earlyCorrectPoints,
  efficiencyPoints,
  judgeGuess,
  normalizeForMatch,
  plurality,
  seatAt,
  tally,
  turnOrder,
} from '@/lib/rmhbox/identity-crisis/rules';
import type { GuessMatcher, Identity } from '@/lib/rmhbox/identity-crisis/rules';
import {
  IC_ASSIGN_SECONDS,
  IC_DEFAULT_ASK_SECONDS,
  IC_DEFAULT_QUESTIONS_PER_PLAYER,
  IC_FINAL_SECONDS,
  IC_GUESS_MATCH_THRESHOLD,
  IC_RESULT_SECONDS,
  IC_REVEAL_SECONDS,
  IC_VOTE_SECONDS,
} from '@/lib/rmhbox/identity-crisis/settings';
import { loadIdentities } from '@/lib/rmhbox/identity-crisis/data-loader';
import { S2C } from '@/lib/rmhbox/events';
import { loadMessageRestriction, peekMessageRestriction } from '../../restrictions';
import { restrictedChatError } from '../../../shared/member-restrictions';
import { ranksWithTies } from '@/lib/rmhbox/ranking-file/scoring';
import { logger } from '../../logger';
import type {
  GameLogAction,
  ICGuess,
  ICGuessKind,
  ICPhase,
  ICPlayerRecord,
  ICQuestion,
  IdentityCrisisState,
} from './types';

/** Shape version of the stored game log (see GameLog in the history registry). */
const GAME_LOG_VERSION = 1;
const ACTION_EVENT = 'rmhbox:game:action';

// ─── The guess matcher (fuse.js, server only) ────────────────────

const fuseByIdentity = new Map<string, Fuse<{ names: string[] }>>();

/** Fuzzy match against the name and every alias; the text arrives normalised. */
export const fuseMatcher: GuessMatcher = (normalizedGuess, identity) => {
  let fuse = fuseByIdentity.get(identity.id);
  if (!fuse) {
    const names = [identity.name, ...identity.aliases].map(normalizeForMatch).filter(Boolean);
    fuse = new Fuse([{ names }], { keys: ['names'], threshold: IC_GUESS_MATCH_THRESHOLD, ignoreLocation: true });
    fuseByIdentity.set(identity.id, fuse);
  }
  return fuse.search(normalizedGuess).length > 0;
};

// ─── Views ───────────────────────────────────────────────────────

interface IdentityView {
  name: string;
  category: string;
}

function identityView(identity: Identity): IdentityView {
  return { name: identity.name, category: identity.category };
}

/** The reveal's outcome for one player. */
type Outcome = 'early' | 'final' | 'missed';

export class IdentityCrisisGame extends BaseMinigame {
  private state!: IdentityCrisisState;
  private startedAt = 0;
  private actionLog: GameLogAction[] = [];
  private phaseHandle: NodeJS.Timeout | null = null;
  private settingsUsed: Record<string, unknown> = {};
  private pausedAt = 0;
  private matcher: GuessMatcher = fuseMatcher;

  /** Players are on unequal footing (own identity hidden), so spectators get the one omniscient view. */
  get spectatorMode(): 'shared-privileged' {
    return 'shared-privileged';
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();

    const questionsPerPlayer = this.getSetting('questionsPerPlayer', IC_DEFAULT_QUESTIONS_PER_PLAYER);
    const askSeconds = this.getSetting('askSeconds', IC_DEFAULT_ASK_SECONDS);
    const hardIdentities = this.getSetting<boolean>('hardIdentities', false);
    // From the lobby's own match history: nothing is kept here, so nothing can leak.
    const gameNumber = (this.context.priorGamesOfThisMinigame ?? 0) + 1;

    const participants = [...this.context.players.keys()];
    const identities = drawIdentities(loadIdentities(), participants, { gameNumber, hardIdentities });
    if (identities.length < participants.length) {
      this.isRunning = false;
      this.context.onError(new Error('identity-crisis: not enough identities for the lobby'));
      return;
    }

    const players = new Map<string, ICPlayerRecord>();
    const scores = new Map<string, number>();
    participants.forEach((userId, i) => {
      players.set(userId, { identity: identities[i]!, status: 'asking', slotsUsed: 0, guesses: [] });
      scores.set(userId, 0);
    });
    const order = turnOrder(participants);

    this.settingsUsed = { questionsPerPlayer, askSeconds, hardIdentities, gameNumber };
    const now = Date.now();
    this.state = {
      phase: 'ASSIGN',
      questionsPerPlayer,
      askSeconds,
      hardIdentities,
      gameNumber,
      participants,
      order,
      players,
      cursor: 0,
      totalSlots: order.length * questionsPerPlayer,
      turnNumber: 0,
      askerId: null,
      current: null,
      questions: [],
      timedOutTurns: [],
      finalists: new Set(),
      finalGuessed: new Set(),
      solvedOrder: [],
      scores,
      phaseStartedAt: now,
      phaseEndsAt: now + IC_ASSIGN_SECONDS * 1000,
    };

    logger.info({
      event: 'identity_crisis:start',
      lobbyId: this.context.lobbyId,
      playerCount: participants.length,
      questionsPerPlayer,
      gameNumber,
    });

    this.broadcastRound(0, this.state.totalSlots);
    this.emitPerViewer((viewerId) => ({
      type: 'IC_ASSIGN',
      order,
      questionsPerPlayer,
      totalSlots: this.state.totalSlots,
      duration: IC_ASSIGN_SECONDS,
      others: this.othersView(viewerId),
    }));
    this.startPhaseTimer(IC_ASSIGN_SECONDS);
    this.schedulePhase(() => this.nextTurn(), IC_ASSIGN_SECONDS * 1000);
  }

  // ─── Phase plumbing ──────────────────────────────────────────

  private schedulePhase(callback: () => void, delayMs: number): void {
    this.clearTrackedTimeout(this.phaseHandle);
    this.phaseHandle = this.setTimeout(callback, delayMs);
  }

  private enterPhase(phase: ICPhase, seconds: number): void {
    const now = Date.now();
    this.state.phase = phase;
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + seconds * 1000;
  }

  private setScore(userId: string, delta: number): number {
    const total = (this.state.scores.get(userId) ?? 0) + delta;
    this.state.scores.set(userId, total);
    return total;
  }

  private isConnected(userId: string): boolean {
    return this.context.players.get(userId)?.isConnected !== false;
  }

  private nameOf(userId: string): string {
    return this.context.players.get(userId)?.userName ?? 'Unknown';
  }

  // ─── Turn flow ───────────────────────────────────────────────

  /** Start the next turn that has an asker, or move on to the final guess. */
  private nextTurn(): void {
    if (!this.isRunning || this.state.phase === 'REVEAL') return;
    this.state.askerId = null;
    if (this.allSolved()) {
      this.startReveal();
      return;
    }
    while (this.state.cursor < this.state.totalSlots) {
      const userId = seatAt(this.state.order, this.state.cursor)!;
      this.state.cursor++;
      const record = this.state.players.get(userId);
      if (record?.status === 'asking' && this.isConnected(userId)) {
        this.startAsk(userId);
        return;
      }
    }
    this.startFinal();
  }

  private startAsk(userId: string): void {
    const seconds = this.state.askSeconds;
    this.state.turnNumber++;
    this.state.askerId = userId;
    this.state.current = null;
    this.enterPhase('ASK', seconds);

    this.broadcastRound(this.state.cursor, this.state.totalSlots);
    const record = this.state.players.get(userId)!;
    const slotsLeft = this.state.questionsPerPlayer - record.slotsUsed;
    const identity = identityView(record.identity);
    // The asker never gets their identity; everyone else does, so the voters can answer truthfully.
    this.emitPerViewer((viewerId) => ({
      type: viewerId === userId ? 'IC_TURN_START_SELF' : 'IC_TURN_START',
      turnNumber: this.state.turnNumber,
      totalSlots: this.state.totalSlots,
      askerId: userId,
      askerName: this.nameOf(userId),
      slotsLeft,
      duration: seconds,
      ...(viewerId === userId ? {} : { askerIdentity: identity }),
    }));
    this.startPhaseTimer(seconds);
    this.schedulePhase(() => this.askTimedOut(), seconds * 1000);
  }

  /** The turn ran out with no question: it is skipped, and the slot is spent. */
  private askTimedOut(): void {
    if (!this.isRunning || this.state.phase !== 'ASK' || !this.state.askerId) return;
    const askerId = this.state.askerId;
    const record = this.state.players.get(askerId);
    if (record) record.slotsUsed++;
    this.state.timedOutTurns.push({ turnNumber: this.state.turnNumber, askerId });
    this.logAction('ask_timeout', { turnNumber: this.state.turnNumber, askerId });
    this.broadcastGameAction({ type: 'IC_ASK_TIMEOUT', turnNumber: this.state.turnNumber, askerId });
    this.clearPhaseTimer();
    this.nextTurn();
  }

  private closeVote(): void {
    if (!this.isRunning || this.state.phase !== 'VOTE' || !this.state.current) return;
    const question = this.state.current;
    this.clearTrackedTimeout(this.phaseHandle);
    this.phaseHandle = null;
    this.clearPhaseTimer();

    question.counts = tally(question.votes.values());
    question.plurality = plurality(question.counts);
    this.state.questions.push(question);
    this.enterPhase('RESULT', IC_RESULT_SECONDS);

    // The counts and the plurality; the Map of who voted what stays here.
    this.logAction('vote_result', {
      turnNumber: question.turnNumber,
      askerId: question.askerId,
      counts: question.counts,
      plurality: question.plurality,
    });
    this.broadcastGameAction({
      type: 'IC_VOTE_RESULT',
      turnNumber: question.turnNumber,
      askerId: question.askerId,
      counts: question.counts,
      plurality: question.plurality,
      duration: IC_RESULT_SECONDS,
    });
    this.startPhaseTimer(IC_RESULT_SECONDS);
    this.schedulePhase(() => this.nextTurn(), IC_RESULT_SECONDS * 1000);
  }

  private startFinal(): void {
    if (!this.isRunning) return;
    for (const [userId, record] of this.state.players) {
      if (record.status !== 'solved') this.state.finalists.add(userId);
    }
    if (this.state.finalists.size === 0) {
      this.startReveal();
      return;
    }
    this.state.askerId = null;
    this.state.current = null;
    this.enterPhase('FINAL', IC_FINAL_SECONDS);
    this.broadcastGameAction({
      type: 'IC_FINAL_START',
      duration: IC_FINAL_SECONDS,
      finalists: [...this.state.finalists],
    });
    this.startPhaseTimer(IC_FINAL_SECONDS);
    this.schedulePhase(() => this.startReveal(), IC_FINAL_SECONDS * 1000);
    this.revealIfFinalDone();
  }

  private startReveal(): void {
    if (!this.isRunning || this.state.phase === 'REVEAL') return;
    this.clearTrackedTimeout(this.phaseHandle);
    this.phaseHandle = null;
    this.clearPhaseTimer();
    this.state.askerId = null;
    this.enterPhase('REVEAL', IC_REVEAL_SECONDS);

    // Nothing is left to guess: now every identity, one's own included, is shown.
    this.broadcastGameAction({
      type: 'IC_REVEAL',
      duration: IC_REVEAL_SECONDS,
      players: this.revealList(),
      scores: this.scoresRecord(),
    });
    this.startPhaseTimer(IC_REVEAL_SECONDS);
    this.schedulePhase(() => this.endGame(), IC_REVEAL_SECONDS * 1000);
  }

  // ─── Input handling ──────────────────────────────────────────

  /**
   * `ask` ({ text }), `vote` ({ vote }) and `guess` ({ text }). An input from
   * someone who is not playing, in the wrong phase, from the wrong player, or
   * a second vote, is ignored.
   */
  handleInput(userId: string, action: string, data: unknown): void {
    if (!this.isRunning || !this.state) return;
    if (!this.state.players.has(userId)) return;
    switch (action) {
      case 'ask':
        this.onAsk(userId, data);
        break;
      case 'vote':
        this.onVote(userId, data);
        break;
      case 'guess':
        this.onGuess(userId, data);
        break;
    }
  }

  /**
   * The asker's question. The only place question text enters the game.
   *
   * s14-17: a member a moderator timed out of messages and chats cannot put text in front of the table. Their ask is
   * ignored as a timed-out ask (the turn passes and the slot is spent) and only they are told. The timeout is read
   * from the hub's 30-second cache; with nothing cached the ask waits for one read, then runs the same checks again.
   */
  private onAsk(userId: string, data: unknown, afterRead = false): void {
    if (this.state.phase !== 'ASK' || this.state.askerId !== userId) return;
    const parsed = AskInputSchema.safeParse(data);
    if (!parsed.success) return;
    const text = cleanQuestion(parsed.data.text);
    if (text === null) return;

    const restricted = peekMessageRestriction(userId);
    if (restricted === undefined && !afterRead) {
      const turn = this.state.turnNumber;
      void loadMessageRestriction(userId).then(() => {
        if (this.isRunning && this.state && this.state.turnNumber === turn) this.onAsk(userId, data, true);
      });
      return;
    }
    if (restricted) {
      this.context.sendToPlayer(userId, S2C.ERROR, restrictedChatError());
      this.clearTrackedTimeout(this.phaseHandle);
      this.phaseHandle = null;
      this.askTimedOut();
      return;
    }

    const record = this.state.players.get(userId)!;
    record.slotsUsed++;
    const question: ICQuestion = {
      turnNumber: this.state.turnNumber,
      askerId: userId,
      text,
      voterIds: this.state.participants.filter((id) => id !== userId),
      votes: new Map(),
      counts: null,
      plurality: null,
    };
    this.state.current = question;
    this.clearTrackedTimeout(this.phaseHandle);
    this.phaseHandle = null;
    this.clearPhaseTimer();
    this.enterPhase('VOTE', IC_VOTE_SECONDS);

    this.logAction('question_asked', { turnNumber: question.turnNumber, askerId: userId, text });
    this.broadcastGameAction({
      type: 'IC_QUESTION',
      turnNumber: question.turnNumber,
      askerId: userId,
      text,
      totalVoters: question.voterIds.length,
      duration: IC_VOTE_SECONDS,
    });
    this.startPhaseTimer(IC_VOTE_SECONDS);
    this.schedulePhase(() => this.closeVote(), IC_VOTE_SECONDS * 1000);
    this.closeVoteIfComplete();
  }

  private onVote(userId: string, data: unknown): void {
    const question = this.state.current;
    if (this.state.phase !== 'VOTE' || !question) return;
    if (!question.voterIds.includes(userId) || question.votes.has(userId)) return;
    const parsed = VoteInputSchema.safeParse(data);
    if (!parsed.success) return;
    const vote: Vote = parsed.data.vote;

    question.votes.set(userId, vote);
    // The voter learns their own vote was taken; the table learns only how many are in.
    this.context.sendToPlayer(userId, ACTION_EVENT, { type: 'IC_VOTE_ACK', turnNumber: question.turnNumber, vote });
    this.broadcastGameAction({
      type: 'IC_VOTE_PROGRESS',
      turnNumber: question.turnNumber,
      received: question.votes.size,
      total: question.voterIds.length,
    });
    this.closeVoteIfComplete();
  }

  /** Close the vote early once every connected voter has voted (or none is connected). */
  private closeVoteIfComplete(): void {
    const question = this.state.current;
    if (this.state.phase !== 'VOTE' || !question) return;
    const waiting = question.voterIds.filter((id) => this.isConnected(id) && !question.votes.has(id));
    if (waiting.length === 0) this.closeVote();
  }

  /**
   * A guess. Early (during an ask or a vote): by a player still asking, but not
   * by the asker while the votes on their own question are open, so a guess
   * never races the answer it depends on. Final (in the final phase): once, by
   * a player not yet right.
   */
  private onGuess(userId: string, data: unknown): void {
    const record = this.state.players.get(userId)!;
    const phase = this.state.phase;
    let kind: ICGuessKind;
    if (phase === 'ASK' || phase === 'VOTE') {
      if (record.status !== 'asking') return;
      if (phase === 'VOTE' && this.state.askerId === userId) return;
      kind = 'early';
    } else if (phase === 'FINAL') {
      if (!this.state.finalists.has(userId) || this.state.finalGuessed.has(userId)) return;
      kind = 'final';
    } else {
      return;
    }

    const parsed = GuessInputSchema.safeParse(data);
    if (!parsed.success) return;
    const judged = judgeGuess(parsed.data.text, record.identity, this.matcher);
    if (!judged) return;

    const slotsLeft = Math.max(0, this.state.questionsPerPlayer - record.slotsUsed);
    let points: number;
    if (kind === 'early') {
      points = judged.correct
        ? earlyCorrectPoints(slotsLeft, this.state.questionsPerPlayer) + efficiencyPoints(slotsLeft)
        : EARLY_WRONG_POINTS;
      record.status = judged.correct ? 'solved' : 'stopped';
    } else {
      points = judged.correct ? FINAL_CORRECT_POINTS + efficiencyPoints(slotsLeft) : 0;
      this.state.finalGuessed.add(userId);
      if (judged.correct) record.status = 'solved';
    }
    if (judged.correct) this.state.solvedOrder.push(userId);

    const guess: ICGuess = {
      kind,
      text: judged.text,
      correct: judged.correct,
      points,
      turnNumber: kind === 'early' ? this.state.turnNumber : 0,
      slotsLeft,
    };
    record.guesses.push(guess);
    const total = this.setScore(userId, points);

    // The text goes into the log only after the match; it is never in a player's state.
    this.logAction('guess', {
      userId,
      kind,
      text: guess.text,
      correct: guess.correct,
      points,
      turnNumber: guess.turnNumber,
      slotsLeft,
    });
    logger.info({ event: 'identity_crisis:guess', lobbyId: this.context.lobbyId, kind, correct: judged.correct });

    // The guesser: how it went (an early guess's outcome is public; a final one is told to them alone).
    this.context.sendToPlayer(userId, ACTION_EVENT, {
      type: 'IC_GUESS_RESULT',
      kind,
      correct: guess.correct,
      points,
      newTotalScore: total,
    });
    // The others: that a guess was made, and for an early one whether it was right. Never the text.
    this.emitPerViewer((viewerId) => {
      if (viewerId === userId) return null;
      return {
        type: 'IC_PLAYER_GUESSED',
        userId,
        kind,
        ...(kind === 'early' ? { correct: guess.correct } : {}),
        status: record.status,
        // Spectators see what was guessed.
        ...(viewerId === null ? { text: guess.text, correct: guess.correct } : {}),
      };
    });
    this.broadcastGameAction({ type: 'IC_SCORE_UPDATE', scores: this.scoresRecord() });

    if (this.allSolved()) {
      this.startReveal();
      return;
    }
    if (kind === 'final') {
      this.revealIfFinalDone();
      return;
    }
    // An asker who guesses in their own ask phase gives the turn up.
    if (phase === 'ASK' && this.state.askerId === userId) {
      this.clearTrackedTimeout(this.phaseHandle);
      this.phaseHandle = null;
      this.clearPhaseTimer();
      this.nextTurn();
    }
  }

  private allSolved(): boolean {
    for (const record of this.state.players.values()) if (record.status !== 'solved') return false;
    return true;
  }

  /** End the final phase early once every connected finalist has guessed. */
  private revealIfFinalDone(): void {
    if (this.state.phase !== 'FINAL') return;
    const waiting = [...this.state.finalists].filter((id) => this.isConnected(id) && !this.state.finalGuessed.has(id));
    if (waiting.length === 0) this.startReveal();
  }

  // ─── State masking ───────────────────────────────────────────

  /** Everyone's identity but `viewerId`'s; a spectator (null) has none to leave out. */
  private othersView(viewerId: string | null): Array<{ userId: string; userName: string; identity: IdentityView }> {
    const out: Array<{ userId: string; userName: string; identity: IdentityView }> = [];
    for (const userId of this.state.participants) {
      if (userId === viewerId) continue;
      const record = this.state.players.get(userId)!;
      out.push({ userId, userName: this.nameOf(userId), identity: identityView(record.identity) });
    }
    return out;
  }

  private statusRecord(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [userId, record] of this.state.players) out[userId] = record.status;
    return out;
  }

  private slotsRecord(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [userId, record] of this.state.players) {
      out[userId] = Math.max(0, this.state.questionsPerPlayer - record.slotsUsed);
    }
    return out;
  }

  private history(): Array<Record<string, unknown>> {
    return this.state.questions.map((q) => ({
      turnNumber: q.turnNumber,
      askerId: q.askerId,
      askerName: this.nameOf(q.askerId),
      text: q.text,
      counts: q.counts,
      plurality: q.plurality,
    }));
  }

  /** The fields every viewer gets. Built field by field; nothing here is a copy of the full state. */
  private baseState(): Record<string, unknown> {
    const s = this.state;
    const timer = this.getPhaseTimerSnapshot();
    const fallback = Math.max(0, Math.ceil((s.phaseEndsAt - Date.now()) / 1000));
    const question = s.current;
    return {
      phase: s.phase,
      questionsPerPlayer: s.questionsPerPlayer,
      order: [...s.order],
      cursor: s.cursor,
      totalSlots: s.totalSlots,
      turnNumber: s.turnNumber,
      askerId: s.askerId,
      askerName: s.askerId ? this.nameOf(s.askerId) : null,
      question: question ? { turnNumber: question.turnNumber, askerId: question.askerId, text: question.text } : null,
      votesReceived: question ? question.votes.size : 0,
      totalVoters: question ? question.voterIds.length : 0,
      // The result of the question once its vote has closed; counts only
      result:
        s.phase === 'RESULT' && question?.counts ? { counts: question.counts, plurality: question.plurality } : null,
      questionHistory: this.history(),
      statuses: this.statusRecord(),
      slotsLeft: this.slotsRecord(),
      finalists: [...s.finalists],
      finalGuessedIds: [...s.finalGuessed],
      scores: this.scoresRecord(),
      phaseStartedAt: s.phaseStartedAt,
      phaseEndsAt: s.phaseEndsAt,
      timeRemaining: timer && !timer.infinite ? timer.remaining : fallback,
      paused: this.isPhaseTimerPaused,
    };
  }

  getStateForPlayer(userId: string): unknown {
    const s = this.state;
    const mine = s.players.get(userId);
    const question = s.current;
    const isAsker = s.askerId === userId;
    const showAsker =
      s.askerId !== null && !isAsker && (s.phase === 'ASK' || s.phase === 'VOTE' || s.phase === 'RESULT');
    const asker = showAsker ? s.players.get(s.askerId!) : undefined;
    return {
      ...this.baseState(),
      viewer: 'player',
      // Everyone's identity but the viewer's own, in every play phase
      others: this.othersView(userId),
      askerIdentity: asker ? identityView(asker.identity) : null,
      myStatus: mine?.status ?? null,
      myVote: question?.votes.get(userId) ?? null,
      myFinalGuessed: s.finalGuessed.has(userId),
      myGuesses: (mine?.guesses ?? []).map((g) => ({ kind: g.kind, correct: g.correct, points: g.points })),
      // At the reveal nothing is left to guess: the whole table, the viewer included
      reveal: s.phase === 'REVEAL' ? this.revealList() : null,
    };
  }

  getStateForSpectator(): unknown {
    const s = this.state;
    const question = s.current;
    const asker = s.askerId ? s.players.get(s.askerId) : undefined;
    return {
      ...this.baseState(),
      viewer: 'spectator',
      others: this.othersView(null),
      askerIdentity: asker ? identityView(asker.identity) : null,
      myStatus: null,
      myVote: null,
      myFinalGuessed: false,
      myGuesses: [],
      // Spectators see what was guessed, never who voted what
      guesses: this.guessList(),
      voteTotals: question ? { received: question.votes.size, total: question.voterIds.length } : null,
      reveal: s.phase === 'REVEAL' ? this.revealList() : null,
    };
  }

  private guessList(): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    for (const [userId, record] of this.state.players) {
      for (const g of record.guesses) {
        out.push({ userId, kind: g.kind, text: g.text, correct: g.correct, points: g.points });
      }
    }
    return out;
  }

  /** Per-viewer delivery: a player gets the payload built for them, spectators the payload for `null`. */
  private emitPerViewer(build: (viewerId: string | null) => Record<string, unknown> | null): void {
    for (const userId of this.context.players.keys()) {
      const payload = build(userId);
      if (payload) this.context.sendToPlayer(userId, ACTION_EVENT, payload);
    }
    const spectatorPayload = build(null);
    if (spectatorPayload) this.context.sendToSpectators(ACTION_EVENT, spectatorPayload);
  }

  // ─── Reveal ──────────────────────────────────────────────────

  private outcomeOf(record: ICPlayerRecord): Outcome {
    const right = record.guesses.find((g) => g.correct);
    return right ? (right.kind === 'early' ? 'early' : 'final') : 'missed';
  }

  private revealList(): Array<Record<string, unknown>> {
    return this.state.participants.map((userId) => {
      const record = this.state.players.get(userId)!;
      return {
        userId,
        userName: this.nameOf(userId),
        identity: identityView(record.identity),
        outcome: this.outcomeOf(record),
        points: record.guesses.reduce((sum, g) => sum + g.points, 0),
      };
    });
  }

  // ─── Pause ───────────────────────────────────────────────────

  pausePhaseTimer(): void {
    if (!this.isPhaseTimerPaused) this.pausedAt = Date.now();
    super.pausePhaseTimer();
  }

  /** Time spent paused is not the table's: the phase's end moves with it. */
  resumePhaseTimer(): void {
    if (this.isPhaseTimerPaused && this.pausedAt > 0 && this.state) {
      this.state.phaseEndsAt += Date.now() - this.pausedAt;
    }
    this.pausedAt = 0;
    super.resumePhaseTimer();
  }

  // ─── Reconnection / Disconnect ───────────────────────────────

  handlePlayerDisconnect(userId: string): void {
    if (!this.isRunning || !this.state) return;
    // A disconnected asker gives their turn up now rather than when the clock runs out
    if (this.state.phase === 'ASK' && this.state.askerId === userId) {
      this.clearTrackedTimeout(this.phaseHandle);
      this.phaseHandle = null;
      this.askTimedOut();
      return;
    }
    this.closeVoteIfComplete();
    this.revealIfFinalDone();
  }

  handlePlayerReconnect(userId: string): void {
    if (!this.state) return;
    this.context.sendToPlayer(userId, 'rmhbox:game:state_snapshot', this.getStateForPlayer(userId));
  }

  // ─── Results & Awards ────────────────────────────────────────

  computeResults(): MinigameResults {
    return {
      rankings: this.computeRankings(),
      awards: this.computeAwards(),
      gameSpecificData: {
        questionsAsked: this.state.questions.length,
        gameLog: this.buildGameLog(),
      },
      duration: Date.now() - this.startedAt,
    };
  }

  private computeRankings(): PlayerRanking[] {
    const entries = Array.from(this.context.players.entries()).map(([userId, player]) => {
      const record = this.state.players.get(userId);
      const deltas: Record<string, number> = {};
      for (const [i, g] of (record?.guesses ?? []).entries()) deltas[`guess_${i + 1}_${g.kind}`] = g.points;
      return { userId, userName: player.userName, score: this.state.scores.get(userId) ?? 0, deltas };
    });
    entries.sort((a, b) => b.score - a.score);
    return ranksWithTies(entries);
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];
    const first = this.state.solvedOrder[0];
    if (first) {
      awards.push({
        userId: first,
        title: 'Self-Aware',
        description: 'Worked out who they were first',
        icon: 'eye',
      });
    }

    // The asker with the most questions the table answered with a clear plurality
    const clear = new Map<string, number>();
    for (const q of this.state.questions) {
      if (q.plurality === 'yes' || q.plurality === 'no') clear.set(q.askerId, (clear.get(q.askerId) ?? 0) + 1);
    }
    let best: { userId: string; n: number } | null = null;
    for (const [userId, n] of clear) if (!best || n > best.n) best = { userId, n };
    if (best && best.n > 0) {
      awards.push({
        userId: best.userId,
        title: 'Philosopher',
        description: `${best.n} questions with a clear answer`,
        icon: 'brain',
      });
    }

    for (const [userId, record] of this.state.players) {
      if (record.guesses.some((g) => g.kind === 'early' && g.correct) && userId !== first) {
        awards.push({
          userId,
          title: 'Bold Move',
          description: 'Guessed right before the final round',
          icon: 'zap',
        });
        break;
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
    const reveal = this.state.participants.map((userId) => {
      const record = this.state.players.get(userId)!;
      return {
        userId,
        identity: record.identity.name,
        category: record.identity.category,
        outcome: this.outcomeOf(record),
        slotsUsed: record.slotsUsed,
      };
    });
    const actions = [
      ...this.actionLog,
      ...reveal.map((r, i) => ({
        seq: this.actionLog.length + 1 + i,
        type: 'identity_reveal',
        payload: r as Record<string, unknown>,
        timestamp: Date.now(),
      })),
    ];
    return {
      minigameId: 'identity-crisis',
      version: GAME_LOG_VERSION,
      lobbyId: this.context.lobbyId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      players: Array.from(this.context.players.entries()).map(([userId, p]) => ({
        userId,
        userName: p.userName,
      })),
      initialState: {
        ...this.settingsUsed,
        questionOrder: [...this.state.order],
        identityAssignments: this.state.participants.map((userId) => {
          const identity = this.state.players.get(userId)!.identity;
          return { userId, identity: identity.name, category: identity.category };
        }),
      },
      actions,
      finalResults: ranked.map((r) => ({ userId: r.userId, userName: r.userName, score: r.score, rank: r.rank })),
    };
  }

  // ─── End Game ────────────────────────────────────────────────

  private endGame(): void {
    if (!this.isRunning) return;
    logger.info({
      event: 'identity_crisis:game_end',
      lobbyId: this.context.lobbyId,
      questions: this.state.questions.length,
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
}
