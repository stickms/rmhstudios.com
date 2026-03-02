import type { Server, Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import { validated } from './schemas';
import { C2S } from '../../lib/rmhmusic/events';
import { ChatSchema } from '../../lib/rmhmusic/schemas';
import { sanitizeString } from '../../lib/rmhmusic/utils';
import { CHAT_MAX_LENGTH, CHAT_HISTORY_LENGTH } from '../../lib/rmhmusic/constants';
import type { RoomManager } from './room-manager';

export class ChatHandler {
  constructor(
    private io: Server,
    private roomManager: RoomManager,
  ) {}

  handleConnection(socket: Socket): void {
    socket.on(C2S.ROOM_CHAT, validated(socket, C2S.ROOM_CHAT, ChatSchema, (s, p) => this.onChat(s, p)));
  }

  private onChat(socket: Socket, payload: { content: string }) {
    const room = this.roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const userId = this.roomManager.getUserIdForSocket(socket.id);
    const member = userId ? room.members.get(userId) : null;
    if (!member) return;

    const content = sanitizeString(payload.content, CHAT_MAX_LENGTH);
    if (!content) return;

    const message = {
      id: nanoid(),
      userId: member.userId,
      userName: member.userName,
      content,
      createdAt: Date.now(),
    };

    room.chat.push(message);
    if (room.chat.length > CHAT_HISTORY_LENGTH) {
      room.chat = room.chat.slice(-CHAT_HISTORY_LENGTH);
    }

    this.roomManager.broadcastAction(room, 'CHAT_MESSAGE', message);
  }
}
