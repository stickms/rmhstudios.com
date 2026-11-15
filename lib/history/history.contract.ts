/**
 * Contract for the history heartbeat (redesign audit C1, batch 9). Client-safe.
 * Sent with `keepalive` so a beat fired as the tab closes still lands.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { HistoryBeatInput } from '@/lib/history/schema';

export const recordHistoryBeatApi =
  endpoint<{
    body: HistoryBeatInput;
    res: {
      ok: boolean;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/history/beat',
    },
  );
