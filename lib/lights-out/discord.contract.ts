/**
 * Contracts for the Lights Out Discord Activity (redesign audit C1, batch 3). Client-safe.
 *
 * The Activity is embedded in Discord, so its identity is a Discord access token carried in the
 * body (POSTs) or an `Authorization: Bearer` header (the daily-progress read), not the site
 * session. Bodies for `embed` and `race` are a discriminated union by `action` on the server;
 * they are typed loosely here because the route validates them.
 */
import { endpoint } from '@/lib/contract/endpoint';

export interface DiscordCompletionView {
  completed?: boolean;
  moves?: number;
  ratingLabel?: string;
  ratingEmoji?: string;
  gridJson?: string;
}

/** Whether a Discord user finished the day's puzzle (cross-platform sync). */
export const getDiscordEmbedCompletionApi =
  endpoint<{
    query: {
      discordId: string;
      dateKey: string;
    };
    res: DiscordCompletionView;
  }>()(
    {
      method:
        'GET',
      path: '/api/discord/embed',
    },
  );

/** The guild's board for a day. */
export const getDiscordEmbedLeaderboardApi =
  endpoint<{
    query: {
      guildId: string;
      dateKey: string;
      leaderboard: 1;
    };
    res: {
      participants?: unknown[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/discord/embed',
    },
  );

/** Tell the channel embed that a player started, finished or raced. */
export const postDiscordEmbedApi =
  endpoint<{
    body: Record<
      string,
      unknown
    >;
    res: Record<
      string,
      unknown
    >;
  }>()(
    {
      method:
        'POST',
      path: '/api/discord/embed',
    },
  );

/** The caller's saved progress for a day (`Authorization: Bearer <discord token>`). */
export const getDiscordDailyProgressApi =
  endpoint<{
    query: {
      dateKey: string;
    };
    res: DiscordCompletionView;
  }>()(
    {
      method:
        'GET',
      path: '/api/discord/daily-progress',
    },
  );

export const saveDiscordDailyProgressApi =
  endpoint<{
    body: {
      accessToken: string;
      dateKey: string;
      gridJson: string;
      moves: number;
      completed: boolean;
      ratingLabel?:
        | string
        | undefined;
      ratingEmoji?:
        | string
        | undefined;
    };
    res: Record<
      string,
      unknown
    >;
  }>()(
    {
      method:
        'POST',
      path: '/api/discord/daily-progress',
    },
  );

/** Copy a linked player's Activity score to their site account. */
export const syncDiscordScoreApi =
  endpoint<{
    body: {
      accessToken: string;
      dateKey: string;
      moves: number;
      hintUsed: boolean;
      dnf: boolean;
      resultJson: Record<
        string,
        unknown
      >;
    };
    res: Record<
      string,
      unknown
    >;
  }>()(
    {
      method:
        'POST',
      path: '/api/discord/sync-score',
    },
  );

/** The race lobby, polled when the socket is unavailable. */
export const getDiscordRaceLobbyApi =
  endpoint<{
    query: {
      instanceId: string;
      discordId: string;
    };
    res: Record<
      string,
      unknown
    >;
  }>()(
    {
      method:
        'GET',
      path: '/api/discord/race',
    },
  );

/** A lobby action over HTTP (`join`, `ready`, `start`, `update`, `leave`, `return_to_lobby`). */
export const postDiscordRaceApi =
  endpoint<{
    body: {
      instanceId: string;
      action: string;
      discordId: string;
    } & Record<
      string,
      unknown
    >;
    res: Record<
      string,
      unknown
    >;
  }>()(
    {
      method:
        'POST',
      path: '/api/discord/race',
    },
  );
