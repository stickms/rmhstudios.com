/**
 * RMHbox — State Synchronization Service
 *
 * Manages heartbeat broadcasting, phase transition sync,
 * action sequence counters, and timer tick broadcasting.
 *
 * Responsibilities:
 * - Periodic heartbeat: sends full state snapshots to all in-game clients
 * - Phase transition sync: immediate full sync on lobby state changes
 * - Timer tick broadcasting: 1-second countdown ticks for timed phases
 *
 * Reference: docs/rmhbox/design-spec/core.md §8, §22
 * Implementation: docs/rmhbox/implementation/phase-3.md §3
 */

import { Server } from 'socket.io';
import { config } from './config';
import { LobbyManager } from './lobby-manager';
import { S2C } from '../../lib/rmhbox/events';
import type { RMHboxLobby } from './types';
import type { ClientLobbyState } from '../../lib/rmhbox/types';

/** Handle returned by startTimerBroadcast for cancel / pause / resume control. */
export interface TimerHandle {
  cancel: () => void;
  pause: () => void;
  resume: () => void;
  readonly isPaused: boolean;
}

export class StateSyncService {
  private readonly io: Server;
  private readonly lobbyManager: LobbyManager;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(io: Server, lobbyManager: LobbyManager) {
    this.io = io;
    this.lobbyManager = lobbyManager;
  }

  // ─── Heartbeat (§3.2) ─────────────────────────────────────────

  startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => this.tick(), config.HEARTBEAT_INTERVAL_MS);
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Heartbeat tick: sends per-player scoped state snapshots
   * to all connected members during active gameplay.
   */
  private tick(): void {
    for (const lobby of this.lobbyManager.getLobbies().values()) {
      if (lobby.state !== 'PLAYING') continue;
      this.sendFullSyncToAll(lobby);
    }
  }

  // ─── Phase Transition Sync (§3.3) ─────────────────────────────

  /**
   * Send a full ClientLobbyState snapshot to every connected member.
   * Called on every lobby state transition to ensure all clients
   * are fully synchronized at phase boundaries.
   */
  broadcastFullSync(lobbyId: string): void {
    const lobby = this.lobbyManager.getLobby(lobbyId);
    if (!lobby) return;
    this.sendFullSyncToAll(lobby);
  }

  /**
   * Build a client-safe state snapshot for a specific user.
   * Delegates to LobbyManager.buildClientState() which is the
   * ONLY exit point for state data — it strips internal fields
   * and scopes minigame state per player role.
   */
  buildClientState(lobby: RMHboxLobby, userId: string): ClientLobbyState {
    return this.lobbyManager.buildClientState(lobby, userId);
  }

  // ─── Timer Tick Broadcasting (§3.5) ────────────────────────────

  /**
   * Creates a 1-second countdown timer that broadcasts TIMER_TICK
   * actions to a lobby, then calls onComplete when done.
   *
   * First emits a TIMER_START action with `totalDuration` and `timeRemaining`
   * so the client header ring knows the full circle baseline. Then emits
   * TIMER_TICK every second with the decremented `timeRemaining`.
   *
   * @param lobbyId - The lobby to broadcast to
   * @param durationSeconds - Total seconds for the countdown
   * @param onComplete - Callback fired when countdown reaches 0
   * @returns A timer handle with cancel / pause / resume helpers
   */
  startTimerBroadcast(
    lobbyId: string,
    durationSeconds: number,
    onComplete: () => void,
  ): TimerHandle {
    let remaining = durationSeconds;
    let cancelled = false;
    let paused = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    // Emit TIMER_START so the client knows totalDuration for ring animation
    this.lobbyManager.broadcastAction(lobbyId, {
      type: 'TIMER_START',
      payload: { totalDuration: durationSeconds, timeRemaining: remaining },
    });

    const tick = () => {
      if (cancelled || paused) return;

      remaining--;

      if (remaining < 0) {
        if (interval) clearInterval(interval);
        interval = null;
        if (!cancelled) {
          onComplete();
        }
        return;
      }

      // Broadcast TIMER_TICK action (decrement first so remaining matches display)
      this.lobbyManager.broadcastAction(lobbyId, {
        type: 'TIMER_TICK',
        payload: { timeRemaining: remaining },
      });
    };

    interval = setInterval(tick, 1000);

    const cancel = () => {
      cancelled = true;
      if (interval) { clearInterval(interval); interval = null; }
    };

    const pause = () => {
      if (paused || cancelled) return;
      paused = true;
      this.lobbyManager.broadcastAction(lobbyId, {
        type: 'TIMER_PAUSED',
        payload: { timeRemaining: Math.max(0, remaining) },
      });
    };

    const resume = () => {
      if (!paused || cancelled) return;
      paused = false;
      this.lobbyManager.broadcastAction(lobbyId, {
        type: 'TIMER_RESUMED',
        payload: { timeRemaining: Math.max(0, remaining) },
      });
    };

    return { cancel, pause, resume, get isPaused() { return paused; } };
  }

  /**
   * Broadcast an "infinite" timer that shows a full ring with an ∞ icon.
   * No ticking, no auto-complete. The host advances manually via force-skip.
   * Sentinel value: `totalDuration: -1, timeRemaining: -1`.
   * Always shows the host "Next" button (`showSkip: true`).
   */
  broadcastInfiniteTimer(lobbyId: string): TimerHandle {
    let cancelled = false;
    let paused = false;

    this.lobbyManager.broadcastAction(lobbyId, {
      type: 'TIMER_START',
      payload: { totalDuration: -1, timeRemaining: -1, showSkip: true },
    });

    const cancel = () => { cancelled = true; };

    const pause = () => {
      if (paused || cancelled) return;
      paused = true;
      this.lobbyManager.broadcastAction(lobbyId, {
        type: 'TIMER_PAUSED',
        payload: { timeRemaining: -1 },
      });
    };

    const resume = () => {
      if (!paused || cancelled) return;
      paused = false;
      this.lobbyManager.broadcastAction(lobbyId, {
        type: 'TIMER_RESUMED',
        payload: { timeRemaining: -1 },
      });
    };

    return { cancel, pause, resume, get isPaused() { return paused; } };
  }

  // ─── Internal Helpers ─────────────────────────────────────────

  /**
   * Send per-player scoped state snapshots to all connected
   * players and spectators in a lobby.
   */
  private sendFullSyncToAll(lobby: RMHboxLobby): void {
    // Send per-player scoped state snapshots
    for (const [userId, player] of lobby.players) {
      if (player.isConnected && player.socketId) {
        const clientState = this.buildClientState(lobby, userId);
        this.io
          .to(`lobby:${lobby.id}:player:${userId}`)
          .emit(S2C.LOBBY_STATE_SNAPSHOT, clientState);
      }
    }

    // Spectators get the spectator view
    for (const [userId, spectator] of lobby.spectators) {
      if (spectator.isConnected && spectator.socketId) {
        const clientState = this.buildClientState(lobby, userId);
        this.io
          .to(`lobby:${lobby.id}:player:${userId}`)
          .emit(S2C.LOBBY_STATE_SNAPSHOT, clientState);
      }
    }
  }
}
