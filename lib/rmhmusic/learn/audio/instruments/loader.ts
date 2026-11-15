/**
 * Fetch and decode a set of zones — the only part of the sampled engine that touches the network.
 * Everything it needs from the browser is passed in, so the retry and error rules are unit tests.
 *
 * - At most {@link CONCURRENCY} fetch + decode at a time.
 * - A network failure (a thrown fetch, a 5xx) is retried twice, after 400 ms then 1.2 s.
 * - A zone that takes longer than {@link ZONE_TIMEOUT_MS} is aborted and fails as `network` (not
 *   retried), so a hung server can never hold the instrument's single-flight load open.
 * - A decode failure is not retried (the bytes will not change), and neither is a CORS failure
 *   (deterministic): a cross-origin `fetch` that throws a TypeError while the browser is online is
 *   treated as CORS. The CDN only allows our own origins, so previews and localhost with a CDN
 *   set land here and fall back to the synth by design.
 */
import type { FailReason } from './load-machine';
import type { Zone } from './types';

export const CONCURRENCY = 4;
export const RETRY_DELAYS_MS: readonly number[] =
  [
    400,
    1200,
  ];
/**
 * How long one zone's request may take, response and body together (ms). Past it the request is
 * aborted and the zone fails as `network`, without a retry: a server that hangs once is likely to
 * hang again, and the load must settle (`failed`) so the single flight ends and a later load by
 * the learner can try again.
 */
export const ZONE_TIMEOUT_MS = 10_000;

/** A zone request that ran past {@link ZONE_TIMEOUT_MS}. */
class ZoneTimeout extends Error {}

export interface LoaderDeps {
  /** `signal` aborts the request when it runs past {@link ZONE_TIMEOUT_MS}. */
  fetch(
    url: string,
    signal?: AbortSignal,
  ): Promise<{
    ok: boolean;
    status: number;
    arrayBuffer(): Promise<ArrayBuffer>;
  }>;
  decode(
    data: ArrayBuffer,
  ): Promise<AudioBuffer>;
  sleep(
    ms: number,
  ): Promise<void>;
  /** Whether `url` is on another origin than the page. */
  crossOrigin(
    url: string,
  ): boolean;
  online(): boolean;
}

export interface ZoneResult {
  buffers: Map<
    string,
    AudioBuffer
  >;
  failures: Map<
    string,
    FailReason
  >;
}

export function classifyFetchError(
  err: unknown,
  ctx: {
    crossOrigin: boolean;
    online: boolean;
  },
): FailReason {
  if (
    err instanceof
      TypeError &&
    ctx.crossOrigin &&
    ctx.online
  )
    return 'cors';
  return 'network';
}

/** One zone: its buffer, or why not. */
export async function loadZone(
  zone: Zone,
  url: string,
  deps: LoaderDeps,
): Promise<
  | {
      ok: true;
      buffer: AudioBuffer;
    }
  | {
      ok: false;
      reason: FailReason;
    }
> {
  let bytes: ArrayBuffer | null =
    null;
  let reason: FailReason =
    'network';
  for (
    let attempt = 0;
    attempt <=
    RETRY_DELAYS_MS.length;
    attempt++
  ) {
    // One deadline per attempt: the abort stops a real request, and the race settles even a fetch
    // (or body) that ignores the signal and never answers.
    const controller =
      new AbortController();
    let timer:
      | ReturnType<
          typeof setTimeout
        >
      | undefined;
    const deadline =
      new Promise<never>(
        (
          _,
          reject,
        ) => {
          timer =
            setTimeout(
              () => {
                controller.abort();
                reject(
                  new ZoneTimeout(),
                );
              },
              ZONE_TIMEOUT_MS,
            );
        },
      );
    deadline.catch(
      () => {},
    );
    try {
      const res =
        await Promise.race(
          [
            deps.fetch(
              url,
              controller.signal,
            ),
            deadline,
          ],
        );
      if (
        !res.ok
      ) {
        reason =
          'network';
        if (
          res.status <
          500
        )
          break;
      } else {
        bytes =
          await Promise.race(
            [
              res.arrayBuffer(),
              deadline,
            ],
          );
        break;
      }
    } catch (err) {
      if (
        err instanceof
        ZoneTimeout
      ) {
        reason =
          'network';
        break;
      }
      reason =
        classifyFetchError(
          err,
          {
            crossOrigin:
              deps.crossOrigin(
                url,
              ),
            online:
              deps.online(),
          },
        );
      if (
        reason ===
        'cors'
      )
        break;
    } finally {
      clearTimeout(
        timer,
      );
    }
    if (
      attempt <
      RETRY_DELAYS_MS.length
    )
      await deps.sleep(
        RETRY_DELAYS_MS[
          attempt
        ],
      );
  }
  if (
    !bytes
  )
    return {
      ok: false,
      reason,
    };
  try {
    return {
      ok: true,
      buffer:
        await deps.decode(
          bytes,
        ),
    };
  } catch {
    return {
      ok: false,
      reason:
        'decode',
    };
  }
}

/** Every zone, {@link CONCURRENCY} at a time; `onZone` hears each as it settles. */
export async function loadZones(
  zones: readonly Zone[],
  urlOf: (
    zone: Zone,
  ) => string,
  deps: LoaderDeps,
  onZone: (
    zone: Zone,
    result:
      | {
          ok: true;
        }
      | {
          ok: false;
          reason: FailReason;
        },
  ) => void = () => {},
): Promise<ZoneResult> {
  const result: ZoneResult =
    {
      buffers:
        new Map(),
      failures:
        new Map(),
    };
  let next = 0;
  const worker =
    async () => {
      while (
        next <
        zones.length
      ) {
        const zone =
          zones[
            next++
          ];
        const r =
          await loadZone(
            zone,
            urlOf(
              zone,
            ),
            deps,
          );
        if (
          r.ok
        ) {
          result.buffers.set(
            zone.file,
            r.buffer,
          );
          onZone(
            zone,
            {
              ok: true,
            },
          );
        } else {
          result.failures.set(
            zone.file,
            r.reason,
          );
          onZone(
            zone,
            {
              ok: false,
              reason:
                r.reason,
            },
          );
        }
      }
    };
  await Promise.all(
    Array.from(
      {
        length:
          Math.min(
            CONCURRENCY,
            zones.length,
          ),
      },
      worker,
    ),
  );
  return result;
}
