/**
 * RmhTube — Media Queue Manager
 *
 * The video queue: add, remove, reorder, skip, auto-advance, vote-to-skip,
 * queue voting, shuffle, loop and history. Queue items are persisted; the
 * playhead is not (that is the sync engine's, and it is ephemeral by design).
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
  QueueMetaSchema,
  ReactionSchema,
} from '../../lib/rmhtube/schemas';
import { parseMedia } from '../../lib/rmhtube/media';
import type { RoomManager } from './room-manager';
import type { SyncEngine } from './sync-engine';
import type { QueueItem, RmhTubeRoom } from './types';
import { z } from 'zod';

const EmptySchema = z.object({}).optional();

/** Played items kept in memory for the room's history panel. */
const HISTORY_LIMIT = 50;

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
    socket.on(C2S.QUEUE_META, validated(socket, C2S.QUEUE_META, QueueMetaSchema, (s, p) => this.applyMeta(s, p)));
    socket.on(C2S.REACTION_SEND, validated(socket, C2S.REACTION_SEND, ReactionSchema, (s, p) => this.sendReaction(s, p)));
    socket.on(C2S.QUEUE_VOTE, validated(socket, C2S.QUEUE_VOTE, QueueVoteSchema, (s, p) => this.voteForItem(s, p)));
    socket.on(C2S.QUEUE_SHUFFLE, validated(socket, C2S.QUEUE_SHUFFLE, EmptySchema, (s) => this.shuffleQueue(s)));
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private isLeader(room: RmhTubeRoom, userId: string): boolean {
    return room.leaderUserId === userId;
  }

  /**
   * Re-point `currentIndex` at whatever the playing item is now.
   *
   * Every mutation of the array has to do this. Removing an item above the
   * playhead, or reordering across it, used to leave the index pointing at a
   * different video, and the error only surfaced on the *next* skip — which
   * replayed something already watched, or jumped over something that was not.
   */
  private syncCurrentIndex(room: RmhTubeRoom): void {
    if (!room.currentItem) {
      room.currentIndex = -1;
      return;
    }
    const index = room.queue.findIndex((q) => q.id === room.currentItem!.id);
    // Not in the queue any more (it was removed while playing): leave the
    // pointer just before whatever slid into its place, so the next advance
    // picks that up rather than skipping it.
    if (index !== -1) room.currentIndex = index;
  }

  private reindex(room: RmhTubeRoom): void {
    room.queue.forEach((q, i) => { q.position = i; });
    this.syncCurrentIndex(room);
  }

  /** Broadcast the whole queue (after any reorder) with vote state intact. */
  private broadcastQueue(room: RmhTubeRoom): void {
    this.roomManager.broadcastAction(room, 'QUEUE_REORDERED', {
      queue: this.roomManager.broadcastQueue(room),
      currentIndex: room.currentIndex,
    });
  }

  // ─── Add to Queue ────────────────────────────────────────────

  private async addToQueue(socket: Socket, payload: { url: string; title?: string }): Promise<void> {
    const userId = socket.data.userId as string;
    const userName = socket.data.userName as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room) return;

    if (room.hostUserId !== userId && !room.settings.allowMemberQueue) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can add to the queue.' });
      return;
    }

    if (room.queue.length >= config.MAX_QUEUE_SIZE) {
      socket.emit(S2C.ERROR, { code: 'QUEUE_FULL', message: 'Queue is full.' });
      return;
    }

    // One parser decides what a URL is, and it is written against the player's
    // own matchers — so anything accepted here is something the player can
    // actually load.
    const media = parseMedia(payload.url);
    if (!media) {
      socket.emit(S2C.ERROR, {
        code: 'INVALID_URL',
        message: 'Unsupported link. Use a YouTube video, a Twitch channel or VOD, Vimeo, or a direct video/stream URL.',
      });
      return;
    }

    const now = Date.now();
    const item: QueueItem = {
      id: nanoid(12),
      url: media.url,
      mediaType: media.mediaType,
      title: (payload.title || media.label || fallbackTitle(media.mediaType, media.id)).slice(0, 256),
      // Duration and true liveness come from the player once the item plays
      // (QUEUE_META); the URL can only hint at them.
      duration: null,
      thumbnailUrl: media.thumbnailUrl,
      addedBy: userId,
      addedByName: userName,
      addedAt: now,
      position: room.queue.length,
      live: media.liveHint === 'live',
    };

    room.queue.push(item);
    room.lastActivityAt = now;

    this.roomManager.broadcastAction(room, 'QUEUE_ITEM_ADDED', {
      item: this.roomManager.toBroadcastItem(room, item),
    });

    this.persistQueueItem(room.id, item).catch((err) => {
      logger.error({ event: 'db_queue_add_failed', roomId: room.id, error: String(err) });
    });

    // Auto-play if nothing is currently playing
    if (!room.currentItem && room.settings.autoPlay) {
      this.playAtIndex(room, room.queue.length - 1);
    }

    logger.info({ event: 'queue_item_added', roomId: room.id, userId, mediaType: item.mediaType, title: item.title });
  }

  // ─── Item metadata (from the leader's player) ─────────────────

  /**
   * The leader's player learned something the URL could not tell us: the real
   * duration, whether the source is actually a broadcast, and sometimes a
   * title. Liveness matters most — it is what switches the room from
   * position sync to mirroring, and `/watch?v=…` is equally how YouTube
   * addresses a live stream, so it cannot be decided before load.
   */
  private applyMeta(
    socket: Socket,
    payload: { itemId: string; duration?: number | null; live?: boolean; title?: string },
  ): void {
    const userId = socket.data.userId as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room || !this.isLeader(room, userId)) return;

    const item = room.queue.find((q) => q.id === payload.itemId)
      ?? (room.currentItem?.id === payload.itemId ? room.currentItem : undefined);
    if (!item) return;

    const patch: Record<string, unknown> = {};
    if (payload.duration !== undefined && payload.duration !== item.duration) {
      item.duration = payload.duration;
      patch.duration = payload.duration;
    }
    if (payload.live !== undefined && payload.live !== item.live) {
      item.live = payload.live;
      patch.live = payload.live;
    }
    if (payload.title && payload.title !== item.title) {
      item.title = payload.title.slice(0, 256);
      patch.title = item.title;
    }
    if (Object.keys(patch).length === 0) return;

    // Liveness decides how the whole room synchronises, so a change to it has
    // to reach the timeline, not just the queue row.
    if (patch.live !== undefined && room.currentItem?.id === item.id) {
      this.syncEngine.setMode(room, item.live ? 'live' : 'vod');
    }

    this.roomManager.broadcastAction(room, 'QUEUE_ITEM_META', { itemId: item.id, ...patch });

    if (patch.duration !== undefined || patch.title !== undefined) {
      this.persistQueueMeta(item).catch((err) => {
        logger.error({ event: 'db_queue_meta_failed', roomId: room.id, error: String(err) });
      });
    }
  }

  // ─── Remove from Queue ───────────────────────────────────────

  private removeFromQueue(socket: Socket, payload: { itemId: string }): void {
    const userId = socket.data.userId as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room) return;

    const itemIndex = room.queue.findIndex((q) => q.id === payload.itemId);
    if (itemIndex === -1) return;

    const item = room.queue[itemIndex];

    // Members can only remove their own items, the host can remove any.
    if (room.hostUserId !== userId && item.addedBy !== userId) {
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'You can only remove your own items.' });
      return;
    }

    const removedWasCurrent = room.currentItem?.id === payload.itemId;
    room.queue.splice(itemIndex, 1);

    if (removedWasCurrent) {
      // The playing item is gone from the queue. Park the pointer just before
      // the slot it vacated so the next advance plays whatever moved into it.
      room.currentIndex = itemIndex - 1;
    } else if (itemIndex <= room.currentIndex) {
      room.currentIndex -= 1;
    }
    room.queue.forEach((q, i) => { q.position = i; });
    room.lastActivityAt = Date.now();

    this.roomManager.broadcastAction(room, 'QUEUE_ITEM_REMOVED', {
      itemId: payload.itemId,
      currentIndex: room.currentIndex,
    });

    this.persistQueueRemove(payload.itemId)
      .then(() => this.persistQueuePositions(room.queue))
      .catch((err) => {
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
    this.reindex(room);
    room.lastActivityAt = Date.now();

    this.broadcastQueue(room);

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

  // ─── Queue Voting ───────────────────────────────────────────

  private voteForItem(socket: Socket, payload: { itemId: string }): void {
    const userId = socket.data.userId as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room) return;

    if (!room.settings.queueVoting) {
      socket.emit(S2C.ERROR, { code: 'VOTING_DISABLED', message: 'Queue voting is disabled.' });
      return;
    }

    if (!room.queue.some((q) => q.id === payload.itemId)) {
      socket.emit(S2C.ERROR, { code: 'ITEM_NOT_FOUND', message: 'Queue item not found.' });
      return;
    }

    let voters = room.queueVotes.get(payload.itemId);
    if (!voters) {
      voters = new Set<string>();
      room.queueVotes.set(payload.itemId, voters);
    }

    if (voters.has(userId)) voters.delete(userId);
    else voters.add(userId);

    room.lastActivityAt = Date.now();

    this.roomManager.broadcastAction(room, 'QUEUE_VOTE_UPDATED', {
      itemId: payload.itemId,
      votes: voters.size,
      voters: Array.from(voters),
    });

    if (room.settings.autoSortByVotes) this.sortQueueByVotes(room);

    logger.info({ event: 'queue_vote', roomId: room.id, userId, itemId: payload.itemId, votes: voters.size });
  }

  /**
   * Sort the not-yet-played tail by vote count, descending. Items at or before
   * the playhead stay put — reordering what is already playing is not a sort,
   * it is a skip.
   */
  private sortQueueByVotes(room: RmhTubeRoom): void {
    const startIndex = room.currentIndex + 1;
    if (startIndex >= room.queue.length) return;

    const unsorted = room.queue.slice(startIndex);
    unsorted.sort((a, b) => {
      const votesA = room.queueVotes.get(a.id)?.size ?? 0;
      const votesB = room.queueVotes.get(b.id)?.size ?? 0;
      return votesB - votesA; // stable: ties keep their order
    });

    room.queue.splice(startIndex, unsorted.length, ...unsorted);
    this.reindex(room);

    this.broadcastQueue(room);

    this.persistQueuePositions(room.queue).catch((err) => {
      logger.error({ event: 'db_queue_vote_sort_failed', roomId: room.id, error: String(err) });
    });
  }

  // ─── Queue Shuffle ──────────────────────────────────────────

  private shuffleQueue(socket: Socket): void {
    const userId = socket.data.userId as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room) return;

    if (!this.isLeader(room, userId)) {
      socket.emit(S2C.ERROR, { code: 'NOT_LEADER', message: 'Only the leader can shuffle the queue.' });
      return;
    }

    const startIndex = room.currentIndex + 1;
    if (startIndex >= room.queue.length) return; // nothing to shuffle

    // Fisher-Yates over the not-yet-played tail.
    for (let i = room.queue.length - 1; i > startIndex; i--) {
      const j = startIndex + Math.floor(Math.random() * (i - startIndex + 1));
      [room.queue[i], room.queue[j]] = [room.queue[j], room.queue[i]];
    }

    this.reindex(room);
    room.lastActivityAt = Date.now();

    this.broadcastQueue(room);

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

    socket.to(room.id).emit(S2C.REACTION_BROADCAST, { userId, userName, emoji: payload.emoji });
  }

  // ─── Queue Advancement ───────────────────────────────────────

  advanceQueue(room: RmhTubeRoom): void {
    room.skipVotes.clear();

    if (room.currentItem) {
      room.playedItems.push({ ...room.currentItem });
      if (room.playedItems.length > HISTORY_LIMIT) {
        room.playedItems.splice(0, room.playedItems.length - HISTORY_LIMIT);
      }

      this.roomManager.broadcastAction(room, 'QUEUE_HISTORY_UPDATED', {
        playedItems: room.playedItems.map((q) => this.roomManager.toBroadcastItem(room, q)),
      });

      this.persistQueuePlayed(room.currentItem.id).catch((err) => {
        logger.error({ event: 'db_queue_played_failed', roomId: room.id, error: String(err) });
      });
    }

    const nextIndex = room.currentIndex + 1;
    if (nextIndex < room.queue.length) {
      this.playAtIndex(room, nextIndex);
    } else if (room.settings.loopQueue && room.queue.length > 0) {
      this.playAtIndex(room, 0);
      logger.info({ event: 'queue_looped', roomId: room.id });
    } else {
      room.currentItem = null;
      room.currentIndex = -1;
      const videoState = this.syncEngine.onMediaChanged(room);
      this.roomManager.broadcastAction(room, 'PLAYBACK_ENDED', { videoState });
      logger.info({ event: 'queue_exhausted', roomId: room.id });
    }
  }

  private playAtIndex(room: RmhTubeRoom, index: number): void {
    if (index < 0 || index >= room.queue.length) return;

    room.currentItem = room.queue[index];
    room.currentIndex = index;
    room.lastActivityAt = Date.now();

    // The fresh anchor travels *with* the item. Announcing them separately let
    // a client hold a new video against the previous one's timeline for as long
    // as the two messages were apart.
    const videoState = this.syncEngine.onMediaChanged(room);
    this.roomManager.broadcastAction(room, 'NOW_PLAYING', {
      item: this.roomManager.toBroadcastItem(room, room.currentItem),
      index: room.currentIndex,
      videoState,
    });

    logger.info({ event: 'now_playing', roomId: room.id, title: room.currentItem.title, index });
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

  private async persistQueueMeta(item: QueueItem): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.rmhTubeQueueItem.update({
      where: { id: item.id },
      data: { duration: item.duration, title: item.title },
    }).catch(() => {
      // The row may already be gone (removed while its metadata was in flight).
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

/** A name to show until the leader's player reports the real one. */
function fallbackTitle(mediaType: string, id: string | null): string {
  switch (mediaType) {
    case 'youtube': return id ? `YouTube · ${id}` : 'YouTube playlist';
    case 'twitch': return id ? `Twitch · ${id}` : 'Twitch';
    case 'vimeo': return id ? `Vimeo · ${id}` : 'Vimeo';
    default: return 'Video';
  }
}
