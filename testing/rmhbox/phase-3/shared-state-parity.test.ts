/**
 * Heartbeat state sharing: building the recipient-independent parts once per
 * tick must produce byte-identical per-recipient snapshots to building each
 * snapshot from scratch, and the spectator minigame view is computed once.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LobbyManager } from '../../../server/rmhbox/lobby-manager';
import { GameCoordinator, MINIGAME_SERVER_REGISTRY } from '../../../server/rmhbox/game-coordinator';
import { StateSyncService } from '../../../server/rmhbox/state-sync';
import { S2C } from '../../../lib/rmhbox/events';
import { BaseMinigame } from '../../../server/rmhbox/minigames/base-minigame';
import type { MinigameResults } from '../../../server/rmhbox/minigames/base-minigame';
import {
  createMockServer,
  createMockSocket,
  registerSocket,
  callEvent,
  findLastEmitted,
  MOCK_USERS,
} from './setup';
import type { MockServerData } from './setup';
import type { Server, Socket } from 'socket.io';

let serverData: MockServerData;

const spectatorCalls = vi.fn();

class SecretGame extends BaseMinigame {
  get spectatorMode(): 'competitive-individual' { return 'competitive-individual'; }
  start(): void { this.isRunning = true; }
  handleInput(): void { /* no-op */ }
  getStateForPlayer(userId: string): unknown { return { mine: `secret-${userId}` }; }
  getStateForSpectator(): unknown {
    spectatorCalls();
    return { spectatorView: true };
  }
  computeResults(): MinigameResults {
    return { rankings: [], awards: [], gameSpecificData: {}, duration: 0 };
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  spectatorCalls.mockClear();
  serverData = createMockServer();
  MINIGAME_SERVER_REGISTRY.set('rhyme-time', SecretGame);
});

afterEach(() => {
  MINIGAME_SERVER_REGISTRY.clear();
  vi.useRealTimers();
});

describe('shared heartbeat client state', () => {
  it('matches per-recipient builds exactly and computes the spectator view once', () => {
    const lobbyManager = new LobbyManager(serverData.server as unknown as Server);
    const sync = new StateSyncService(serverData.server as unknown as Server, lobbyManager);
    const coordinator = new GameCoordinator(serverData.server as unknown as Server, lobbyManager, sync);

    const users = Object.values(MOCK_USERS).slice(0, 4);
    const socks = users.map((u) => createMockSocket(u));
    for (const s of socks) {
      registerSocket(serverData, s);
      lobbyManager.handleConnection(s.socket as unknown as Socket);
      coordinator.handleConnection(s.socket as unknown as Socket);
    }
    callEvent(socks[0], 'rmhbox:lobby:create', {});
    const lobbyId = (findLastEmitted(socks[0].emitted, S2C.LOBBY_CREATED)!.data as { lobbyId: string }).lobbyId;
    callEvent(socks[1], 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
    callEvent(socks[2], 'rmhbox:lobby:join', { lobbyId, asSpectator: true });
    callEvent(socks[3], 'rmhbox:lobby:join', { lobbyId, asSpectator: true });

    coordinator.startGameFlow(lobbyId, 'rhyme-time');
    vi.advanceTimersByTime(16_000);
    callEvent(socks[0], 'rmhbox:game:ready_to_render', { lobbyId });
    callEvent(socks[1], 'rmhbox:game:ready_to_render', { lobbyId });
    vi.advanceTimersByTime(4_000);

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.state).toBe('PLAYING');

    const fresh = users.map((u) => JSON.stringify(lobbyManager.buildClientState(lobby, u.userId)));

    spectatorCalls.mockClear();
    const shared = lobbyManager.buildSharedClientParts(lobby);
    const viaShared = users.map((u) => JSON.stringify(lobbyManager.buildClientState(lobby, u.userId, shared)));

    expect(viaShared).toEqual(fresh);
    expect(spectatorCalls).toHaveBeenCalledTimes(1);
  });
});
