import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  CONCURRENCY,
  loadZones,
  ZONE_TIMEOUT_MS,
  type LoaderDeps,
} from './loader';
import type { Zone } from './types';

function zonesOf(
  n: number,
): Zone[] {
  return Array.from(
    {
      length:
        n,
    },
    (
      _,
      i,
    ) => ({
      file: `z${i}.mp3`,
      keyCenter:
        48 +
        i,
      tuneCents: 0,
      gainDb: 0,
      startOffsetS: 0,
      durationS: 1,
    }),
  );
}

function hungDeps(): LoaderDeps & {
  fetched: string[];
} {
  const fetched: string[] =
    [];
  return {
    fetched,
    fetch:
      (
        url,
      ) => {
        fetched.push(
          url,
        );
        return new Promise(
          () => {},
        );
      },
    decode:
      () =>
        Promise.reject(
          new Error(
            'never reached',
          ),
        ),
    sleep:
      () =>
        Promise.resolve(),
    crossOrigin:
      () =>
        false,
    online:
      () =>
        true,
  };
}

describe('loadZones against a hung server', () => {
  beforeEach(
    () => {
      vi.useFakeTimers();
    },
  );
  afterEach(
    () => {
      vi.useRealTimers();
    },
  );

  it('settles within one zone timeout, however many zones there are', async () => {
    const zones =
      zonesOf(
        CONCURRENCY *
          4 -
          1,
      );
    const deps =
      hungDeps();
    const heard: string[] =
      [];
    let settled = false;
    const done =
      loadZones(
        zones,
        (
          z,
        ) =>
          z.file,
        deps,
        (
          z,
          r,
        ) => {
          if (
            !r.ok
          )
            heard.push(
              z.file,
            );
        },
      ).then(
        (
          r,
        ) => {
          settled = true;
          return r;
        },
      );

    await vi.advanceTimersByTimeAsync(
      ZONE_TIMEOUT_MS +
        50,
    );

    expect(
      settled,
    ).toBe(
      true,
    );
    const result =
      await done;
    // Only the first batch was ever requested; nothing new starts after a timeout.
    expect(
      deps.fetched,
    ).toHaveLength(
      CONCURRENCY,
    );
    expect(
      result
        .buffers
        .size,
    ).toBe(
      0,
    );
    expect(
      result
        .failures
        .size,
    ).toBe(
      zones.length,
    );
    expect(
      [
        ...result.failures.values(),
      ].every(
        (
          r,
        ) =>
          r ===
          'network',
      ),
    ).toBe(
      true,
    );
    expect(
      heard.sort(),
    ).toEqual(
      zones
        .map(
          (
            z,
          ) =>
            z.file,
        )
        .sort(),
    );
  });
});
