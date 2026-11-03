/** Which chat/reaction channel a request addresses: a watch room, or the election day's main room. Server-only. */

import { parseDay } from './calendar';
import { isRoomCode } from './room-config';
import { roomChannel } from './rooms';
import { getRoom } from './rooms.server';

export interface Channel {
  /** The realtime-bus key. */
  key: string;
  /** The election day the channel belongs to. */
  date: string;
  /** The room code, or null for the day's main room. */
  room: string | null;
}

/** Null when the election is unknown, or the room does not exist / has expired. */
export async function resolveChannel(input: { cycle?: string; room?: string | null }): Promise<Channel | null> {
  if (input.room) {
    const code = input.room.toUpperCase();
    if (!isRoomCode(code)) return null;
    const row = await getRoom(code);
    return row ? { key: roomChannel(code, row.electionDate), date: row.electionDate, room: code } : null;
  }
  const day = input.cycle ? parseDay(input.cycle) : null;
  return day ? { key: roomChannel(null, day.date), date: day.date, room: null } : null;
}
