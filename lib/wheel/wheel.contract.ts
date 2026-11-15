/**
 * Contracts for the daily wheel (redesign audit C1, batch 7). Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';

export interface WheelStateView {
  segments: number[];
  signedIn: boolean;
  canSpin: boolean;
  today: {
    reward: number;
    segment: number;
  } | null;
}

/** Segments plus whether the viewer can spin today (signed-out viewers may read). */
export const getWheelApi =
  endpoint<{
    res: WheelStateView;
  }>()(
    {
      method:
        'GET',
      path: '/api/wheel',
    },
  );

/** Takes today's free spin; 409 when it was already taken. */
export const spinWheelApi =
  endpoint<{
    res: {
      segment: number;
      reward: number;
      newBalance: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/wheel/spin',
    },
  );
