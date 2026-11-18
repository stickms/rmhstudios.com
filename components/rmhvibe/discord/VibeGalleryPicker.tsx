/** Browse view of the Vibes Activity: search + "Load more". Only the host can pick; others browse read-only. */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  Search,
} from 'lucide-react';
import type { VibeCard } from '@/lib/rmhvibe/vibe.server';
import { fetchVibeGallery } from '@/lib/rmhvibe/vibe-activity-client';
import { displayThumbUrl } from './vibe-activity-utils';

const SEARCH_DEBOUNCE_MS = 300;

export function VibeGalleryPicker({
  canPick,
  hostName,
  onPick,
}: {
  canPick: boolean;
  hostName:
    | string
    | null;
  onPick: (
    slug: string,
  ) => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'r-discord',
    );
  const [
    query,
    setQuery,
  ] =
    useState(
      '',
    );
  const [
    debounced,
    setDebounced,
  ] =
    useState(
      '',
    );
  const [
    items,
    setItems,
  ] =
    useState<
      VibeCard[]
    >(
      [],
    );
  const [
    cursor,
    setCursor,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );
  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );
  const [
    failed,
    setFailed,
  ] =
    useState(
      false,
    );
  const generation =
    useRef(
      0,
    );
  const hostFallback =
    t(
      'vibes-host-fallback',
      {
        defaultValue:
          'the host',
      },
    );

  useEffect(() => {
    const id =
      window.setTimeout(
        () =>
          setDebounced(
            query.trim(),
          ),
        SEARCH_DEBOUNCE_MS,
      );
    return () =>
      window.clearTimeout(
        id,
      );
  }, [
    query,
  ]);

  const load =
    useCallback(
      (
        q: string,
        after:
          | string
          | null,
      ) => {
        const gen =
          ++generation.current;
        setLoading(
          true,
        );
        setFailed(
          false,
        );
        fetchVibeGallery(
          {
            ...(q
              ? {
                  q,
                }
              : {}),
            ...(after
              ? {
                  cursor:
                    after,
                }
              : {}),
          },
        )
          .then(
            (
              page,
            ) => {
              if (
                gen !==
                generation.current
              )
                return;
              setItems(
                (
                  prev,
                ) =>
                  after
                    ? [
                        ...prev,
                        ...page.items,
                      ]
                    : page.items,
              );
              setCursor(
                page.nextCursor,
              );
            },
          )
          .catch(
            () => {
              if (
                gen ===
                generation.current
              )
                setFailed(
                  true,
                );
            },
          )
          .finally(
            () => {
              if (
                gen ===
                generation.current
              )
                setLoading(
                  false,
                );
            },
          );
      },
      [],
    );

  useEffect(() => {
    load(
      debounced,
      null,
    );
  }, [
    debounced,
    load,
  ]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4">
      <div className="mx-auto w-full max-w-3xl">
        <p
          className="text-sm text-[#b5bac1] mb-3"
          role="status"
        >
          {canPick
            ? t(
                'vibes-pick-prompt',
                {
                  defaultValue:
                    'Pick a vibe for everyone in this channel',
                },
              )
            : t(
                'vibes-waiting-for-pick',
                {
                  defaultValue:
                    'Waiting for {{name}} to pick a vibe',
                  name:
                    hostName ??
                    hostFallback,
                },
              )}
        </p>
        <label className="relative block mb-4">
          <span className="sr-only">
            {t(
              'vibes-search-label',
              {
                defaultValue:
                  'Search vibes',
              },
            )}
          </span>
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#949ba4]"
            aria-hidden
          />
          <input
            type="search"
            value={
              query
            }
            onChange={(
              e,
            ) =>
              setQuery(
                e
                  .target
                  .value,
              )
            }
            placeholder={t(
              'vibes-search-placeholder',
              {
                defaultValue:
                  'Search vibes',
              },
            )}
            className="w-full rounded-lg bg-[#1e1f22] border border-[#3f4147] pl-9 pr-3 py-2 text-sm text-white placeholder:text-[#949ba4] focus:outline-none focus:border-[#5865f2]"
          />
        </label>

        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map(
            (
              card,
            ) => {
              const thumb =
                displayThumbUrl(
                  card.thumbnailUrl,
                );
              const title =
                card.title ||
                card.prompt;
              return (
                <li
                  key={
                    card.slug
                  }
                >
                  <button
                    type="button"
                    disabled={
                      !canPick
                    }
                    onClick={() =>
                      onPick(
                        card.slug,
                      )
                    }
                    className="w-full text-left rounded-xl bg-[#2b2d31] border border-[#3f4147] overflow-hidden enabled:hover:border-[#5865f2]/60 transition-colors disabled:cursor-default"
                  >
                    <div className="aspect-[4/3] bg-[#1e1f22]">
                      {thumb && (
                        <img
                          src={
                            thumb
                          }
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div className="p-2.5">
                      <div className="text-sm font-semibold text-white truncate">
                        {
                          title
                        }
                      </div>
                      {card.description && (
                        <div className="text-xs text-[#949ba4] line-clamp-2">
                          {
                            card.description
                          }
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            },
          )}
        </ul>

        {!loading &&
          !failed &&
          items.length ===
            0 && (
            <p className="text-sm text-[#949ba4] text-center py-8">
              {t(
                'vibes-no-results',
                {
                  defaultValue:
                    'No vibes found',
                },
              )}
            </p>
          )}
        {failed && (
          <p
            className="text-sm text-[#f23f43] text-center py-4"
            role="alert"
          >
            {t(
              'vibes-gallery-failed',
              {
                defaultValue:
                  "Couldn't load vibes",
              },
            )}
          </p>
        )}
        <div className="flex justify-center py-4">
          {loading ? (
            <Loader2
              className="h-5 w-5 animate-spin text-[#5865f2]"
              aria-label={t(
                'vibes-loading',
                {
                  defaultValue:
                    'Loading',
                },
              )}
            />
          ) : (
            (cursor ||
              failed) && (
              <button
                type="button"
                onClick={() =>
                  load(
                    debounced,
                    failed
                      ? null
                      : cursor,
                  )
                }
                className="px-4 py-2 rounded-lg bg-[#2b2d31] border border-[#3f4147] text-sm text-white hover:border-[#5865f2]/60 transition-colors"
              >
                {failed
                  ? t(
                      'vibes-retry',
                      {
                        defaultValue:
                          'Try again',
                      },
                    )
                  : t(
                      'vibes-load-more',
                      {
                        defaultValue:
                          'Load more',
                      },
                    )}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
