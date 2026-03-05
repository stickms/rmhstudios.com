import type { Server, Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import { validated } from './schemas';
import { C2S, S2C } from '../../lib/rmhmusic/events';
import { QueueAddSchema, QueueRemoveSchema, QueueReorderSchema } from '../../lib/rmhmusic/schemas';
import { MAX_QUEUE_SIZE } from '../../lib/rmhmusic/constants';
import type { RoomManager } from './room-manager';
import type { ServerQueueItem } from './types';

export class QueueManager {
  constructor(
    private io: Server,
    private roomManager: RoomManager,
  ) {}

  handleConnection(socket: Socket): void {
    socket.on(C2S.QUEUE_ADD, validated(socket, C2S.QUEUE_ADD, QueueAddSchema, (s, p) => this.onAdd(s, p)));
    socket.on(C2S.QUEUE_REMOVE, validated(socket, C2S.QUEUE_REMOVE, QueueRemoveSchema, (s, p) => this.onRemove(s, p)));
    socket.on(C2S.QUEUE_REORDER, validated(socket, C2S.QUEUE_REORDER, QueueReorderSchema, (s, p) => this.onReorder(s, p)));
  }

  private onAdd(socket: Socket, payload: any) {
    const room = this.roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    if (room.queue.length >= MAX_QUEUE_SIZE) {
      socket.emit(S2C.ERROR, { code: 'QUEUE_FULL', message: 'Queue is full' });
      return;
    }

    const userId = this.roomManager.getUserIdForSocket(socket.id);
    const member = userId ? room.members.get(userId) : null;

    const item: ServerQueueItem = {
      id: nanoid(),
      spotifyUri: payload.spotifyUri,
      title: payload.title,
      artist: payload.artist,
      albumArt: payload.albumArt,
      durationMs: payload.durationMs,
      previewUrl: payload.previewUrl ?? null,
      addedById: userId ?? 'unknown',
      addedByName: member?.userName ?? 'Unknown',
      position: room.queue.length,
      addedAt: Date.now(),
    };

    room.queue.push(item);
    this.io.to(room.id).emit(S2C.QUEUE_UPDATED, { queue: room.queue });
    this.roomManager.broadcastAction(room, 'QUEUE_ITEM_ADDED', { item });
  }

  private onRemove(socket: Socket, payload: { itemId: string }) {
    const room = this.roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const idx = room.queue.findIndex((q) => q.id === payload.itemId);
    if (idx === -1) return;

    room.queue.splice(idx, 1);
    room.queue.forEach((item, i) => { item.position = i; });

    this.io.to(room.id).emit(S2C.QUEUE_UPDATED, { queue: room.queue });
  }

  private onReorder(socket: Socket, payload: { itemId: string; newPosition: number }) {
    const room = this.roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const idx = room.queue.findIndex((q) => q.id === payload.itemId);
    if (idx === -1) return;

    const [item] = room.queue.splice(idx, 1);
    const pos = Math.min(payload.newPosition, room.queue.length);
    room.queue.splice(pos, 0, item);
    room.queue.forEach((q, i) => { q.position = i; });

    this.io.to(room.id).emit(S2C.QUEUE_UPDATED, { queue: room.queue });
  }
}
