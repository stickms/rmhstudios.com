/**
 * RMHMusic — Handler for the unified socket server.
 *
 * Wraps the rmhmusic room/sync/queue/chat managers as singletons
 * so they share state across all connections on the main io instance.
 */

import type { Server, Socket } from 'socket.io';
import { RoomManager } from '../../rmhmusic/room-manager';
import { SyncEngine } from '../../rmhmusic/sync-engine';
import { QueueManager } from '../../rmhmusic/queue-manager';
import { ChatHandler } from '../../rmhmusic/chat-handler';

let roomManager: RoomManager | null = null;
let syncEngine: SyncEngine | null = null;
let queueManager: QueueManager | null = null;
let chatHandler: ChatHandler | null = null;

function ensureInit(io: Server) {
  if (roomManager) return;
  roomManager = new RoomManager(io);
  syncEngine = new SyncEngine(io, roomManager);
  queueManager = new QueueManager(io, roomManager);
  chatHandler = new ChatHandler(io, roomManager);
  roomManager.startGC();
  syncEngine.startHeartbeat();
}

export function registerRmhMusicHandlers(io: Server, socket: Socket): void {
  ensureInit(io);
  // RMHMusic requires authentication
  if (!socket.data.userId) return;
  roomManager!.handleConnection(socket);
  syncEngine!.handleConnection(socket);
  queueManager!.handleConnection(socket);
  chatHandler!.handleConnection(socket);
}

export function handleRmhMusicDisconnect(_io: Server, _socket: Socket): void {
  // Disconnect is handled internally by RoomManager via socket.on('disconnect')
}
