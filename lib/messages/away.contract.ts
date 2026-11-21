/** Contracts for /api/messages/away/** (sprint 06 #18). Client-safe: request types come by `import type`. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { awayStatusQuery, putAwayBody } from '@/lib/messages/away-schema';

/** The caller's own away message, as they set it (the text included). */
export interface OwnAway {
  id: string;
  body: string;
  startsAt: string;
  endsAt: string;
  /** The last day it covers, `YYYY-MM-DD` in `tz`. */
  endDay: string;
  /** The first day, `YYYY-MM-DD` in `tz`. */
  startDay: string;
  tz: string;
  showOnProfile: boolean;
  /** False while it is set but has not started. */
  active: boolean;
}

/** `away` is null when none is set or the last one ended. `autoRepliedChatIds` are the chats that got a reply this period. */
export const getAwayApi = endpoint<{
  res: { away: OwnAway | null; autoRepliedChatIds: string[] };
}>()({ method: 'GET', path: '/api/messages/away' });

/** 400 with a `code` (`too-far`, `ended`, ...) when the window is refused. */
export const putAwayApi = endpoint<{
  body: z.infer<typeof putAwayBody>;
  res: { away: OwnAway };
}>()({ method: 'PUT', path: '/api/messages/away' });

export const deleteAwayApi = endpoint<{
  res: { success: true };
}>()({ method: 'DELETE', path: '/api/messages/away' });

/** What someone else may know: whether the member is away and until when. Never the text. */
export const awayStatusApi = endpoint<{
  query: z.infer<typeof awayStatusQuery>;
  res: { active: boolean; endsAt: string | null; tz: string | null };
}>()({ method: 'GET', path: '/api/messages/away/$userId/status' });
