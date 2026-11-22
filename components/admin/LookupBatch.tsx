import {
  useState,
  type FormEvent,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { useCopyFallback } from '@/components/ui/copy-fallback';
import {
  LookupResultsTable,
  resultsToText,
} from '@/components/admin/LookupResultsTable';
import { api } from '@/lib/contract/client';
import { adminLookupBatchApi } from '@/lib/admin/lookup.contract';
import {
  MAX_BATCH_ITEMS,
  classifyLookup,
  splitLookupInput,
} from '@/lib/admin/lookup';

declare module '@tanstack/react-router' {
  interface HistoryState {
    /** Items the hub's field hands to the lookup page without writing them to the address. */
    lookupItems?: string[];
  }
}

/**
 * The lookup box and its results. One item that is not an e-mail address writes `?q=` so the result
 * can be shared by link; an e-mail address, or several items, are kept in memory and never reach the
 * URL. Every lookup is sent by POST.
 */
export function LookupBatch({
  q,
  initial,
}: {
  /** The shareable single query from the address, if any. */
  q?: string | undefined;
  /** Text to put in the box (an old e-mail link, or a list from the hub). */
  initial?: string | undefined;
}) {
  const {
    t,
  } =
    useTranslation(
      'admin-batch-lookup',
    );
  const navigate =
    useNavigate();
  const showCopy =
    useCopyFallback();
  const [
    text,
    setText,
  ] =
    useState(
      initial ??
        q ??
        '',
    );
  const [
    held,
    setHeld,
  ] =
    useState<
      string[] | null
    >(
      null,
    );
  const [
    copied,
    setCopied,
  ] =
    useState(
      false,
    );
  const items =
    splitLookupInput(
      text,
    );
  const tooMany =
    items.length >
    MAX_BATCH_ITEMS;
  const active =
    held ??
    (q
      ? [
          q,
        ]
      : null);

  const lookup =
    useQuery(
      {
        queryKey:
          [
            'admin-lookup-batch',
            active,
          ],
        queryFn:
          () =>
            api(
              adminLookupBatchApi,
              {
                body: {
                  items:
                    active ??
                    [],
                },
              },
            ),
        enabled:
          active !==
          null,
        // Read once: a refetch would repeat the audit row.
        staleTime:
          Infinity,
        gcTime: 0,
        retry: false,
        refetchOnWindowFocus: false,
      },
    );
  const arrival =
    useArrival(
      lookup.isSuccess,
    );

  const submit =
    (
      e: FormEvent,
    ) => {
      e.preventDefault();
      if (
        items.length ===
          0 ||
        tooMany
      )
        return;
      setCopied(
        false,
      );
      const only =
        items[0];
      if (
        items.length ===
          1 &&
        only !==
          undefined &&
        classifyLookup(
          only,
        ).type !==
          'email'
      ) {
        setHeld(
          null,
        );
        void navigate(
          {
            to: '/admin/lookup',
            search:
              {
                q: only,
              },
          },
        );
        return;
      }
      setHeld(
        items,
      );
      if (
        q
      )
        void navigate(
          {
            to: '/admin/lookup',
            search:
              {},
            replace: true,
          },
        );
    };

  const copy =
    async () => {
      if (
        !lookup.data
      )
        return;
      const out =
        resultsToText(
          lookup
            .data
            .groups,
          window
            .location
            .origin,
        );
      try {
        await navigator.clipboard.writeText(
          out,
        );
        setCopied(
          true,
        );
      } catch {
        showCopy(
          {
            title:
              t(
                'copy-title',
                {
                  defaultValue:
                    'Copy these results:',
                },
              ),
            text: out,
          },
        );
      }
    };

  const label =
    t(
      'field-label',
      {
        defaultValue:
          'Ids, handles, e-mail addresses or links, one per line',
      },
    );

  return (
    <div>
      <form
        onSubmit={
          submit
        }
        className="space-y-2"
      >
        <label
          htmlFor="lookup-batch-input"
          className="t-label block"
        >
          {label}
        </label>
        <Textarea
          id="lookup-batch-input"
          // Ids, handles, addresses and links read left to right in every locale (in `ar`, "@chen" showed as "chen@").
          dir="ltr"
          value={
            text
          }
          onChange={(
            e,
          ) =>
            setText(
              e
                .target
                .value,
            )
          }
          rows={
            4
          }
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={
            false
          }
          aria-describedby="lookup-batch-count"
        />
        <div className="flex items-center justify-between gap-3">
          <p
            id="lookup-batch-count"
            className={
              tooMany
                ? 't-meta text-site-danger'
                : 't-meta'
            }
          >
            {tooMany
              ? t(
                  'too-many',
                  {
                    max: MAX_BATCH_ITEMS,
                    defaultValue:
                      'At most {{max}} items',
                  },
                )
              : t(
                  'item-count',
                  {
                    count:
                      items.length,
                    defaultValue_one:
                      '{{count}} item',
                    defaultValue_other:
                      '{{count}} items',
                  },
                )}
          </p>
          <Button
            type="submit"
            variant="primary"
            disabled={
              items.length ===
                0 ||
              tooMany
            }
          >
            {t(
              'submit',
              {
                defaultValue:
                  'Look up',
              },
            )}
          </Button>
        </div>
        <p className="t-meta">
          {t(
            'hint',
            {
              max: MAX_BATCH_ITEMS,
              defaultValue:
                'One per line, up to {{max}}.',
            },
          )}
        </p>
      </form>

      {active ===
      null ? null : lookup.isPending ? (
        <div
          className="mt-4 space-y-3"
          aria-busy="true"
        >
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : lookup.isError ? (
        <div className="mt-4">
          <EmptyState
            title={t(
              'error-title',
              {
                defaultValue:
                  'The lookup failed',
              },
            )}
            description={t(
              'error-description',
              {
                defaultValue:
                  'Try again in a moment.',
              },
            )}
          />
        </div>
      ) : (
        <div
          className={`mt-4 ${arrival ?? ''}`}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="t-label">
              {t(
                'result-count',
                {
                  count:
                    lookup
                      .data
                      .groups
                      .length,
                  defaultValue_one:
                    '{{count}} item looked up',
                  defaultValue_other:
                    '{{count}} items looked up',
                },
              )}
            </p>
            <Button
              type="button"
              onClick={
                copy
              }
            >
              {t(
                'copy-results',
                {
                  defaultValue:
                    'Copy results',
                },
              )}
            </Button>
          </div>
          <p
            role="status"
            className="t-meta min-h-4"
          >
            {copied
              ? t(
                  'copied',
                  {
                    defaultValue:
                      'Copied',
                  },
                )
              : ''}
          </p>
          <LookupResultsTable
            groups={
              lookup
                .data
                .groups
            }
          />
        </div>
      )}
    </div>
  );
}
