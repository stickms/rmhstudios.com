/**
 * One retry policy for the whole bot (port of go-services/internal/discordbot/retry.go).
 *
 * Everything this package talks to is a network that is sometimes down: the Discord gateway,
 * Discord's REST API, DeepSeek, and Postgres. A single 429, a dropped connection or a DNS blip
 * must not lose whatever was in flight — a day's summary, a weekly digest, a message row the
 * gateway will never redeliver.
 *
 * Retrying is only safe for an operation that either did not happen or can happen twice
 * harmlessly. That is a property of the CALL SITE, not of the error, so callers say so: wrap an
 * error with `permanent()` and the loop stops immediately. The default is to retry.
 *
 * Every schedule has a hard attempt cap and jitter: unbounded retries turn a dead dependency into
 * a hot loop, and several clients reconnecting on the same exponential curve are a thundering herd.
 */

/** A bounded exponential backoff schedule. */
export interface RetryPolicy {
  /** TOTAL tries, not retries. 1 = call once, never retry. */
  attempts: number;
  /** First delay (ms); each later one doubles it, capped at `maxMs`. */
  baseMs: number;
  maxMs: number;
}

/** A request somebody is waiting for (a completion, a channel post). Short and few. */
export const RETRY_API: RetryPolicy =
  {
    attempts: 4,
    baseMs: 500,
    maxMs: 8_000,
  };
/** A Postgres statement: more attempts, tighter base — a pool blip is hundreds of ms. */
export const RETRY_DB: RetryPolicy =
  {
    attempts: 5,
    baseMs: 100,
    maxMs: 2_000,
  };
/** Opening the Discord gateway at boot. Long and patient: a minute of Discord being away must not kill the worker. */
export const RETRY_GATEWAY: RetryPolicy =
  {
    attempts: 8,
    baseMs: 2_000,
    maxMs: 60_000,
  };

const PERMANENT =
  Symbol.for(
    'rmh.discordbot.permanent',
  );
const RETRY_AFTER =
  Symbol.for(
    'rmh.discordbot.retryAfterMs',
  );

type Tagged =
  Error & {
    [PERMANENT]?: true;
    [RETRY_AFTER]?: number;
  };

function asError(
  err: unknown,
): Tagged {
  return (
    err instanceof
    Error
      ? err
      : new Error(
          String(
            err,
          ),
        )
  ) as Tagged;
}

/** Mark a failure retrying cannot fix (a bad key, a malformed request, a missing channel). */
export function permanent(
  err: unknown,
): Error {
  const e =
    asError(
      err,
    );
  e[
    PERMANENT
  ] =
    true;
  return e;
}

export function isPermanent(
  err: unknown,
): boolean {
  return (
    err instanceof
      Error &&
    (
      err as Tagged
    )[
      PERMANENT
    ] ===
      true
  );
}

/** Attach the wait a server asked for (Retry-After). Longer than the policy's max is respected. */
export function retryAfter(
  err: unknown,
  afterMs: number,
): Error {
  const e =
    asError(
      err,
    );
  e[
    RETRY_AFTER
  ] =
    afterMs;
  return e;
}

export function retryAfterMs(
  err: unknown,
): number {
  return err instanceof
    Error
    ? ((
        err as Tagged
      )[
        RETRY_AFTER
      ] ??
        0)
    : 0;
}

/**
 * The delay before retry `n` (1-indexed: the wait after the first failure is backoff(1)).
 *
 * Same draw as the Go original: uniform in [delay/2, 1.5·delay), where delay is the doubled
 * base capped at max. `rand` returns [0, 1) and is injectable for tests.
 */
export function backoff(
  policy: RetryPolicy,
  n: number,
  rand: () => number = Math.random,
): number {
  if (
    n <
    1
  )
    n = 1;
  let delay =
    policy.baseMs;
  for (
    let i = 1;
    i <
      n &&
    delay <
      policy.maxMs;
    i++
  )
    delay *= 2;
  if (
    delay >
    policy.maxMs
  )
    delay =
      policy.maxMs;
  if (
    delay <=
    0
  )
    return 0;
  return (
    Math.floor(
      rand() *
        delay,
    ) +
    Math.floor(
      delay /
        2,
    )
  );
}

/** What the retry loop needs from a logger; null is silent. */
export interface RetryLogger {
  warn(
    fields: Record<
      string,
      unknown
    >,
  ): void;
}

/** Sleep that resolves early (false) when the signal aborts. */
export function sleep(
  ms: number,
  signal?: AbortSignal,
): Promise<boolean> {
  return new Promise(
    (
      resolve,
    ) => {
      if (
        signal?.aborted
      )
        return resolve(
          false,
        );
      const timer =
        setTimeout(
          () => {
            signal?.removeEventListener(
              'abort',
              onAbort,
            );
            resolve(
              true,
            );
          },
          ms,
        );
      const onAbort =
        () => {
          clearTimeout(
            timer,
          );
          resolve(
            false,
          );
        };
      signal?.addEventListener(
        'abort',
        onAbort,
        {
          once: true,
        },
      );
    },
  );
}

export interface RetryOptions {
  logger?: RetryLogger | null;
  signal?: AbortSignal;
  /** Test seam: the jitter source and the sleeper. */
  rand?: () => number;
  sleeper?: (
    ms: number,
    signal?: AbortSignal,
  ) => Promise<boolean>;
}

/**
 * Call `fn` until it succeeds, gives up, or the signal aborts. A cancelled signal is a shutdown,
 * not a failure to report: the last error (or an AbortError) is thrown without another try.
 */
export async function withRetry<
  T,
>(
  label: string,
  policy: RetryPolicy,
  fn: (
    signal?: AbortSignal,
  ) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts =
    Math.max(
      1,
      policy.attempts,
    );
  const wait =
    opts.sleeper ??
    sleep;
  let lastErr: unknown;
  for (
    let attempt = 1;
    attempt <=
    attempts;
    attempt++
  ) {
    if (
      opts
        .signal
        ?.aborted
    ) {
      throw (
        lastErr ??
        abortError()
      );
    }
    try {
      return await fn(
        opts.signal,
      );
    } catch (err) {
      lastErr =
        err;
      if (
        isPermanent(
          err,
        ) ||
        attempt ===
          attempts
      )
        throw err;
      let delay =
        backoff(
          policy,
          attempt,
          opts.rand,
        );
      const after =
        retryAfterMs(
          err,
        );
      if (
        after >
        delay
      )
        delay =
          after;
      opts.logger?.warn(
        {
          event:
            'discord_bot.retrying',
          op: label,
          attempt,
          of: attempts,
          inMs: delay,
          err:
            err instanceof
            Error
              ? err.message
              : String(
                  err,
                ),
        },
      );
      const slept =
        await wait(
          delay,
          opts.signal,
        );
      if (
        !slept
      )
        throw err;
    }
  }
  throw lastErr;
}

function abortError(): Error {
  const e =
    new Error(
      'aborted',
    );
  e.name =
    'AbortError';
  return e;
}

/** 429 and 5xx are transient; 408/409 too (DeepSeek sheds load with both). Other 4xx repeat. */
export function retryableStatus(
  code: number,
): boolean {
  if (
    code ===
      408 ||
    code ===
      409 ||
    code ===
      429
  )
    return true;
  return (
    code >=
    500
  );
}

/**
 * The Retry-After header in either legal form (seconds, or an HTTP date), as ms. Zero when
 * absent or unparseable, which leaves the backoff schedule in charge.
 */
export function parseRetryAfter(
  value:
    | string
    | null
    | undefined,
  now: number = Date.now(),
): number {
  if (
    !value
  )
    return 0;
  const trimmed =
    value.trim();
  if (
    /^-?\d+$/.test(
      trimmed,
    )
  ) {
    const secs =
      Number(
        trimmed,
      );
    return secs <
      0
      ? 0
      : secs *
          1000;
  }
  const when =
    Date.parse(
      value,
    );
  if (
    Number.isFinite(
      when,
    ) &&
    /[a-z]/i.test(
      value,
    )
  ) {
    const d =
      when -
      now;
    return d >
      0
      ? d
      : 0;
  }
  return 0;
}
