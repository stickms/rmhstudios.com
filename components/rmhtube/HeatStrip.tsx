/** T3: a thin "most replayed" heat strip under the seek bar. Fetched when idle; absent until there is data. */
import {
  useEffect,
  useState,
} from 'react';
import { api } from '@/lib/contract/client';
import { getHeatApi } from '@/lib/rmhtube/heat.contract';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import {
  HEAT_BUCKET_SEC,
  mediaKey,
} from '@/lib/rmhtube/party';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

const COLUMNS = 120;

export default function HeatStrip({
  duration,
}: {
  duration: number;
}) {
  const url =
    useRmhTubeStore(
      (
        s,
      ) =>
        s
          .room
          ?.currentItem
          ?.url ??
        null,
    );
  const [
    buckets,
    setBuckets,
  ] =
    useState<
      {
        b: number;
        n: number;
      }[]
    >(
      [],
    );
  // Fetched after the player shows: the strip fades in when it lands (M9).
  const arrival =
    useArrival(
      buckets.length >
        0,
    );

  useEffect(() => {
    setBuckets(
      [],
    );
    if (
      !url
    )
      return;
    let cancelled = false;
    const id =
      setTimeout(
        () => {
          api(
            getHeatApi,
            {
              query:
                {
                  url: mediaKey(
                    url,
                  ),
                },
            },
          )
            .then(
              (
                j,
              ) =>
                !cancelled &&
                setBuckets(
                  j.buckets,
                ),
            )
            .catch(
              () => {},
            );
        },
        1500,
      );
    return () => {
      cancelled = true;
      clearTimeout(
        id,
      );
    };
  }, [
    url,
  ]);

  if (
    buckets.length ===
      0 ||
    duration <=
      0
  )
    return null;
  const cols =
    Math.min(
      COLUMNS,
      Math.ceil(
        duration /
          HEAT_BUCKET_SEC,
      ),
    );
  const sums =
    new Array<number>(
      cols,
    ).fill(
      0,
    );
  for (const {
    b,
    n,
  } of buckets) {
    const i =
      Math.min(
        cols -
          1,
        Math.floor(
          ((b *
            HEAT_BUCKET_SEC) /
            duration) *
            cols,
        ),
      );
    if (
      i >=
      0
    )
      sums[
        i
      ] =
        (sums[
          i
        ] ??
          0) +
        n;
  }
  const max =
    Math.max(
      ...sums,
    );
  if (
    max <=
    0
  )
    return null;
  const stops =
    sums.map(
      (
        v,
        i,
      ) => {
        const c =
          v >
          0
            ? `color-mix(in srgb, var(--app-accent) ${Math.round(25 + (v / max) * 75)}%, transparent)`
            : 'transparent';
        return `${c} ${(i / cols) * 100}% ${((i + 1) / cols) * 100}%`;
      },
    );
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-0 -bottom-1.5 h-1',
        arrival,
      )}
      style={{
        backgroundImage: `linear-gradient(to right, ${stops.join(',')})`,
      }}
    />
  );
}
