/**
 * Phase 2 — §8: Spectator Management Tests
 *
 * Tests spectator promotion, rejection during game,
 * and lobby full scenarios.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LobbyManager } from '../../../server/rmhbox/lobby-manager';
import { S2C } from '../../../lib/rmhbox/events';
import {
  createMockServer,
  createMockSocket,
  registerSocket,
  findLastEmitted,
  findServerEmitted,
  MOCK_USERS,
} from './setup';
import type { MockServerData, MockSocketData } from './setup';
import type { Server, Socket } from 'socket.io';

let serverData: MockServerData;
let lobbyManager: LobbyManager;

beforeEach(() => {
  serverData = createMockServer();
  lobbyManager = new LobbyManager(serverData.server as unknown as Server);
});

function setupSocket(user: typeof MOCK_USERS.alice): MockSocketData {
  const sock = createMockSocket(user);
  registerSocket(serverData, sock);
  lobbyManager.handleConnection(sock.socket as unknown as Socket);
  return sock;
}

function callEvent(sock: MockSocketData, event: string, payload: unknown): void {
  const handler = sock.socket.on.mock.calls.find((c: unknown[]) => c[0] === event);
  handler![1](payload);
}

function createLobbyAndGetId(sock: MockSocketData, settings: Record<string, unknown> = {}): string {
  callEvent(sock, 'rmhbox:lobby:create', { settings });
  const created = findLastEmitted(sock.emitted, S2C.LOBBY_CREATED);
  return (created!.data as { lobbyId: string }).lobbyId;
}

describe('Spectator Promotion (§8.1)', () => {
  let socketA: MockSocketData;
  let socketC: MockSocketData;
  let lobbyId: string;

  beforeEach(() => {
    socketA = setupSocket(MOCK_USERS.alice);
    lobbyId = createLobbyAndGetId(socketA);
    socketC = setupSocket(MOCK_USERS.charlie);
    callEvent(socketC, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });
  });

  it('should promote spectator to player in WAITING state', () => {
    callEvent(socketC, 'rmhbox:lobby:request_promotion', { lobbyId });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.players.has(MOCK_USERS.charlie.userId)).toBe(true);
    expect(lobby.spectators.has(MOCK_USERS.charlie.userId)).toBe(false);
  });

  it('should broadcast SPECTATOR_PROMOTED action', () => {
    callEvent(socketC, 'rmhbox:lobby:request_promotion', { lobbyId });

    const actions = findServerEmitted(serverData.emitted, S2C.GAME_ACTION, `lobby:${lobbyId}`);
    const promoteAction = actions.find(
      (a) => (a.data as { type: string }).type === 'SPECTATOR_PROMOTED',
    );
    expect(promoteAction).toBeDefined();
  });

  it('should add system chat on promotion', () => {
    callEvent(socketC, 'rmhbox:lobby:request_promotion', { lobbyId });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const systemMsgs = lobby.chat.filter((m) => m.type === 'system');
    expect(systemMsgs.some((m) => m.content.includes('Charlie') && m.content.includes('player'))).toBe(true);
  });

  it('should reject promotion during PLAYING state', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.state = 'PLAYING';

    callEvent(socketC, 'rmhbox:lobby:request_promotion', { lobbyId });

    const error = findLastEmitted(socketC.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('LOBBY_IN_GAME');
  });

  it('should allow promotion during ROUND_RESULTS state', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.state = 'ROUND_RESULTS';

    callEvent(socketC, 'rmhbox:lobby:request_promotion', { lobbyId });

    expect(lobby.players.has(MOCK_USERS.charlie.userId)).toBe(true);
  });

  it('should reject promotion when player slots are full', () => {
    // Create lobby with max 2 players
    const sockHost = setupSocket({
      ...MOCK_USERS.alice,
      userId: 'user-promo-host',
      userName: 'PromoHost',
      sessionToken: 'token-promo-host',
    });
    const smallId = createLobbyAndGetId(sockHost, { maxPlayers: 2 });

    // Fill the second slot
    const sockFill = setupSocket({
      ...MOCK_USERS.bob,
      userId: 'user-promo-fill',
      userName: 'PromoFill',
      sessionToken: 'token-promo-fill',
    });
    callEvent(sockFill, 'rmhbox:lobby:join', { lobbyId: smallId, asSpectator: false });

    // Add a spectator
    const sockSpec = setupSocket({
      ...MOCK_USERS.charlie,
      userId: 'user-promo-spec',
      userName: 'PromoSpec',
      sessionToken: 'token-promo-spec',
    });
    callEvent(sockSpec, 'rmhbox:lobby:join', { lobbyId: smallId, asSpectator: true });

    // Try to promote
    callEvent(sockSpec, 'rmhbox:lobby:request_promotion', { lobbyId: smallId });

    const error = findLastEmitted(sockSpec.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('LOBBY_FULL');
  });

  it('should reject promotion when spectator promotion is disabled', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.settings.allowSpectatorPromotion = false;

    callEvent(socketC, 'rmhbox:lobby:request_promotion', { lobbyId });

    const error = findLastEmitted(socketC.emitted, S2C.ERROR);
    expect(error).toBeDefined();
  });

  it('should reject promotion from a player (not a spectator)', () => {
    const socketB = setupSocket(MOCK_USERS.bob);
    callEvent(socketB, 'rmhbox:lobby:join', { lobbyId, asSpectator: false });
    callEvent(socketB, 'rmhbox:lobby:request_promotion', { lobbyId });

    const error = findLastEmitted(socketB.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('NOT_IN_LOBBY');
  });

  it('should set promoted player as not ready', () => {
    callEvent(socketC, 'rmhbox:lobby:request_promotion', { lobbyId });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    const player = lobby.players.get(MOCK_USERS.charlie.userId)!;
    expect(player.isReady).toBe(false);
  });

  it('should update Socket.io rooms on promotion', () => {
    callEvent(socketC, 'rmhbox:lobby:request_promotion', { lobbyId });

    // Spectators room should be left, players room joined
    expect(socketC.socket.leave).toHaveBeenCalledWith(`lobby:${lobbyId}:spectators`);
    expect(socketC.socket.join).toHaveBeenCalledWith(`lobby:${lobbyId}:players`);
  });
});

describe('Host-Initiated Spectator Promotion (§8.2)', () => {
  let socketA: MockSocketData;
  let socketC: MockSocketData;
  let lobbyId: string;

  beforeEach(() => {
    socketA = setupSocket(MOCK_USERS.alice);
    lobbyId = createLobbyAndGetId(socketA);
    socketC = setupSocket(MOCK_USERS.charlie);
    callEvent(socketC, 'rmhbox:lobby:join', { lobbyId, asSpectator: true });
  });

  it('should reject host promotion during PLAYING state', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.state = 'PLAYING';

    callEvent(socketA, 'rmhbox:lobby:promote_spectator', { lobbyId, userId: MOCK_USERS.charlie.userId });

    const error = findLastEmitted(socketA.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('LOBBY_IN_GAME');
    expect(lobby.spectators.has(MOCK_USERS.charlie.userId)).toBe(true);
    expect(lobby.players.has(MOCK_USERS.charlie.userId)).toBe(false);
  });

  it('should reject host promotion during COUNTDOWN state', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.state = 'COUNTDOWN';

    callEvent(socketA, 'rmhbox:lobby:promote_spectator', { lobbyId, userId: MOCK_USERS.charlie.userId });

    const error = findLastEmitted(socketA.emitted, S2C.ERROR);
    expect((error!.data as { code: string }).code).toBe('LOBBY_IN_GAME');
    expect(lobby.spectators.has(MOCK_USERS.charlie.userId)).toBe(true);
    expect(lobby.players.has(MOCK_USERS.charlie.userId)).toBe(false);
  });

  it('should allow host promotion during WAITING state', () => {
    callEvent(socketA, 'rmhbox:lobby:promote_spectator', { lobbyId, userId: MOCK_USERS.charlie.userId });

    const lobby = lobbyManager.getLobby(lobbyId)!;
    expect(lobby.players.has(MOCK_USERS.charlie.userId)).toBe(true);
    expect(lobby.spectators.has(MOCK_USERS.charlie.userId)).toBe(false);
  });

  it('should allow host promotion during ROUND_RESULTS state', () => {
    const lobby = lobbyManager.getLobby(lobbyId)!;
    lobby.state = 'ROUND_RESULTS';

    callEvent(socketA, 'rmhbox:lobby:promote_spectator', { lobbyId, userId: MOCK_USERS.charlie.userId });

    expect(lobby.players.has(MOCK_USERS.charlie.userId)).toBe(true);
  });
});
