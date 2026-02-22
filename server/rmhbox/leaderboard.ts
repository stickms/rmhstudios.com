/**
 * RMHbox — Leaderboard Service
 *
 * Handles leaderboard queries and match result persistence.
 * Database writes are async and non-blocking to game flow.
 */

import { Socket } from 'socket.io';

export class LeaderboardService {
  handleConnection(socket: Socket): void {
    socket.on('rmhbox:leaderboard:fetch', (payload) => this.onFetch(socket, payload));
  }

  private onFetch(_socket: Socket, _payload: unknown): void {
    // TODO: Implement per core.md §14
  }
}
