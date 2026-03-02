/**
 * Athora — Socket Handler Registration
 *
 * Registers all Athora real-time event handlers for a connected socket.
 */

import type { Server, Socket } from 'socket.io';
import { registerAthoraRoomHandlers, handleAthoraRoomDisconnect } from './room';
import { registerAthoraChatHandlers } from './chat';
import { registerAthoraConversationHandlers } from './conversation';
import { registerAthoraStandHandlers } from './stand';

export function registerAthoraHandlers(io: Server, socket: Socket): void {
  registerAthoraRoomHandlers(io, socket);
  registerAthoraChatHandlers(io, socket);
  registerAthoraConversationHandlers(io, socket);
  registerAthoraStandHandlers(io, socket);
}

export function handleAthoraDisconnect(io: Server, socket: Socket): void {
  handleAthoraRoomDisconnect(io, socket);
}
