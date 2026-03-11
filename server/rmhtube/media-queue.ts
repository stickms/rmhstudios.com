/**
 * RmhTube — Media Queue Manager
 *
 * Handles the video queue: add, remove, reorder, skip, auto-advance,
 * vote-to-skip, queue voting, shuffle, loop, and history.
 * Persists queue items to the database.
 */

import type { Server, Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import { config } from './config';
import { logger } from './logger';
import { getPrismaClient } from './prisma-client';
import { validated } from './schemas';
import { C2S, S2C } from '../../lib/rmhtube/events';
import {
  QueueAddSchema,
  QueueRemoveSchema,
  QueueReorderSchema,
  QueuePlayItemSchema,
  QueueVoteSchema,
  ReactionSchema,
} from '../../lib/rmhtube/schemas';
import { detectMediaType, extractYouTubeId, youtubeThumbUrl } from '../../lib/rmhtube/utils';
import type { RoomManager } from './room-manager';
import type { SyncEngine } from './sync-engine';
import type { QueueItem, RmhTubeRoom } from './types';
import { z } from 'zod';

const EmptySchema = z.object({}).optional();

export class MediaQueue {
  constructor(
    private io: Server,
    private roomManager: RoomManager,
    private syncEngine: SyncEngine,
  ) {}

  handleConnection(socket: Socket): void {
    socket.on(C2S.QUEUE_ADD, validated(socket, C2S.QUEUE_ADD, QueueAddSchema, (s, p) => this.addToQueue(s, p)));
    socket.on(C2S.QUEUE_REMOVE, validated(socket, C2S.QUEUE_REMOVE, QueueRemoveSchema, (s, p) => this.removeFromQueue(s, p)));
    socket.on(C2S.QUEUE_REORDER, validated(socket, C2S.QUEUE_REORDER, QueueReorderSchema, (s, p) => this.reorderQueue(s, p)));
    socket.on(C2S.QUEUE_PLAY_ITEM, validated(socket, C2S.QUEUE_PLAY_ITEM, QueuePlayItemSchema, (s, p) => this.playItem(s, p)));
    socket.on(C2S.QUEUE_SKIP, validated(socket, C2S.QUEUE_SKIP, EmptySchema, (s) => this.skipCurrent(s)));
    socket.on(C2S.QUEUE_VOTE_SKIP, validated(socket, C2S.QUEUE_VOTE_SKIP, EmptySchema, (s) => this.voteSkip(s)));
    socket.on(C2S.REACTION_SEND, validated(socket, C2S.REACTION_SEND, ReactionSchema, (s, p) => this.sendReaction(s, p)));

    // Phase 3: Queue voting & shuffle
    socket.on(C2S.QUEUE_VOTE, validated(socket, C2S.QUEUE_VOTE, QueueVoteSchema, (s, p) => this.voteForItem(s, p)));
    socket.on(C2S.QUEUE_SHUFFLE, validated(socket, C2S.QUEUE_SHUFFLE, EmptySchema, (s) => this.shuffleQueue(s)));
  }

  // ─── Helper: Leader Check ───────────────────────────────────

  private isLeader(room: RmhTubeRoom, userId: string): boolean {
    return room.leaderUserId === userId;
  }

  // ─── Add to Queue ────────────────────────────────────────────

  private async addToQueue(socket: Socket, payload: { url: string; title?: string }): Promise<void> {
    const userId = socket.data.userId as string;
    const userName = socket.data.userName as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room) return;

    // Permission check
    if (room.hostUserId !== userId && !room.settings.allowMemberQueue) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can add to the queue.' });
      return;
    }

    if (room.queue.length >= config.MAX_QUEUE_SIZE) {
      socket.emit(S2C.ERROR, { code: 'QUEUE_FULL', message: 'Queue is full.' });
      return;
    }

    const mediaType = detectMediaType(payload.url);
    if (!mediaType) {
      socket.emit(S2C.ERROR, { code: 'INVALID_URL', message: 'Unsupported media URL.' });
      return;
    }

    // Build queue item
    let title = payload.title || payload.url;
    let thumbnailUrl: string | null = null;

    // Resolve YouTube metadata
    if (mediaType === 'youtube') {
      const videoId = extractYouTubeId(payload.url);
      if (videoId) {
        thumbnailUrl = youtubeThumbUrl(videoId);
        if (!payload.title) {
          title = `YouTube Video (${videoId})`;
        }
      }
    }

    const now = Date.now();
    const item: QueueItem = {
      id: nanoid(12),
      url: payload.url,
      mediaType,
      title: title.slice(0, 256),
      duration: null,
      thumbnailUrl,
      addedBy: userId,
      addedByName: userName,
      addedAt: now,
      position: room.queue.length,
    };

    room.queue.push(item);
    room.lastActivityAt = now;

    this.roomManager.broadcastAction(room, 'QUEUE_ITEM_ADDED', { item });

    // Persist to DB
    this.persistQueueItem(room.id, item).catch((err) => {
      logger.error({ event: 'db_queue_add_failed', roomId: room.id, error: String(err) });
    });

    // Auto-play if nothing is currently playing
    if (!room.currentItem && room.settings.autoPlay) {
      this.playAtIndex(room, 0);
    }

    logger.info({ event: 'queue_item_added', roomId: room.id, userId, mediaType, title: item.title });
  }

  // ─── Remove from Queue ───────────────────────────────────────

  private removeFromQueue(socket: Socket, payload: { itemId: string }): void {
    const userId = socket.data.userId as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room) return;

    const itemIndex = room.queue.findIndex((q) => q.id === payload.itemId);
    if (itemIndex === -1) return;

    const item = room.queue[itemIndex];

    // Members can only remove their own items, host can remove any
    if (room.hostUserId !== userId && item.addedBy !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'You can only remove your own items.' });
      return;
    }

    room.queue.splice(itemIndex, 1);
    // Reindex positions
    room.queue.forEach((q, i) => { q.position = i; });
    room.lastActivityAt = Date.now();

    this.roomManager.broadcastAction(room, 'QUEUE_ITEM_REMOVED', { itemId: payload.itemId });

    // Persist removal + updated positions
    this.persistQueueRemove(payload.itemId).then(() =>
      this.persistQueuePositions(room.queue),
    ).catch((err) => {
      logger.error({ event: 'db_queue_remove_failed', roomId: room.id, error: String(err) });
    });
  }

  // ─── Reorder Queue ───────────────────────────────────────────

  private reorderQueue(socket: Socket, payload: { itemId: string; newPosition: number }): void {
    const userId = socket.data.userId as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room || !this.isLeader(room, userId)) {
      socket.emit(S2C.ERROR, { code: 'NOT_LEADER', message: 'Only the leader can reorder the queue.' });
      return;
    }

    const oldIndex = room.queue.findIndex((q) => q.id === payload.itemId);
    if (oldIndex === -1) return;

    const newPos = Math.max(0, Math.min(payload.newPosition, room.queue.length - 1));
    const [item] = room.queue.splice(oldIndex, 1);
    room.queue.splice(newPos, 0, item);
    room.queue.forEach((q, i) => { q.position = i; });
    room.lastActivityAt = Date.now();

    this.roomManager.broadcastAction(room, 'QUEUE_REORDERED', {
      queue: room.queue.map((q) => ({
        id: q.id,
        url: q.url,
        mediaType: q.mediaType,
        title: q.title,
        duration: q.duration,
        thumbnailUrl: q.thumbnailUrl,
        addedBy: q.addedBy,
        addedByName: q.addedByName,
        addedAt: q.addedAt,
        position: q.position,
      })),
    });

    // Persist updated positions
    this.persistQueuePositions(room.queue).catch((err) => {
      logger.error({ event: 'db_queue_reorder_failed', roomId: room.id, error: String(err) });
    });
  }

  // ─── Play Specific Item ──────────────────────────────────────

  private playItem(socket: Socket, payload: { itemId: string }): void {
    const userId = socket.data.userId as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room || !this.isLeader(room, userId)) {
      socket.emit(S2C.ERROR, { code: 'NOT_LEADER', message: 'Only the leader can select a video.' });
      return;
    }

    const index = room.queue.findIndex((q) => q.id === payload.itemId);
    if (index === -1) return;

    this.playAtIndex(room, index);
  }

  // ─── Skip Current ────────────────────────────────────────────

  private skipCurrent(socket: Socket): void {
    const userId = socket.data.userId as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room || !this.isLeader(room, userId)) {
      socket.emit(S2C.ERROR, { code: 'NOT_LEADER', message: 'Only the leader can skip.' });
      return;
    }

    this.advanceQueue(room);
  }

  // ─── Vote to Skip ───────────────────────────────────────────

  private voteSkip(socket: Socket): void {
    const userId = socket.data.userId as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room) return;

    if (!room.settings.allowMemberSkip) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Vote-to-skip is disabled.' });
      return;
    }

    if (!room.currentItem) return;

    room.skipVotes.add(userId);
    const activeMembers = Array.from(room.members.values()).filter((m) => m.isConnected).length;
    const votesNeeded = Math.ceil(activeMembers / 2);

    this.roomManager.broadcastAction(room, 'VOTE_SKIP_UPDATED', {
      voters: Array.from(room.skipVotes),
      votesNeeded,
      totalMembers: activeMembers,
    });

    if (room.skipVotes.size >= votesNeeded) {
      this.roomManager.broadcastAction(room, 'VOTE_SKIP_PASSED', {});
      this.advanceQueue(room);
    }
  }

  // ─── Queue Voting (Phase 3.3) ───────────────────────────────

  private voteForItem(socket: Socket, payload: { itemId: string }): void {
    const userId = socket.data.userId as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room) return;

    if (!room.settings.queueVoting) {
      socket.emit(S2C.ERROR, { code: 'VOTING_DISABLED', message: 'Queue voting is disabled.' });
      return;
    }

    // Verify the item exists in the queue
    const itemExists = room.queue.some((q) => q.id === payload.itemId);
    if (!itemExists) {
      socket.emit(S2C.ERROR, { code: 'ITEM_NOT_FOUND', message: 'Queue item not found.' });
      return;
    }

    // Toggle vote: remove if already voted, add otherwise
    let voters = room.queueVotes.get(payload.itemId);
    if (!voters) {
      voters = new Set<string>();
      room.queueVotes.set(payload.itemId, voters);
    }

    if (voters.has(userId)) {
      voters.delete(userId);
    } else {
      voters.add(userId);
    }

    room.lastActivityAt = Date.now();

    // Broadcast vote update
    this.roomManager.broadcastAction(room, 'QUEUE_VOTE_UPDATED', {
      itemId: payload.itemId,
      votes: voters.size,
      voters: Array.from(voters),
    });

    // Auto-sort by votes if enabled
    if (room.settings.autoSortByVotes) {
      this.sortQueueByVotes(room);
    }

    logger.info({
      event: 'queue_vote',
      roomId: room.id,
      userId,
      itemId: payload.itemId,
      votes: voters.size,
    });
  }

  /**
   * Sorts queue items by vote count (descending). Items at or before
   * currentIndex are left in place; only items after are sorted.
   * Broadcasts QUEUE_REORDERED and persists new positions.
   */
  private sortQueueByVotes(room: RmhTubeRoom): void {
    const startIndex = room.currentIndex + 1;
    if (startIndex >= room.queue.length) return;

    const unsorted = room.queue.slice(startIndex);
    unsorted.sort((a, b) => {
      const votesA = room.queueVotes.get(a.id)?.size ?? 0;
      const votesB = room.queueVotes.get(b.id)?.size ?? 0;
      // Descending by votes; ties keep original order (stable sort)
      return votesB - votesA;
    });

    // Replace the sortable portion
    room.queue.splice(startIndex, unsorted.length, ...unsorted);
    room.queue.forEach((q, i) => { q.position = i; });

    this.roomManager.broadcastAction(room, 'QUEUE_REORDERED', {
      queue: room.queue.map((q) => ({
        id: q.id,
        url: q.url,
        mediaType: q.mediaType,
        title: q.title,
        duration: q.duration,
        thumbnailUrl: q.thumbnailUrl,
        addedBy: q.addedBy,
        addedByName: q.addedByName,
        addedAt: q.addedAt,
        position: q.position,
      })),
    });

    // Persist updated positions
    this.persistQueuePositions(room.queue).catch((err) => {
      logger.error({ event: 'db_queue_vote_sort_failed', roomId: room.id, error: String(err) });
    });
  }

  // ─── Queue Shuffle (Phase 3.4) ──────────────────────────────

  private shuffleQueue(socket: Socket): void {
    const userId = socket.data.userId as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room) return;

    // Host or moderator only
    if (!this.isLeader(room, userId)) {
      socket.emit(S2C.ERROR, { code: 'NOT_LEADER', message: 'Only the leader can shuffle the queue.' });
      return;
    }

    const startIndex = room.currentIndex + 1;
    if (startIndex >= room.queue.length) return; // Nothing to shuffle

    // Fisher-Yates shuffle on items after currentIndex
    for (let i = room.queue.length - 1; i > startIndex; i--) {
      const j = startIndex + Math.floor(Math.random() * (i - startIndex + 1));
      [room.queue[i], room.queue[j]] = [room.queue[j], room.queue[i]];
    }

    // Reindex positions
    room.queue.forEach((q, i) => { q.position = i; });
    room.lastActivityAt = Date.now();

    this.roomManager.broadcastAction(room, 'QUEUE_REORDERED', {
      queue: room.queue.map((q) => ({
        id: q.id,
        url: q.url,
        mediaType: q.mediaType,
        title: q.title,
        duration: q.duration,
        thumbnailUrl: q.thumbnailUrl,
        addedBy: q.addedBy,
        addedByName: q.addedByName,
        addedAt: q.addedAt,
        position: q.position,
      })),
    });

    // Persist updated positions
    this.persistQueuePositions(room.queue).catch((err) => {
      logger.error({ event: 'db_queue_shuffle_failed', roomId: room.id, error: String(err) });
    });

    logger.info({ event: 'queue_shuffled', roomId: room.id, userId });
  }

  // ─── Reactions ───────────────────────────────────────────────

  private sendReaction(socket: Socket, payload: { emoji: string }): void {
    const userId = socket.data.userId as string;
    const userName = socket.data.userName as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room) return;

    socket.to(room.id).emit(S2C.REACTION_BROADCAST, {
      userId,
      userName,
      emoji: payload.emoji,
    });
  }

  // ─── Queue Advancement ───────────────────────────────────────

  advanceQueue(room: RmhTubeRoom): void {
    room.skipVotes.clear();

    // Phase 3.9: Push current item to history before advancing
    if (room.currentItem) {
      room.playedItems.push({ ...room.currentItem });
      // Keep history capped at 50 items (FIFO)
      if (room.playedItems.length > 50) {
        room.playedItems.splice(0, room.playedItems.length - 50);
      }

      this.roomManager.broadcastAction(room, 'QUEUE_HISTORY_UPDATED', {
        playedItems: room.playedItems.map((q) => ({
          id: q.id,
          url: q.url,
          mediaType: q.mediaType,
          title: q.title,
          duration: q.duration,
          thumbnailUrl: q.thumbnailUrl,
          addedBy: q.addedBy,
          addedByName: q.addedByName,
          addedAt: q.addedAt,
          position: q.position,
        })),
      });

      // Mark current as played in DB
      this.persistQueuePlayed(room.currentItem.id).catch((err) => {
        logger.error({ event: 'db_queue_played_failed', roomId: room.id, error: String(err) });
      });
    }

    const nextIndex = room.currentIndex + 1;
    if (nextIndex < room.queue.length) {
      this.playAtIndex(room, nextIndex);
    } else if (room.settings.loopQueue && room.queue.length > 0) {
      // Phase 3.5: Loop — reset to beginning of queue
      this.playAtIndex(room, 0);
      logger.info({ event: 'queue_looped', roomId: room.id });
    } else {
      // Queue exhausted
      room.currentItem = null;
      room.currentIndex = -1;
      this.syncEngine.onMediaChanged(room);
      this.roomManager.broadcastAction(room, 'PLAYBACK_ENDED', {});
      logger.info({ event: 'queue_exhausted', roomId: room.id });
    }
  }

  // ─── Internal Play Helper ────────────────────────────────────

  private playAtIndex(room: RmhTubeRoom, index: number): void {
    if (index < 0 || index >= room.queue.length) return;

    room.currentItem = room.queue[index];
    room.currentIndex = index;
    room.lastActivityAt = Date.now();

    this.syncEngine.onMediaChanged(room);
    this.roomManager.broadcastAction(room, 'NOW_PLAYING', {
      item: room.currentItem,
      index: room.currentIndex,
    });

    logger.info({ event: 'now_playing', roomId: room.id, title: room.currentItem.title, index });
  }

  // ─── Video End Notification ──────────────────────────────────

  /**
   * Called when the host's video player reports the video has ended.
   * Auto-advances the queue if autoPlay is enabled.
   * Supports loop mode via advanceQueue (Phase 3.5).
   */
  handleVideoEnded(room: RmhTubeRoom): void {
    if (room.settings.autoPlay) {
      this.advanceQueue(room);
    } else if (room.settings.loopQueue && room.queue.length > 0) {
      // Even without autoPlay, if loop is enabled and we're at the end,
      // loop back to the first item
      const nextIndex = room.currentIndex + 1;
      if (nextIndex >= room.queue.length) {
        this.playAtIndex(room, 0);
        logger.info({ event: 'queue_looped_on_end', roomId: room.id });
      }
    }
  }

  // ─── Database Persistence ────────────────────────────────────

  private async persistQueueItem(roomId: string, item: QueueItem): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.rmhTubeQueueItem.create({
      data: {
        id: item.id,
        roomId,
        url: item.url,
        mediaType: item.mediaType,
        title: item.title,
        duration: item.duration,
        thumbnailUrl: item.thumbnailUrl,
        addedById: item.addedBy,
        addedByName: item.addedByName,
        position: item.position,
      },
    });
  }

  private async persistQueueRemove(itemId: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.rmhTubeQueueItem.delete({ where: { id: itemId } }).catch(() => {
      // Item may already be deleted
    });
  }

  private async persistQueuePlayed(itemId: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.rmhTubeQueueItem.update({
      where: { id: itemId },
      data: { playedAt: new Date() },
    }).catch(() => {
      // Item may not exist
    });
  }

  private async persistQueuePositions(queue: QueueItem[]): Promise<void> {
    if (queue.length === 0) return;
    const prisma = getPrismaClient();
    await prisma.$transaction(
      queue.map((q) =>
        prisma.rmhTubeQueueItem.update({
          where: { id: q.id },
          data: { position: q.position },
        }),
      ),
    );
  }
}
