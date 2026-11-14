/**
 * The boot-time connection to the durable `redis-state` plane (`REDIS_STATE_URL`),
 * shared by the stores that keep hub state across a restart: rmhbox's lobbies
 * (`server/rmhbox/lobby-store.ts`) and the casino tables
 * (`features/casino/server/table-store.ts`).
 *
 * One attempt, bounded: a hub must always start, so a plane that is down at
 * boot is reported to the caller, which logs it and runs without its store.
 * After a successful connect the client reconnects by itself.
 */

import Redis from 'ioredis';

export const STATE_REDIS_CONNECT_TIMEOUT_MS = 3_000;

export type StateRedisConnection =
  | {
      redis: Redis;
    }
  | {
      error: string;
    };

/**
 * Connect once. Never throws: a failure comes back as `{ error }` with the
 * client already disconnected.
 *
 * @param onError every error the client emits, at boot and afterwards. An
 *   error after boot must never crash the hub; what a failed command means is
 *   decided by the code that issued it.
 */
export async function connectStateRedis(
  url: string,
  onError: (
    err: Error,
  ) => void,
): Promise<StateRedisConnection> {
  const redis =
    new Redis(
      url,
      {
        lazyConnect: true,
        connectTimeout:
          STATE_REDIS_CONNECT_TIMEOUT_MS,
        // Boot only: give up quickly instead of retrying forever if Redis is down.
        retryStrategy:
          () =>
            null,
        // A command that cannot be sent fails instead of waiting: callers bound
        // every write and decide what a failed one means.
        maxRetriesPerRequest: 1,
      },
    );
  redis.on(
    'error',
    onError,
  );

  try {
    await Promise.race(
      [
        redis.connect(),
        new Promise(
          (
            _,
            reject,
          ) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    'connect timeout',
                  ),
                ),
              STATE_REDIS_CONNECT_TIMEOUT_MS +
                500,
            ).unref(),
        ),
      ],
    );
  } catch (err) {
    redis.disconnect();
    return {
      error:
        err instanceof
        Error
          ? err.message
          : String(
              err,
            ),
    };
  }

  // Connected: allow normal reconnects from here on.
  redis.options.retryStrategy =
    (
      times,
    ) =>
      Math.min(
        times *
          200,
        5_000,
      );
  return {
    redis,
  };
}
