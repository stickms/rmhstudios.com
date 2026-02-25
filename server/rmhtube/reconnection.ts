/**
 * RmhTube — Reconnection Handler
 *
 * Handles reconnecting users who briefly disconnected.
 * Identifies returning users by userId, re-associates their socket,
 * and sends a full state snapshot to resync.
 */

import type { Server, Socket } from 'socket.io';
import { S2C } from '../../lib/rmhtube/events';
import { logger } from './logger';
import type { RoomManager } from './room-manager';

export class ReconnectionHandler {
  constructor(
    private io: Server,
    private roomManager: RoomManager,
  ) {}

  /**
   * Called on new connection. If the user was previously in a room
   * and is within their grace period, restore their session.
   */
  attemptReconnect(socket: Socket): void {
    const userId = socket.data.userId as string;
    const userName = socket.data.userName as string;

    const room = this.roomManager.getRoomForUser(userId);
    if (!room) return;

    const member = room.members.get(userId);
    if (!member) return;

    // Cancel grace period timer
    const graceTimer = this.roomManager.graceTimers.get(userId);
    if (graceTimer) {
      clearTimeout(graceTimer);
      this.roomManager.graceTimers.delete(userId);
    }

    // Check for duplicate session (same user, different tab/device)
    if (member.socketId && member.isConnected) {
      const oldSocket = this.io.sockets.sockets.get(member.socketId);
      if (oldSocket && oldSocket.id !== socket.id) {
        // Disconnect the old socket
        oldSocket.emit(S2C.ERROR, {
          code: 'DUPLICATE_SESSION',
          message: 'Connected from another tab or device.',
        });
        oldSocket.disconnect(true);
      }
    }

    // Re-associate socket with the member
    member.socketId = socket.id;
    member.isConnected = true;
    member.lastSeenAt = Date.now();
    member.userName = userName; // Refresh in case it changed

    // Re-join the socket.io room
    socket.join(room.id);

    // Broadcast reconnection to other members
    this.roomManager.broadcastAction(room, 'MEMBER_CONNECTED', { userId });

    // Send full state snapshot to the reconnecting user
    socket.emit(S2C.ROOM_STATE_SNAPSHOT, this.roomManager.buildClientState(room, userId));

    logger.info({ event: 'member_reconnected', roomId: room.id, userId, userName });
  }

  /**
   * Called on disconnect. The actual grace period handling is done
   * by RoomManager.handleDisconnect(). This exists for any
   * additional cleanup if needed.
   */
  handleDisconnect(socket: Socket): void {
    // RoomManager handles the grace period and cleanup.
    // This method exists as an extension point.
  }
}
