import {
  useEffect,
  useState,
} from 'react';
import { Link } from '@tanstack/react-router';
import { Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { api } from '@/lib/contract/client';
import { listLiveSpacesApi } from '@/lib/spaces/spaces.contract';
import type { LiveSpaceSummary } from '@/lib/spaces/types';
import { HorizontalScroller } from '@/components/ui/horizontal-scroller';
import { useArrival } from '@/components/ui/arrive';
import { useStableListMotion } from '@/hooks/useStableListMotion';

/**
 * "Live now" rail — the platform's single liveness surface (feed + community
 * pages). Fetches `/api/spaces/live` and renders a compact horizontal strip.
 * Renders nothing when there are no live spaces so it never adds empty chrome.
 */
export function LiveNowRail({
  className,
}: {
  className?: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'site',
    );
  const [
    spaces,
    setSpaces,
  ] =
    useState<
      LiveSpaceSummary[]
    >(
      [],
    );
  const enteringSpaces =
    useStableListMotion(
      spaces.map(
        (
          space,
        ) =>
          space.id,
      ),
      {
        skipFirstAddition: true,
      },
    );

  useEffect(() => {
    let active = true;
    const load =
      () => {
        api(
          listLiveSpacesApi,
        )
          .then(
            (
              data,
            ) => {
              if (
                active
              )
                setSpaces(
                  data.spaces ??
                    [],
                );
            },
          )
          .catch(
            () => {},
          );
      };
    load();
    // Light polling so the rail reflects new/ended spaces without a socket.
    const id =
      window.setInterval(
        load,
        30_000,
      );
    return () => {
      active = false;
      window.clearInterval(
        id,
      );
    };
  }, []);

  // Steel M9: the rail is fetched after paint and appears in a gap, so it fades in.
  const arrival =
    useArrival(
      spaces.length >
        0,
    );
  if (
    spaces.length ===
    0
  )
    return null;

  return (
    <section
      className={cn(
        'surface-card mx-3 mt-3 rounded-site p-4',
        className,
        arrival,
      )}
      aria-label={t(
        'live-now',
        {
          defaultValue:
            'Live now',
        },
      )}
    >
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-site-danger">
        <span
          className="h-2 w-2 animate-pulse-settle rounded-full bg-site-danger"
          aria-hidden
        />
        {t(
          'live-now',
          {
            defaultValue:
              'Live now',
          },
        )}
      </div>
      <HorizontalScroller
        aria-label={t(
          'live-spaces',
          {
            defaultValue:
              'Live spaces',
          },
        )}
        surface="none"
      >
        {spaces.map(
          (
            s,
          ) => (
            <Link
              key={
                s.id
              }
              to="/spaces/$id"
              params={{
                id: s.id,
              }}
              className={cn(
                'surface-card surface-press flex w-56 shrink-0 flex-col gap-1 p-3 transition-colors hover:border-site-text',
                enteringSpaces.has(
                  s.id,
                ) &&
                  'arrive',
              )}
            >
              <div className="flex items-center gap-1.5 text-xs text-site-text-muted">
                <Radio
                  className="h-3.5 w-3.5 text-site-accent"
                  aria-hidden
                />
                {s
                  .community
                  ?.name ??
                  s
                    .host
                    .name ??
                  t(
                    'space-fallback-host',
                    {
                      defaultValue:
                        'Space',
                    },
                  )}
              </div>
              <div className="line-clamp-2 text-sm font-semibold text-site-text">
                {
                  s.title
                }
              </div>
            </Link>
          ),
        )}
      </HorizontalScroller>
    </section>
  );
}
