/**
 * Contracts for /api/game-night (redesign audit C1, batch 8): the weekly
 * rotation list and the admin create / lobby-code writes. Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { listGameNights } from '@/lib/competitive/game-night.server';

export type GameNightView =
  Awaited<
    ReturnType<
      typeof listGameNights
    >
  >[number];

/** Enabled rotations with now-playing / up-next. */
export const listGameNightsApi =
  endpoint<{
    res: {
      nights: GameNightView[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/game-night',
    },
  );

/** Admin: define a weekly rotation. */
export const createGameNightApi =
  endpoint<{
    body: {
      title: string;
      weekday: number;
      startMinute: number;
      durationMinutes: number;
      minutesPerGame: number;
      games: string[];
    };
    res: {
      id: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/game-night',
    },
  );

/** Admin: post (or clear with `null`) the live join code for one game, or disable the night. */
export const patchGameNightApi =
  endpoint<{
    body: {
      id: string;
      lobby?:
        | {
            gameId: string;
            code:
              | string
              | null;
          }
        | undefined;
      enabled?:
        | boolean
        | undefined;
    };
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'PATCH',
      path: '/api/game-night',
    },
  );
