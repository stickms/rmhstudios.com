/**
 * RMHbox — Vote Manager
 *
 * Handles minigame voting: candidate selection, vote casting,
 * tally broadcasting, and result determination.
 *
 * Reference: docs/rmhbox/design-spec/core.md §12
 * Implementation: docs/rmhbox/implementation/phase-3.md §1
 */

import { Server, Socket } from 'socket.io';
import { LobbyManager } from './lobby-manager';
import { GameCoordinator } from './game-coordinator';
import { logger } from './logger';
import { S2C } from '../../lib/rmhbox/events';
import { getEligibleMinigames } from '../../lib/rmhbox/minigame-registry';
import { VOTE_CANDIDATE_COUNT, VOTE_DURATION_SECONDS, MIN_PLAYERS } from '../../lib/rmhbox/constants';
import { validated, StartVoteSchema, CastVoteSchema, ForceSkipSchema } from './schemas';
import type { VoteCandidate, VoteStartedPayload, VoteCastPayload, VoteResultPayload } from '../../lib/rmhbox/types';

// ─── Active Vote State ───────────────────────────────────────────

interface ActiveVote {
  candidates: VoteCandidate[];
  votes: Map<string, string>;
  timer: ReturnType<typeof setTimeout>;
  startedAt: number;
  endsAt: number;
  /** Grace period timer set when all players have voted */
  graceTimer: ReturnType<typeof setTimeout> | null;
}

// ─── VoteManager ─────────────────────────────────────────────────

export class VoteManager {
  private readonly io: Server;
  private readonly lobbyManager: LobbyManager;
  private readonly gameCoordinator: GameCoordinator;
  private readonly activeVotes = new Map<string, ActiveVote>();

  constructor(io: Server, lobbyManager: LobbyManager, gameCoordinator: GameCoordinator) {
    this.io = io;
    this.lobbyManager = lobbyManager;
    this.gameCoordinator = gameCoordinator;
  }

  // ─── Connection Handler ──────────────────────────────────────

  handleConnection(socket: Socket): void {
    socket.on('rmhbox:game:start_vote', validated(socket, 'rmhbox:game:start_vote', StartVoteSchema, (s, d) => this.onStartVote(s, d)));
    socket.on('rmhbox:game:cast_vote', validated(socket, 'rmhbox:game:cast_vote', CastVoteSchema, (s, d) => this.onCastVote(s, d)));
    socket.on('rmhbox:game:force_skip', validated(socket, 'rmhbox:game:force_skip', ForceSkipSchema, (s, d) => this.forceSkip(s, d)));
  }

  // ─── Vote Initiation (§1.2) ──────────────────────────────────

  private onStartVote(socket: Socket, payload: { lobbyId: string }): void {
    const userId = socket.data.userId as string;
    const lobby = this.lobbyManager.getLobbyByUserId(userId);

    if (!lobby || lobby.id !== payload.lobbyId) {
      socket.emit(S2C.ERROR, { code: 'NOT_IN_LOBBY', message: 'You are not in this lobby.' });
      return;
    }

    if (lobby.hostUserId !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can start a vote.' });
      return;
    }

    if (lobby.state !== 'WAITING') {
      socket.emit(S2C.ERROR, { code: 'INVALID_STATE', message: 'Lobby must be in WAITING state to start a vote.' });
      return;
    }

    const playerCount = lobby.players.size;
    if (playerCount < MIN_PLAYERS) {
      socket.emit(S2C.ERROR, { code: 'NOT_ENOUGH_PLAYERS', message: `At least ${MIN_PLAYERS} players are required.` });
      return;
    }

    const eligible = getEligibleMinigames(playerCount);
    if (eligible.length === 0) {
      socket.emit(S2C.ERROR, { code: 'NO_ELIGIBLE_GAMES', message: 'No minigames available for this player count.' });
      return;
    }

    // Randomly select candidates (Fisher-Yates shuffle)
    const shuffled = [...eligible];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const selected = shuffled.slice(0, Math.min(VOTE_CANDIDATE_COUNT, shuffled.length));
    const candidates: VoteCandidate[] = selected.map((game) => ({
      minigameId: game.id,
      displayName: game.displayName,
      description: game.description,
      category: game.category,
      icon: game.icon,
      playerRange: `${game.minPlayers}–${game.maxPlayers}`,
    }));

    const now = Date.now();
    const endsAt = now + VOTE_DURATION_SECONDS * 1000;

    const timer = setTimeout(() => this.resolveVote(lobby.id), VOTE_DURATION_SECONDS * 1000);

    const activeVote: ActiveVote = {
      candidates,
      votes: new Map(),
      timer,
      startedAt: now,
      endsAt,
      graceTimer: null,
    };

    this.activeVotes.set(lobby.id, activeVote);
    lobby.state = 'VOTING';
    lobby.lastActivityAt = now;

    const voteStarted: VoteStartedPayload = {
      candidates,
      durationSeconds: VOTE_DURATION_SECONDS,
      endsAt,
    };

    this.io.to(`lobby:${lobby.id}`).emit(S2C.GAME_VOTE_STARTED, voteStarted);
    this.lobbyManager.broadcastAction(lobby.id, { type: 'STATE_CHANGED', payload: { state: 'VOTING' } });

    logger.info({ event: 'vote_started', lobbyId: lobby.id, userId, candidateCount: candidates.length });
  }

  // ─── Vote Casting (§1.3) ─────────────────────────────────────

  private onCastVote(socket: Socket, payload: { lobbyId: string; minigameId: string }): void {
    const userId = socket.data.userId as string;
    const lobby = this.lobbyManager.getLobbyByUserId(userId);

    if (!lobby || lobby.id !== payload.lobbyId) {
      socket.emit(S2C.ERROR, { code: 'NOT_IN_LOBBY', message: 'You are not in this lobby.' });
      return;
    }

    if (lobby.state !== 'VOTING') {
      socket.emit(S2C.ERROR, { code: 'INVALID_STATE', message: 'Lobby is not in VOTING state.' });
      return;
    }

    if (!lobby.players.has(userId)) {
      socket.emit(S2C.ERROR, { code: 'NOT_A_PLAYER', message: 'Only players can vote.' });
      return;
    }

    const activeVote = this.activeVotes.get(lobby.id);
    if (!activeVote) {
      socket.emit(S2C.ERROR, { code: 'NO_ACTIVE_VOTE', message: 'No active vote in this lobby.' });
      return;
    }

    const isValidCandidate = activeVote.candidates.some((c) => c.minigameId === payload.minigameId);
    if (!isValidCandidate) {
      socket.emit(S2C.ERROR, { code: 'INVALID_CANDIDATE', message: 'That minigame is not a vote candidate.' });
      return;
    }

    activeVote.votes.set(userId, payload.minigameId);

    const tallies = this.computeTallies(activeVote);
    const voteUpdate: VoteCastPayload = {
      userId,
      tallies,
      totalVoters: activeVote.votes.size,
      totalPlayers: lobby.players.size,
    };

    logger.info({ event: 'vote_cast', lobbyId: lobby.id, userId, minigameId: payload.minigameId });

    // If all players have voted, start/reset a grace period of min(5s, remaining time)
    // so players can still change their pick before the vote resolves
    if (activeVote.votes.size >= lobby.players.size) {
      // Always clear existing grace timer so it resets on each vote change
      if (activeVote.graceTimer) {
        clearTimeout(activeVote.graceTimer);
        activeVote.graceTimer = null;
      }

      const remainingMs = Math.max(0, activeVote.endsAt - Date.now());
      const graceMs = Math.min(5000, remainingMs);
      const newEndsAt = Date.now() + graceMs;
      logger.info({ event: 'all_votes_in_grace', lobbyId: lobby.id, graceMs });

      // Send the updated endsAt so clients can show the countdown
      voteUpdate.endsAt = newEndsAt;

      if (graceMs <= 0) {
        this.io.to(`lobby:${lobby.id}`).emit(S2C.GAME_VOTE_UPDATE, voteUpdate);
        // No time left — resolve now
        this.resolveVote(lobby.id);
        return;
      } else {
        activeVote.graceTimer = setTimeout(() => this.resolveVote(lobby.id), graceMs);
      }
    }

    this.io.to(`lobby:${lobby.id}`).emit(S2C.GAME_VOTE_UPDATE, voteUpdate);
  }

  // ─── Vote Resolution (§1.4) ──────────────────────────────────

  resolveVote(lobbyId: string): void {
    const activeVote = this.activeVotes.get(lobbyId);
    if (!activeVote) return;

    clearTimeout(activeVote.timer);
    if (activeVote.graceTimer) clearTimeout(activeVote.graceTimer);

    const tallies = this.computeTallies(activeVote);
    const winnerId = this.determineWinner(activeVote, tallies);
    const winner = activeVote.candidates.find((c) => c.minigameId === winnerId);

    const uniqueChoices = new Set(activeVote.votes.values()).size;
    const wasUnanimous = activeVote.votes.size >= MIN_PLAYERS && uniqueChoices === 1;

    const voteResult: VoteResultPayload = {
      winnerId,
      winnerName: winner?.displayName ?? winnerId,
      tallies,
      wasUnanimous,
    };

    this.io.to(`lobby:${lobbyId}`).emit(S2C.GAME_VOTE_RESULT, voteResult);
    this.activeVotes.delete(lobbyId);

    logger.info({ event: 'vote_resolved', lobbyId, winnerId, tallies });

    // Enter game settings phase (will skip to game flow if no settings schema)
    const lobby = this.lobbyManager.getLobby(lobbyId);
    if (lobby) {
      this.gameCoordinator.enterGameSettings(lobby, winnerId, 'post-vote');
    }
  }

  // ─── Host Force-Skip (§1.5) ──────────────────────────────────

  forceSkip(socket: Socket, payload: { lobbyId: string }): void {
    const userId = socket.data.userId as string;
    const lobby = this.lobbyManager.getLobbyByUserId(userId);

    if (!lobby || lobby.id !== payload.lobbyId) {
      socket.emit(S2C.ERROR, { code: 'NOT_IN_LOBBY', message: 'You are not in this lobby.' });
      return;
    }

    if (lobby.hostUserId !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can force-skip.' });
      return;
    }

    if (lobby.state !== 'VOTING') {
      // Not in VOTING — other states are handled by GameCoordinator
      // which also listens on this event. Silently return.
      return;
    }

    logger.info({ event: 'vote_force_skipped', lobbyId: lobby.id, userId });
    this.resolveVote(lobby.id);
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private computeTallies(activeVote: ActiveVote): Record<string, number> {
    const tallies: Record<string, number> = {};
    for (const candidate of activeVote.candidates) {
      tallies[candidate.minigameId] = 0;
    }
    for (const minigameId of activeVote.votes.values()) {
      tallies[minigameId] = (tallies[minigameId] ?? 0) + 1;
    }
    return tallies;
  }

  private determineWinner(activeVote: ActiveVote, tallies: Record<string, number>): string {
    // If no votes cast, pick a random candidate
    if (activeVote.votes.size === 0) {
      const idx = Math.floor(Math.random() * activeVote.candidates.length);
      return activeVote.candidates[idx].minigameId;
    }

    // Find the max vote count
    const maxCount = Math.max(...Object.values(tallies));
    const tied = Object.entries(tallies)
      .filter(([, count]) => count === maxCount)
      .map(([id]) => id);

    // Break ties randomly
    if (tied.length === 1) return tied[0];
    return tied[Math.floor(Math.random() * tied.length)];
  }
}
