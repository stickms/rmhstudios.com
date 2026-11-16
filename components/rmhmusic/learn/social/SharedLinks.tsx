/**
 * The learner's shared result links (RMH Music Phase 6, plan 1.4), on Friends and sharing: each
 * live link's subject, when it was shared and until when it works, and Stop sharing; then Stop
 * sharing all. Rows on rules, no badges. The list comes from the route loader
 * (`musicSharesQuery`); a stop refetches it. The switches above never stop a link, and the
 * section says so.
 */
import { useState } from 'react';
import {
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { musicSharesQuery } from '@/lib/music-social/social.queries';
import {
  stopAllSharesApi,
  stopShareApi,
} from '@/lib/music-social/share.contract';
import { TEXT_BUTTON } from '../buttons';
import {
  shareExpiryLine,
  shareLinkLabel,
} from './share-text';

export function SharedLinks() {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const queryClient =
    useQueryClient();
  const {
    data,
    isPending,
    isError,
    refetch,
  } =
    useQuery(
      musicSharesQuery(),
    );
  const [
    busy,
    setBusy,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );
  const [
    failed,
    setFailed,
  ] =
    useState(
      false,
    );

  function stop(
    id:
      | string
      | 'all',
  ) {
    setBusy(
      id,
    );
    setFailed(
      false,
    );
    const call =
      id ===
      'all'
        ? api(
            stopAllSharesApi,
            {},
          )
        : api(
            stopShareApi,
            {
              params:
                {
                  id,
                },
            },
          );
    call
      .then(
        () =>
          queryClient.invalidateQueries(
            {
              queryKey:
                [
                  'rmhmusic',
                  'shares',
                ],
            },
          ),
      )
      .catch(
        () =>
          setFailed(
            true,
          ),
      )
      .finally(
        () =>
          setBusy(
            null,
          ),
      );
  }

  const shares =
    data?.shares ??
    [];
  return (
    <section
      className="space-y-2"
      aria-labelledby="rmm-shared-links"
    >
      <h2
        id="rmm-shared-links"
        className="rmm-display text-2xl leading-8 text-app-text"
      >
        {t(
          'shares-heading',
          {
            defaultValue:
              'Shared links',
          },
        )}
      </h2>
      <p className="text-sm leading-5 text-app-text-muted">
        {t(
          'shares-about',
          {
            defaultValue:
              'Anyone with one of these links can see that result until it stops working. The switches above do not stop them; Stop sharing does.',
          },
        )}
      </p>
      {isPending ? (
        <p
          role="status"
          className="rmm-sheet p-4 text-base leading-6 text-app-text-muted"
        >
          {t(
            'shares-loading',
            {
              defaultValue:
                'Loading your links…',
            },
          )}
        </p>
      ) : isError ? (
        <div className="rmm-sheet space-y-2 p-4">
          <p className="text-app-text">
            {t(
              'shares-failed',
              {
                defaultValue:
                  "Couldn't load your links.",
              },
            )}
          </p>
          <button
            type="button"
            onClick={() =>
              void refetch()
            }
            className={
              TEXT_BUTTON
            }
          >
            {t(
              'retry',
              {
                defaultValue:
                  'Try again',
              },
            )}
          </button>
        </div>
      ) : shares.length ===
        0 ? (
        <p className="rmm-sheet p-4 text-base leading-6 text-app-text-muted">
          {t(
            'shares-empty',
            {
              defaultValue:
                'You are not sharing any results. Share one from a Daily result or a song best.',
            },
          )}
        </p>
      ) : (
        <>
          <ul className="rmm-sheet divide-y divide-app-border">
            {shares.map(
              (
                s,
              ) => (
                <li
                  key={
                    s.id
                  }
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3"
                >
                  <div className="min-w-0">
                    <a
                      href={
                        s.path
                      }
                      className="text-base leading-6 text-app-text underline decoration-1 underline-offset-4"
                    >
                      {shareLinkLabel(
                        t,
                        i18n.language,
                        s.payload,
                      )}
                    </a>
                    <p className="text-sm leading-5 text-app-text-muted">
                      {[
                        s.showName
                          ? t(
                              'shares-with-name',
                              {
                                defaultValue:
                                  'With your name',
                              },
                            )
                          : t(
                              'shares-without-name',
                              {
                                defaultValue:
                                  'Without your name',
                              },
                            ),
                        shareExpiryLine(
                          t,
                          i18n.language,
                          s.expiresAt,
                        ),
                      ].join(
                        ' · ',
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={
                      busy !==
                      null
                    }
                    onClick={() =>
                      stop(
                        s.id,
                      )
                    }
                    className={
                      TEXT_BUTTON
                    }
                  >
                    {t(
                      'shares-stop',
                      {
                        defaultValue:
                          'Stop sharing',
                      },
                    )}
                  </button>
                </li>
              ),
            )}
          </ul>
          <button
            type="button"
            disabled={
              busy !==
              null
            }
            onClick={() =>
              stop(
                'all',
              )
            }
            className={
              TEXT_BUTTON
            }
          >
            {t(
              'shares-stop-all',
              {
                defaultValue:
                  'Stop sharing all',
              },
            )}
          </button>
        </>
      )}
      {failed ? (
        <p
          role="status"
          className="text-sm leading-5 text-app-danger"
        >
          {t(
            'shares-stop-failed',
            {
              defaultValue:
                "Couldn't stop sharing. Try again.",
            },
          )}
        </p>
      ) : null}
    </section>
  );
}
