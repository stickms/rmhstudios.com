import {
  lazy,
  Suspense,
  useEffect,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import {
  Play,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useArrival } from '@/components/ui/arrive';
import { useNearViewport } from '@/hooks/useNearViewport';
import {
  fetchPostVibe,
  fetchVibeRunnable,
} from '@/lib/rmhvibe/vibe-embed-client';
import type { ResOf } from '@/lib/contract/endpoint';
import type { postVibeApi } from '@/lib/feed/rmhark-actions.contract';
import type { vibePageApi } from '@/lib/rmhvibe/vibe-page.contract';
import { cn } from '@/lib/utils';

// The frame, the bridge and vibe.css come only with the first Run.
const VibeEmbedRunner =
  lazy(
    () =>
      import('@/components/rmhvibe/VibeEmbedRunner'),
  );

type PostVibe =
  ResOf<
    typeof postVibeApi
  >;
type Runnable =
  ResOf<
    typeof vibePageApi
  >;

/**
 * A vibe pinned to a post. Nothing is fetched until the card nears the viewport and no
 * frame exists until the reader presses Run; the vibe then runs in an opaque-origin
 * sandbox, in the same picture box as the poster. A page or version that is gone renders nothing.
 */
export function VibeEmbedCard({
  postId,
}: {
  postId: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-rmhvibe',
    );
  const {
    ref,
    visible,
  } =
    useNearViewport<HTMLDivElement>(
      '400px 0px',
    );
  const [
    vibe,
    setVibe,
  ] =
    useState<PostVibe | null>(
      null,
    );
  const [
    run,
    setRun,
  ] =
    useState<Runnable | null>(
      null,
    );
  const [
    loading,
    setLoading,
  ] =
    useState(
      false,
    );
  const [
    failed,
    setFailed,
  ] =
    useState(
      false,
    );
  const arrival =
    useArrival(
      vibe !==
        null,
    );

  useEffect(() => {
    if (
      !visible
    )
      return;
    let cancelled = false;
    fetchPostVibe(
      postId,
    ).then(
      (
        v,
      ) => {
        if (
          !cancelled
        )
          setVibe(
            v,
          );
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [
    visible,
    postId,
  ]);

  const start =
    async () => {
      if (
        !vibe
      )
        return;
      setLoading(
        true,
      );
      setFailed(
        false,
      );
      try {
        setRun(
          await fetchVibeRunnable(
            vibe.slug,
            vibe.versionId,
          ),
        );
      } catch {
        setFailed(
          true,
        );
      } finally {
        setLoading(
          false,
        );
      }
    };

  const title =
    vibe?.title ||
    t(
      'vibe-untitled',
      {
        defaultValue:
          'Vibe',
      },
    );

  return (
    <div
      ref={
        ref
      }
      className={cn(
        vibe &&
          'mt-3 flex flex-col gap-2',
        arrival,
      )}
    >
      {vibe && (
        <>
          <div
            className={cn(
              'relative w-full overflow-hidden rounded-site border border-site-border bg-site-bg-subtle',
              vibe.kind ===
                'widget'
                ? 'aspect-[4/3]'
                : 'aspect-[16/10]',
            )}
          >
            {run ? (
              <Suspense
                fallback={
                  null
                }
              >
                <VibeEmbedRunner
                  slug={
                    run.slug
                  }
                  html={
                    run.html
                  }
                  title={
                    run.title
                  }
                  tweakSpec={
                    run.tweakSpec
                  }
                  tweakValues={
                    run.tweakValues
                  }
                />
              </Suspense>
            ) : (
              vibe.thumbnailUrl && (
                <img
                  src={
                    vibe.thumbnailUrl
                  }
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
              )
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="t-body min-w-0 truncate font-medium text-site-text">
              {
                title
              }
            </p>
            <div className="flex shrink-0 items-center gap-3">
              {run ? (
                <Button
                  size="xs"
                  variant="default"
                  onClick={(
                    e,
                  ) => {
                    e.stopPropagation();
                    setRun(
                      null,
                    );
                  }}
                >
                  <Square />
                  {t(
                    'vibe-stop',
                    {
                      defaultValue:
                        'Stop',
                    },
                  )}
                </Button>
              ) : (
                <Button
                  size="xs"
                  variant="default"
                  disabled={
                    loading
                  }
                  onClick={(
                    e,
                  ) => {
                    e.stopPropagation();
                    void start();
                  }}
                >
                  <Play />
                  {loading
                    ? t(
                        'vibe-loading',
                        {
                          defaultValue:
                            'Loading…',
                        },
                      )
                    : t(
                        'vibe-run',
                        {
                          defaultValue:
                            'Run',
                        },
                      )}
                </Button>
              )}
              <Link
                to="/v/$slug"
                params={{
                  slug: vibe.slug,
                }}
                onClick={(
                  e,
                ) =>
                  e.stopPropagation()
                }
                className="t-body text-site-text hover:underline"
              >
                {t(
                  'vibe-open',
                  {
                    defaultValue:
                      'Open',
                  },
                )}
              </Link>
            </div>
          </div>
          {failed && (
            <p className="t-meta text-site-danger">
              {t(
                'vibe-run-failed',
                {
                  defaultValue:
                    'Could not load the vibe.',
                },
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}
