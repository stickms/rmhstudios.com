import type { Server, Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import { validated } from './schemas';
import { C2S } from '../../lib/rmhmusic/events';
import { ChatSchema } from '../../lib/rmhmusic/schemas';
import { sanitizeString } from '../../lib/rmhmusic/utils';
import { CHAT_MAX_LENGTH, CHAT_HISTORY_LENGTH } from '../../lib/rmhmusic/constants';
import type { RoomManager } from './room-manager';
import { getPrismaClient } from './prisma-client';
import { RoomSlowMode } from '../shared/room-slow-mode';
import { slowModeEvents } from '../../lib/safety/slow-mode-events';

const SLOW = slowModeEvents('music');

export class ChatHandler {
  // S3: host-set slow mode + raid protection.
  private slowMode = new RoomSlowMode(async (userId) => {
    const row = await getPrismaClient().user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });
    return row ? row.createdAt.getTime() : null;
  });

  constructor(
    private io: Server,
    private roomManager: RoomManager,
  ) {}

  handleConnection(socket: Socket): void {
    socket.on(C2S.ROOM_CHAT, validated(socket, C2S.ROOM_CHAT, ChatSchema, (s, p) => this.onChat(s, p)));
    socket.on(SLOW.SET, (raw: unknown) => this.onSlowModeSet(socket, (raw as { seconds?: unknown })?.seconds));
  }

  private onSlowModeSet(socket: Socket, seconds: unknown) {
    const room = this.roomManager.getRoomForSocket(socket.id);
    const userId = this.roomManager.getUserIdForSocket(socket.id);
    if (!room || !userId || room.hostUserId !== userId || typeof seconds !== 'number') return;
    if (this.slowMode.setCooldown(room.id, seconds) === null) return;
    this.io.to(room.id).emit(SLOW.STATE, this.slowMode.state(room.id));
  }

  private async onChat(socket: Socket, payload: { content: string }) {
    const room = this.roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const userId = this.roomManager.getUserIdForSocket(socket.id);
    const member = userId ? room.members.get(userId) : null;
    if (!member) return;

    const content = sanitizeString(payload.content, CHAT_MAX_LENGTH);
    if (!content) return;

    const verdict = await this.slowMode.check(room.id, userId!, room.hostUserId === userId);
    if (!verdict.ok) {
      socket.emit(SLOW.REJECTED, {
        roomId: room.id,
        reason: verdict.reason,
        retryInMs: verdict.reason === 'cooldown' ? verdict.retryInMs : 0,
      });
      socket.emit(SLOW.STATE, this.slowMode.state(room.id));
      return;
    }

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
