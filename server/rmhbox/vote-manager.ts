/**
 * RMHbox — Vote Manager
 *
 * Handles minigame voting: candidate selection, vote casting,
 * tally broadcasting, and result determination.
 */

import { Server, Socket } from 'socket.io';
import { LobbyManager } from './lobby-manager';
import { GameCoordinator } from './game-coordinator';

export class VoteManager {
  private readonly io: Server;
  private readonly lobbyManager: LobbyManager;
  private readonly gameCoordinator: GameCoordinator;

  constructor(io: Server, lobbyManager: LobbyManager, gameCoordinator: GameCoordinator) {
    this.io = io;
    this.lobbyManager = lobbyManager;
    this.gameCoordinator = gameCoordinator;
  }

  handleConnection(socket: Socket): void {
    socket.on('rmhbox:game:start_vote', (payload) => this.onStartVote(socket, payload));
    socket.on('rmhbox:game:cast_vote', (payload) => this.onCastVote(socket, payload));
  }

  private onStartVote(_socket: Socket, _payload: unknown): void {
    // TODO: Implement per core.md §12
  }

  private onCastVote(_socket: Socket, _payload: unknown): void {
    // TODO: Implement per core.md §12
  }
}
