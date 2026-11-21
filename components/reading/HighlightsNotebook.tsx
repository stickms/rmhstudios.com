/**
 * The highlights notebook (My reading): every highlight and note, searchable on
 * the server, filterable, optionally grouped by document, selectable, and
 * exportable as Markdown, CSV or JSON. Rows keep the existing actions (edit the
 * note, delete) and add "copy as citation".
 */

import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Download,
  Globe,
  Highlighter,
  Lock,
  NotebookPen,
  Pencil,
  Quote,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { SelectionBar } from '@/components/ui/selection-bar';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  ARRIVE,
  useArrival,
  useArrivingKeys,
} from '@/components/ui/arrive';
import { searchHighlightsPage } from '@/lib/reading/highlights.queries';
import {
  citation,
  groupByDocument,
  type ExportRow,
} from '@/lib/reading/highlights-export';
import type { HighlightsFilter } from '@/lib/reading/highlights-search-schema';
import { useHighlightActions } from '@/lib/reading/client';
import {
  HIGHLIGHT_NOTE_MAX,
  type MyHighlightRow,
} from '@/lib/reading/schema';
import { cn } from '@/lib/utils';
import {
  EMPTY_FILTERS,
  NotebookFilters,
  type NotebookFilterState,
} from './NotebookFilters';
import { ExportDialog } from './ExportDialog';

const NOTEBOOK_KEY =
  'reading-notebook';
const SEARCH_DEBOUNCE_MS = 250;

/** A row as the notebook uses it: the export shape, with the relative link of the document. */
function toRow(
  r: MyHighlightRow,
): ExportRow {
  return {
    id: r.id,
    kind: r.kind,
    key: r.key,
    unit: r.unit,
    start:
      r.start,
    title:
      r.title,
    url: r.href,
    exact:
      r.exact,
    note: r.note,
    isPublic:
      r.isPublic,
    createdAt:
      r.createdAt,
  };
}

function toFilter(
  f: NotebookFilterState,
  q: string,
): HighlightsFilter {
  return {
    ...(q
      ? {
          q,
        }
      : {}),
    ...(f.kind
      ? {
          kind: f.kind,
        }
      : {}),
    ...(f.hasNote
      ? {
          hasNote: true,
        }
      : {}),
    ...(f.visibility
      ? {
          visibility:
            f.visibility,
        }
      : {}),
    sort: f.sort,
  };
}

function HighlightItem({
  row,
  selected,
  onToggle,
  onChanged,
  isNew,
}: {
  row: ExportRow;
  selected: boolean;
  onToggle: () => void;
  onChanged: () => void;
  isNew: boolean;
}) {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'highlights',
    );
  const confirm =
    useConfirm();
  const actions =
    useHighlightActions(
      row.kind,
      row.key,
    );
  const [
    editing,
    setEditing,
  ] =
    useState(
      false,
    );
  const [
    draft,
    setDraft,
  ] =
    useState(
      row.note ??
        '',
    );
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );

  async function saveNote() {
    setBusy(
      true,
    );
    try {
      await actions.update(
        row.id,
        {
          note: draft.trim(),
        },
      );
      setEditing(
        false,
      );
      onChanged();
    } catch {
      toast.error(
        t(
          'save-failed',
          {
            defaultValue:
              'Could not save that. Try again.',
          },
        ),
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function remove() {
    const ok =
      await confirm(
        {
          title:
            t(
              'remove-title',
              {
                defaultValue:
                  'Remove this highlight?',
              },
            ),
          description:
            t(
              'remove-description',
              {
                defaultValue:
                  'Its note is removed with it.',
              },
            ),
          confirmLabel:
            t(
              'remove',
              {
                defaultValue:
                  'Remove',
              },
            ),
          danger: true,
        },
      );
    if (
      !ok
    )
      return;
    try {
      await actions.remove(
        row.id,
      );
      onChanged();
    } catch {
      toast.error(
        t(
          'save-failed',
          {
            defaultValue:
              'Could not save that. Try again.',
          },
        ),
      );
    }
  }

  const origin =
    typeof window ===
    'undefined'
      ? ''
      : window
          .location
          .origin;

  return (
    <li
      className={cn(
        'flex items-start gap-3 border-b border-site-border py-4',
        isNew &&
          ARRIVE,
      )}
    >
      <input
        type="checkbox"
        checked={
          selected
        }
        onChange={
          onToggle
        }
        aria-label={t(
          'select-highlight',
          {
            quote:
              row
                .exact
                .length >
              80
                ? `${row.exact.slice(0, 80)}…`
                : row.exact,
            defaultValue:
              'Select highlight: {{quote}}',
          },
        )}
        className="mt-1.5 size-4 shrink-0 accent-[var(--site-accent)]"
      />
      <div className="min-w-0 flex-1 space-y-2">
        <blockquote className="t-prose border-s border-site-border ps-3">
          {
            row.exact
          }
        </blockquote>
        {editing ? (
          <div className="space-y-2">
            <Textarea
              aria-label={t(
                'note-label',
                {
                  defaultValue:
                    'Note',
                },
              )}
              value={
                draft
              }
              maxLength={
                HIGHLIGHT_NOTE_MAX
              }
              rows={
                3
              }
              onChange={(
                e,
              ) =>
                setDraft(
                  e
                    .target
                    .value,
                )
              }
              placeholder={t(
                'note-placeholder',
                {
                  defaultValue:
                    'Your thoughts (optional)',
                },
              )}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                loading={
                  busy
                }
                onClick={() =>
                  void saveNote()
                }
              >
                {t(
                  'save-note',
                  {
                    defaultValue:
                      'Save note',
                  },
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(
                    row.note ??
                      '',
                  );
                  setEditing(
                    false,
                  );
                }}
              >
                {t(
                  'cancel',
                  {
                    defaultValue:
                      'Cancel',
                  },
                )}
              </Button>
            </div>
          </div>
        ) : row.note ? (
          <p className="t-body whitespace-pre-line text-site-text-muted">
            {
              row.note
            }
          </p>
        ) : null}
        <p className="t-meta flex items-center gap-2">
          {row.isPublic ? (
            <Globe
              className="size-3.5"
              aria-hidden
            />
          ) : (
            <Lock
              className="size-3.5"
              aria-hidden
            />
          )}
          <span>
            {row.isPublic
              ? t(
                  'public',
                  {
                    defaultValue:
                      'Public',
                  },
                )
              : t(
                  'private',
                  {
                    defaultValue:
                      'Private',
                  },
                )}
          </span>
          <time
            dateTime={
              row.createdAt
            }
          >
            {new Date(
              row.createdAt,
            ).toLocaleDateString(
              i18n.language,
              {
                dateStyle:
                  'medium',
              },
            )}
          </time>
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        <CopyButton
          size="icon-sm"
          icon={
            Quote
          }
          label={t(
            'copy-citation',
            {
              defaultValue:
                'Copy as citation',
            },
          )}
          value={citation(
            {
              ...row,
              url: new URL(
                row.url,
                origin ||
                  'https://rmhstudios.com',
              )
                .href,
            },
          )}
        />
        <IconButton
          label={t(
            'edit-note',
            {
              defaultValue:
                'Edit note',
            },
          )}
          icon={
            Pencil
          }
          onClick={() => {
            setDraft(
              row.note ??
                '',
            );
            setEditing(
              true,
            );
          }}
        />
        <IconButton
          label={t(
            'remove-highlight',
            {
              defaultValue:
                'Remove highlight',
            },
          )}
          icon={
            Trash2
          }
          onClick={() =>
            void remove()
          }
        />
      </div>
    </li>
  );
}

export default function HighlightsNotebook() {
  const {
    t,
  } =
    useTranslation(
      'highlights',
    );
  const {
    data: session,
  } =
    useSession();
  const qc =
    useQueryClient();
  const [
    filters,
    setFilters,
  ] =
    useState<NotebookFilterState>(
      EMPTY_FILTERS,
    );
  const [
    q,
    setQ,
  ] =
    useState(
      '',
    );
  const [
    grouped,
    setGrouped,
  ] =
    useState(
      false,
    );
  const [
    selected,
    setSelected,
  ] =
    useState<
      ReadonlySet<string>
    >(
      new Set(),
    );
  const [
    exporting,
    setExporting,
  ] =
    useState(
      false,
    );

  // The query goes to the server a moment after typing stops, not on every key.
  useEffect(() => {
    const timer =
      setTimeout(
        () =>
          setQ(
            filters.q.trim(),
          ),
        SEARCH_DEBOUNCE_MS,
      );
    return () =>
      clearTimeout(
        timer,
      );
  }, [
    filters.q,
  ]);

  const filter =
    useMemo(
      () =>
        toFilter(
          filters,
          q,
        ),
      [
        filters,
        q,
      ],
    );
  const query =
    useInfiniteQuery(
      {
        queryKey:
          [
            NOTEBOOK_KEY,
            filter,
          ],
        enabled:
          !!session,
        retry: false,
        initialPageParam:
          null as
            | string
            | null,
        queryFn:
          ({
            pageParam,
            signal,
          }) =>
            searchHighlightsPage(
              filter,
              pageParam,
              signal,
            ),
        getNextPageParam:
          (
            last,
          ) =>
            last.nextCursor,
      },
    );

  const rows =
    useMemo(
      () =>
        query.data?.pages.flatMap(
          (
            p,
          ) =>
            p.items.map(
              toRow,
            ),
        ) ??
        [],
      [
        query.data,
      ],
    );
  const total =
    query
      .data
      ?.pages[0]
      ?.total ??
    0;
  const groups =
    useMemo(
      () =>
        grouped
          ? groupByDocument(
              rows,
            )
          : [],
      [
        grouped,
        rows,
      ],
    );
  const arrival =
    useArrival(
      !query.isPending,
    );
  const isNew =
    useArrivingKeys(
      rows.map(
        (
          r,
        ) =>
          r.id,
      ),
    );

  const changeFilters =
    (
      next: NotebookFilterState,
    ) => {
      setFilters(
        next,
      );
      setSelected(
        new Set(),
      );
    };
  const toggle =
    (
      id: string,
    ) =>
      setSelected(
        (
          prev,
        ) => {
          const next =
            new Set(
              prev,
            );
          if (
            !next.delete(
              id,
            )
          )
            next.add(
              id,
            );
          return next;
        },
      );
  const refresh =
    () => {
      void qc.invalidateQueries(
        {
          queryKey:
            [
              NOTEBOOK_KEY,
            ],
        },
      );
      void qc.invalidateQueries(
        {
          queryKey:
            [
              'reading-my-highlights',
            ],
        },
      );
    };
  const item =
    (
      row: ExportRow,
    ) => (
      <HighlightItem
        key={
          row.id
        }
        row={
          row
        }
        selected={selected.has(
          row.id,
        )}
        onToggle={() =>
          toggle(
            row.id,
          )
        }
        onChanged={
          refresh
        }
        isNew={isNew(
          row.id,
        )}
      />
    );

  if (
    !session
  ) {
    return (
      <SignedOutPrompt
        icon={
          Highlighter
        }
        title={t(
          'signed-out-title',
          {
            defaultValue:
              'Sign in to open your notebook',
          },
        )}
        callbackURL="/library?view=reading&tab=notebook"
      />
    );
  }

  const filtered =
    filter.q ||
    filter.kind ||
    filter.hasNote ||
    filter.visibility;
  const allSelected =
    rows.length >
      0 &&
    rows.every(
      (
        r,
      ) =>
        selected.has(
          r.id,
        ),
    );
  const kindLabel =
    (
      kind: ExportRow['kind'],
    ) =>
      kind ===
      'blog'
        ? t(
            'kind-logs',
            {
              defaultValue:
                'Logs',
            },
          )
        : kind ===
            'news'
          ? t(
              'kind-news',
              {
                defaultValue:
                  'News',
              },
            )
          : t(
              'kind-library',
              {
                defaultValue:
                  'Library',
              },
            );

  return (
    <div className="space-y-4">
      <NotebookFilters
        value={
          filters
        }
        onChange={
          changeFilters
        }
        grouped={
          grouped
        }
        onGroupedChange={
          setGrouped
        }
      />
      <div className="flex items-center justify-between gap-3">
        <p
          className="t-meta"
          role="status"
        >
          {query.isPending
            ? null
            : t(
                'result-count',
                {
                  count:
                    total,
                  defaultValue_one: '{{count}} highlight',
                  defaultValue_other: '{{count}} highlights',
                },
              )}
        </p>
        <Button
          variant="primary"
          size="sm"
          disabled={
            total ===
            0
          }
          onClick={() =>
            setExporting(
              true,
            )
          }
        >
          <Download
            aria-hidden
          />
          {t(
            'export',
            {
              defaultValue:
                'Export',
            },
          )}
        </Button>
      </div>
      {query.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : query.isError ? (
        <EmptyState
          icon={
            Highlighter
          }
          title={t(
            'load-failed',
            {
              defaultValue:
                'Could not load your highlights',
            },
          )}
          action={
            <Button
              variant="default"
              size="sm"
              onClick={() =>
                void query.refetch()
              }
            >
              {t(
                'retry',
                {
                  defaultValue:
                    'Try again',
                },
              )}
            </Button>
          }
        />
      ) : rows.length ===
        0 ? (
        filtered ? (
          <EmptyState
            className={
              arrival
            }
            icon={
              Search
            }
            title={t(
              'no-matches',
              {
                defaultValue:
                  'No highlights match',
              },
            )}
            description={t(
              'no-matches-hint',
              {
                defaultValue:
                  'Try a different word or clear a filter.',
              },
            )}
          />
        ) : (
          <EmptyState
            className={
              arrival
            }
            icon={
              NotebookPen
            }
            title={t(
              'empty-title',
              {
                defaultValue:
                  'No highlights yet',
              },
            )}
            description={t(
              'empty-hint',
              {
                defaultValue:
                  'Select text in a log, news article or library book to highlight it or add a note.',
              },
            )}
          />
        )
      ) : (
        <div
          className={cn(
            'space-y-3',
            arrival,
          )}
        >
          {grouped ? (
            groups.map(
              (
                g,
              ) => (
                <section
                  key={`${g.kind}:${g.key}`}
                  aria-labelledby={`nb-${g.kind}-${g.key}`}
                >
                  <div className="flex items-baseline justify-between gap-3 border-b border-site-border pb-2 pt-3">
                    <h3
                      id={`nb-${g.kind}-${g.key}`}
                      className="t-heading min-w-0"
                    >
                      <Link
                        to={
                          g.url
                        }
                        className="hover:underline"
                      >
                        {
                          g.title
                        }
                      </Link>
                    </h3>
                    <span className="t-meta shrink-0">
                      {kindLabel(
                        g.kind,
                      )}{' '}
                      ·{' '}
                      {t(
                        'group-count',
                        {
                          count:
                            g
                              .items
                              .length,
                          defaultValue_one: '{{count}} highlight',
                          defaultValue_other: '{{count}} highlights',
                        },
                      )}
                    </span>
                  </div>
                  <ul>
                    {g.items.map(
                      item,
                    )}
                  </ul>
                </section>
              ),
            )
          ) : (
            <ul>
              {rows.map(
                item,
              )}
            </ul>
          )}
          {query.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                variant="default"
                size="sm"
                loading={
                  query.isFetchingNextPage
                }
                onClick={() =>
                  void query.fetchNextPage()
                }
              >
                {t(
                  'load-more',
                  {
                    defaultValue:
                      'Load more',
                  },
                )}
              </Button>
            </div>
          ) : null}
        </div>
      )}
      {selected.size >
      0 ? (
        <SelectionBar
          count={
            selected.size
          }
          onClear={() =>
            setSelected(
              new Set(),
            )
          }
          onSelectAll={() =>
            setSelected(
              new Set(
                rows.map(
                  (
                    r,
                  ) =>
                    r.id,
                ),
              ),
            )
          }
          allSelected={
            allSelected
          }
          actions={[
            {
              id: 'export',
              label:
                t(
                  'export-selected-action',
                  {
                    defaultValue:
                      'Export selected',
                  },
                ),
              icon: Download,
              onClick:
                () =>
                  setExporting(
                    true,
                  ),
            },
          ]}
        />
      ) : null}
      <ExportDialog
        key={
          exporting
            ? `open-${selected.size}`
            : 'closed'
        }
        open={
          exporting
        }
        onOpenChange={
          setExporting
        }
        filter={
          filter
        }
        selectedIds={[
          ...selected,
        ]}
        total={
          total
        }
      />
    </div>
  );
}
