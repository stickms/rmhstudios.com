/**
 * RMHTube — subtitle events (sprint 11 16).
 *
 * The item's adder or the room's host attaches up to three subtitle tracks (parsed cues only; the file is never sent)
 * and removes them. The hub checks who is asking, whether they are in the room, and re-validates every cue; the
 * persistence and the rules live in `lib/rmhtube/subtitles.server.ts`. Both events are in `SOCKET_RATE_LIMITS`
 * (`rmhtube:subtitle:add`, `rmhtube:subtitle:remove`) and zod-validated in `lib/rmhtube/schemas.ts`.
 */

import type { Socket } from 'socket.io';
import { C2S, S2C } from '../../lib/rmhtube/events';
import { SubtitleAddSchema, SubtitleRemoveSchema } from '../../lib/rmhtube/schemas';
import { addSubtitle, removeSubtitle, type SubtitleFailure } from '../../lib/rmhtube/subtitles.server';
import { logger } from './logger';
import { getPrismaClient } from './prisma-client';
import { validated } from './schemas';
import type { RoomManager } from './room-manager';
import type { QueueItem, RmhTubeRoom } from './types';

/** What the client is told for each refusal. Fixed strings: nothing from the database or a caught error. */
const MESSAGES: Record<SubtitleFailure, { code: string; message: string }> = {
  empty: { code: 'SUBTITLE_INVALID', message: 'That subtitle file has no cues.' },
  no_cues: { code: 'SUBTITLE_INVALID', message: 'That subtitle file has no cues.' },
  too_many_cues: { code: 'SUBTITLE_TOO_LARGE', message: 'That subtitle file has too many cues.' },
  too_large: { code: 'SUBTITLE_TOO_LARGE', message: 'That subtitle file is too large.' },
  unordered: { code: 'SUBTITLE_INVALID', message: 'That subtitle file is not valid.' },
  invalid_cue: { code: 'SUBTITLE_INVALID', message: 'That subtitle file is not valid.' },
  bad_label: { code: 'SUBTITLE_INVALID', message: 'Give the subtitles a label of up to 40 characters.' },
  bad_lang: { code: 'SUBTITLE_INVALID', message: 'That language tag is not valid.' },
  not_found: { code: 'SUBTITLE_NOT_FOUND', message: 'That video or subtitle is no longer in the queue.' },
  forbidden: {
    code: 'NOT_HOST',
    message: 'Only the person who queued this video or the host can change its subtitles.',
  },
  live: { code: 'SUBTITLE_LIVE', message: 'A live stream cannot have subtitles.' },
  limit: { code: 'SUBTITLE_LIMIT', message: 'A video can have up to 3 subtitle files.' },
  label_taken: { code: 'SUBTITLE_LABEL_TAKEN', message: 'This video already has subtitles with that label.' },
};

function findItem(room: RmhTubeRoom, itemId: string): QueueItem | undefined {
  return room.queue.find((q) => q.id === itemId) ?? (room.currentItem?.id === itemId ? room.currentItem : undefined);
}

export function registerSubtitleHandlers(socket: Socket, roomManager: RoomManager): void {
  const refuse = (reason: SubtitleFailure) => socket.emit(S2C.ERROR, MESSAGES[reason]);

  socket.on(
    C2S.SUBTITLE_ADD,
    validated(socket, C2S.SUBTITLE_ADD, SubtitleAddSchema, (s, p) => {
      const userId = s.data.userId as string;
      const room = roomManager.getRoomForUser(userId);
      if (!room) return;
      const item = findItem(room, p.itemId);
      if (!item) return refuse('not_found');
      // Cheap in-memory refusal first; the database call checks again (membership, adder, the cap of three).
      if (item.addedBy !== userId && room.hostUserId !== userId) return refuse('forbidden');
      if (item.live) return refuse('live');
      void addSubtitle(getPrismaClient(), {
        roomId: room.id,
        itemId: item.id,
        userId,
        label: p.label,
        lang: p.lang,
        cues: p.cues,
        live: item.live,
      })
        .then((result) => {
          if (!result.ok) return refuse(result.reason);
          // The item may have left the queue while the write was in flight (its row cascades away with it).
          const current = findItem(room, item.id);
          if (!current) return;
          current.subtitles = [...(current.subtitles ?? []), result.subtitle];
          room.lastActivityAt = Date.now();
          roomManager.broadcastAction(room, 'QUEUE_ITEM_SUBTITLES', {
            itemId: current.id,
            subtitles: current.subtitles,
          });
        })
        .catch((err) => {
          logger.error({ event: 'subtitle_add_failed', roomId: room.id, error: String(err) });
          s.emit(S2C.ERROR, { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
        });
    }),
  );

  socket.on(
    C2S.SUBTITLE_REMOVE,
    validated(socket, C2S.SUBTITLE_REMOVE, SubtitleRemoveSchema, (s, p) => {
      const userId = s.data.userId as string;
      const room = roomManager.getRoomForUser(userId);
      if (!room) return;
      void removeSubtitle(getPrismaClient(), { roomId: room.id, subtitleId: p.subtitleId, userId })
        .then((result) => {
          if (!result.ok) return refuse(result.reason);
          const item = findItem(room, result.queueItemId);
          if (!item) return;
          item.subtitles = (item.subtitles ?? []).filter((t) => t.id !== p.subtitleId);
          room.lastActivityAt = Date.now();
          roomManager.broadcastAction(room, 'QUEUE_ITEM_SUBTITLES', {
            itemId: item.id,
            subtitles: item.subtitles,
          });
        })
        .catch((err) => {
          logger.error({ event: 'subtitle_remove_failed', roomId: room.id, error: String(err) });
          s.emit(S2C.ERROR, { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
        });
    }),
  );
}
