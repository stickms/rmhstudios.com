/**
 * Is this Discord user actually in this Activity instance?
 *
 * The vibe room is keyed by the Activity `instanceId`, which the client supplies. A socket that
 * authenticated through Discord (so its Discord user id is verified) may only join instances
 * Discord says it is in: `GET /applications/{application_id}/activity-instances/{instance_id}`
 * with the Activity application's BOT token returns `users: string[]` (Discord user ids).
 *
 * Without a bot token configured the check is skipped (dev keeps working; logged once at
 * creation). Lookups are bounded: 5 s timeout, positive results cached 30 s per instance, an
 * unknown instance (404) remembered 60 s, concurrent lookups of one instance share one call,
 * and each Discord user gets a small per-minute budget so a caller cannot make us spray Discord
 * with made-up instance ids. A transient failure (network, 5xx, 429) is never remembered.
 *
 * NOTE: server code imports `lib/` RELATIVELY — server/CLAUDE.md gotcha 7.
 */

import { createAuthCache } from '../shared/session-auth';
import { createRateLimiter } from '../shared/rate-limit';
import { createSingleFlight } from '../../lib/single-flight';

const DISCORD_API =
  'https://discord.com/api/v10';
const TIMEOUT_MS = 5_000;
/** A looked-up member list is trusted this long. */
const MEMBERS_TTL_MS = 30_000;
/** An instance Discord does not know is not asked about again for this long. */
const UNKNOWN_TTL_MS = 60_000;
/** A user missing from a cached list may have just joined: re-ask, but not more often than this. */
const REFRESH_AFTER_MS = 5_000;

export type InstanceCheck =
  | 'skipped' // no bot token configured: not checked
  | 'member'
  | 'not_member' // the instance is unknown, or the user is not in it
  | 'unavailable' // Discord could not answer (network, 5xx, 429, or our bot token was refused)
  | 'over_budget'; // this Discord user asked about too many instances this minute

export interface InstanceVerifierDeps {
  appId: string;
  botToken: string;
  logger: {
    warn(
      entry: Record<
        string,
        unknown
      >,
    ): void;
  };
}

interface Members {
  users: string[];
  at: number;
}

type Lookup =
  | {
      kind: 'users';
      users: string[];
    }
  | {
      kind: 'unknown';
    }
  | {
      kind: 'transient';
    };

export interface InstanceVerifier {
  readonly enabled: boolean;
  check(
    discordId: string,
    instanceId: string,
  ): Promise<InstanceCheck>;
  /** Test seam. */
  reset(): void;
}

export function createInstanceVerifier(
  deps: InstanceVerifierDeps,
): InstanceVerifier {
  const enabled =
    Boolean(
      deps.appId &&
      deps.botToken,
    );
  if (
    !enabled
  ) {
    deps.logger.warn(
      {
        event:
          'vibe_room_instance_check_disabled',
        message:
          'DISCORD_ACTIVITY_CLIENT_ID or DISCORD_ACTIVITY_BOT_TOKEN is not set: Discord sockets may join any vibe room instance',
      },
    );
  }

  const members =
    createAuthCache<Members>();
  const unknown =
    createAuthCache<true>();
  const budget =
    createRateLimiter(
      {
        'instance:lookup':
          {
            max: 20,
            windowMs: 60_000,
          },
      },
    );
  const flight =
    createSingleFlight<Lookup>();

  async function lookup(
    instanceId: string,
  ): Promise<Lookup> {
    try {
      const res =
        await fetch(
          `${DISCORD_API}/applications/${encodeURIComponent(deps.appId)}/activity-instances/${encodeURIComponent(instanceId)}`,
          {
            headers:
              {
                Authorization: `Bot ${deps.botToken}`,
              },
            signal:
              AbortSignal.timeout(
                TIMEOUT_MS,
              ),
          },
        );
      if (
        res.status ===
        404
      )
        return {
          kind: 'unknown',
        };
      if (
        res.status ===
          429 ||
        res.status >=
          500 ||
        res.status ===
          401 ||
        res.status ===
          403
      ) {
        // 401/403 is OUR bot token or permissions being wrong: an operator problem, not the caller's.
        if (
          res.status ===
            401 ||
          res.status ===
            403
        ) {
          deps.logger.warn(
            {
              event:
                'vibe_room_instance_lookup_rejected',
              status:
                res.status,
            },
          );
        }
        return {
          kind: 'transient',
        };
      }
      if (
        !res.ok
      )
        return {
          kind: 'unknown',
        };
      const body =
        (await res.json()) as {
          users?: unknown;
        };
      if (
        !Array.isArray(
          body?.users,
        )
      )
        return {
          kind: 'transient',
        };
      return {
        kind: 'users',
        users:
          body.users.filter(
            (
              u,
            ): u is string =>
              typeof u ===
              'string',
          ),
      };
    } catch {
      return {
        kind: 'transient',
      };
    }
  }

  return {
    enabled,
    async check(
      discordId,
      instanceId,
    ) {
      if (
        !enabled
      )
        return 'skipped';
      if (
        unknown.get(
          instanceId,
        )
      )
        return 'not_member';

      const cached =
        members.get(
          instanceId,
        );
      if (
        cached?.users.includes(
          discordId,
        )
      )
        return 'member';
      if (
        cached &&
        Date.now() -
          cached.at <
          REFRESH_AFTER_MS
      )
        return 'not_member';

      if (
        !budget.check(
          discordId,
          'instance:lookup',
        )
      )
        return 'over_budget';

      const result =
        await flight(
          instanceId,
          () =>
            lookup(
              instanceId,
            ),
        );
      if (
        result.kind ===
        'transient'
      )
        return 'unavailable';
      if (
        result.kind ===
        'unknown'
      ) {
        unknown.set(
          instanceId,
          true,
          Date.now() +
            UNKNOWN_TTL_MS,
        );
        return 'not_member';
      }
      members.set(
        instanceId,
        {
          users:
            result.users,
          at: Date.now(),
        },
        Date.now() +
          MEMBERS_TTL_MS,
      );
      return result.users.includes(
        discordId,
      )
        ? 'member'
        : 'not_member';
    },
    reset() {
      members.clear();
      unknown.clear();
      budget.reset();
    },
  };
}
