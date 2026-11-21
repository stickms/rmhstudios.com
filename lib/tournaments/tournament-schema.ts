import { z } from 'zod';
import { WAGER_ELIGIBLE_GAME_IDS } from '@/lib/wager/eligible-games';
import {
  MAX_TOURNAMENT_ENTRY_FEE,
  MAX_TOURNAMENT_PLAYERS,
  MAX_TOURNAMENT_SEED,
  MIN_TOURNAMENT_PLAYERS,
} from '@/lib/wager/constants';

/** The check-in windows a host can pick: minutes before the start (s04-03). */
const checkInMinutesSchema = z.union([z.literal(10), z.literal(15), z.literal(30), z.literal(60)]);

/** Host settings change: turn check-in on (a window) or off (null) while registration is open. */
export const checkInSettingsSchema = z.object({ checkInMinutes: checkInMinutesSchema.nullable() });
export type CheckInSettingsInput = z.infer<typeof checkInSettingsSchema>;

/** Host action on one entrant: check them in, or undo it. */
export const hostCheckInSchema = z.object({
  userId: z.string().min(1).max(64),
  checkedIn: z.boolean(),
});
export type HostCheckInInput = z.infer<typeof hostCheckInSchema>;

export const createTournamentSchema =
  z.object(
    {
      name: z
        .string()
        .min(
          3,
        )
        .max(
          120,
        ),
      gameId:
        z.enum(
          WAGER_ELIGIBLE_GAME_IDS,
        ),
      format:
        z.enum(
          [
            'SINGLE_ELIM',
            'ROUND_ROBIN',
            'SWISS',
          ],
        ),
      entryFeeCoins:
        z
          .number()
          .int()
          .min(
            0,
          )
          .max(
            MAX_TOURNAMENT_ENTRY_FEE,
          ),
      seedPoolCoins:
        z
          .number()
          .int()
          .min(
            0,
          )
          .max(
            MAX_TOURNAMENT_SEED,
          )
          .optional(),
      maxPlayers:
        z
          .number()
          .int()
          .min(
            MIN_TOURNAMENT_PLAYERS,
          )
          .max(
            MAX_TOURNAMENT_PLAYERS,
          ),
      startsAt:
        z
          .string()
          .datetime()
          .nullable()
          .optional(),
      checkInMinutes:
        checkInMinutesSchema
          .nullable()
          .optional(),
    },
  ).refine(
    (v) => v.checkInMinutes == null || !!v.startsAt,
    { message: 'Check-in needs a start time', path: ['checkInMinutes'] },
  ).refine(
    // A start time must be ahead (a minute of clock skew allowed) and within a year:
    // a past one would open check-in the moment the tournament is created.
    (v) => {
      if (!v.startsAt) return true;
      const at = Date.parse(v.startsAt);
      const now = Date.now();
      return at >= now - 60_000 && at <= now + 366 * 24 * 60 * 60_000;
    },
    { message: 'Start time must be within the next year', path: ['startsAt'] },
  );
export type CreateTournamentInput =
  z.infer<
    typeof createTournamentSchema
  >;

export const reportMatchSchema =
  z.object(
    {
      winnerEntrantId:
        z
          .string()
          .min(
            1,
          )
          .max(
            64,
          ),
    },
  );
export type ReportMatchInput =
  z.infer<
    typeof reportMatchSchema
  >;
