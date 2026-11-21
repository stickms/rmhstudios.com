/**
 * Find in book (feature 13): search the open PDF or EPUB.
 *
 * The panel is a side panel at 1024px and wider, so the book stays readable
 * beside the results, and a sheet below that. Text is extracted a page (PDF) or
 * chapter (EPUB) at a time by the index in `lib/library/find-index.ts`; the
 * panel stays mounted while closed so the index, the query and the results
 * survive closing it. The reader owns navigation: choosing a result calls
 * `onSelect`, which the reader turns into a page turn and a mark in the text
 * view.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  useArrivingKeys,
  ARRIVE,
} from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import {
  snippet,
  type FindTarget,
  type MatchRange,
} from '@/lib/library/find';
import {
  createFindIndex,
  type FindIndex,
  type FindSource,
  type SearchSummary,
  type UnitMatches,
} from '@/lib/library/find-index';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 200;
/** Result rows drawn at once; Next and Previous still step through every match. */
const MAX_ROWS = 300;
const WIDE_QUERY =
  '(min-width: 1024px)';

type Phase =
  | 'idle'
  | 'searching'
  | 'done'
  | 'error';

interface FlatMatch {
  unit: number;
  range: MatchRange;
}

export interface FindPanelProps {
  /** Null until the document is open. Must be stable for the life of the document. */
  source: FindSource | null;
  unitLabel:
    | 'page'
    | 'chapter';
  open: boolean;
  onOpenChange: (
    open: boolean,
  ) => void;
  onSelect: (
    target: FindTarget,
  ) => void;
  /** Counts up each time the reader asks for the search field (Mod+F), including while open. */
  focusRequest: number;
}

export function FindPanel({
  source,
  unitLabel,
  open,
  onOpenChange,
  onSelect,
  focusRequest,
}: FindPanelProps) {
  const {
    t,
  } =
    useTranslation(
      'find-in-book',
    );
  const wide =
    useMediaQuery(
      WIDE_QUERY,
    );
  const index =
    useMemo(
      () =>
        source
          ? createFindIndex(
              source,
            )
          : null,
      [
        source,
      ],
    );

  const [
    query,
    setQuery,
  ] =
    useState(
      '',
    );
  const [
    matchCase,
    setMatchCase,
  ] =
    useState(
      false,
    );
  const [
    wholeWords,
    setWholeWords,
  ] =
    useState(
      false,
    );
  const [
    phase,
    setPhase,
  ] =
    useState<Phase>(
      'idle',
    );
  const [
    progress,
    setProgress,
  ] =
    useState(
      0,
    );
  const [
    groups,
    setGroups,
  ] =
    useState<
      UnitMatches[]
    >(
      [],
    );
  const [
    summary,
    setSummary,
  ] =
    useState<SearchSummary | null>(
      null,
    );
  const [
    active,
    setActive,
  ] =
    useState(
      -1,
    );
  const seq =
    useRef(
      0,
    );
  const onSelectRef =
    useRef(
      onSelect,
    );
  onSelectRef.current =
    onSelect;

  const trimmed =
    query.trim();

  useEffect(() => {
    setGroups(
      [],
    );
    setSummary(
      null,
    );
    setActive(
      -1,
    );
    setProgress(
      0,
    );
    if (
      !index ||
      trimmed.length <
        MIN_QUERY
    ) {
      setPhase(
        'idle',
      );
      return;
    }
    const controller =
      new AbortController();
    const timer =
      window.setTimeout(
        () => {
          setPhase(
            'searching',
          );
          let first = true;
          index
            .search(
              trimmed,
              {
                matchCase,
                wholeWords,
              },
              {
                signal:
                  controller.signal,
                onProgress:
                  (
                    done,
                  ) =>
                    setProgress(
                      done,
                    ),
                onMatches:
                  (
                    found,
                  ) => {
                    setGroups(
                      (
                        prev,
                      ) => [
                        ...prev,
                        found,
                      ],
                    );
                    if (
                      !first
                    )
                      return;
                    first = false;
                    setActive(
                      0,
                    );
                    onSelectRef.current(
                      {
                        unit: found.unit,
                        range:
                          found
                            .ranges[0]!,
                        seq: ++seq.current,
                      },
                    );
                  },
              },
            )
            .then(
              (
                result,
              ) => {
                if (
                  result.aborted
                )
                  return;
                setSummary(
                  result,
                );
                setPhase(
                  'done',
                );
              },
            )
            .catch(
              () => {
                if (
                  !controller
                    .signal
                    .aborted
                )
                  setPhase(
                    'error',
                  );
              },
            );
        },
        DEBOUNCE_MS,
      );
    return () => {
      window.clearTimeout(
        timer,
      );
      controller.abort();
    };
  }, [
    index,
    trimmed,
    matchCase,
    wholeWords,
  ]);

  const flat =
    useMemo<
      FlatMatch[]
    >(
      () =>
        groups.flatMap(
          (
            g,
          ) =>
            g.ranges.map(
              (
                range,
              ) => ({
                unit: g.unit,
                range,
              }),
            ),
        ),
      [
        groups,
      ],
    );

  const step =
    useCallback(
      (
        delta: number,
      ) => {
        if (
          flat.length ===
          0
        )
          return;
        const next =
          active <
          0
            ? delta >
              0
              ? 0
              : flat.length -
                1
            : (active +
                delta +
                flat.length) %
              flat.length;
        setActive(
          next,
        );
        const hit =
          flat[
            next
          ]!;
        onSelectRef.current(
          {
            unit: hit.unit,
            range:
              hit.range,
            seq: ++seq.current,
          },
        );
      },
      [
        flat,
        active,
      ],
    );

  const choose =
    useCallback(
      (
        at: number,
      ) => {
        const hit =
          flat[
            at
          ];
        if (
          !hit
        )
          return;
        setActive(
          at,
        );
        onSelectRef.current(
          {
            unit: hit.unit,
            range:
              hit.range,
            seq: ++seq.current,
          },
        );
      },
      [
        flat,
      ],
    );

  const body =
    (
      <FindBody
        index={
          index
        }
        unitLabel={
          unitLabel
        }
        query={
          query
        }
        onQuery={
          setQuery
        }
        matchCase={
          matchCase
        }
        onMatchCase={
          setMatchCase
        }
        wholeWords={
          wholeWords
        }
        onWholeWords={
          setWholeWords
        }
        phase={
          phase
        }
        progress={
          progress
        }
        groups={
          groups
        }
        summary={
          summary
        }
        flat={
          flat
        }
        active={
          active
        }
        onStep={
          step
        }
        onChoose={
          choose
        }
        tooShort={
          trimmed.length >
            0 &&
          trimmed.length <
            MIN_QUERY
        }
        focusRequest={
          focusRequest
        }
      />
    );

  // The sheet portals to <body>, which a fullscreen reader hides.
  useEffect(() => {
    if (
      open &&
      !wide &&
      document.fullscreenElement
    )
      void document
        .exitFullscreen()
        .catch(
          () => {},
        );
  }, [
    open,
    wide,
  ]);

  if (
    !source ||
    !open
  )
    return null;

  if (
    wide
  ) {
    return (
      <aside
        aria-label={t(
          'panel-title',
          {
            defaultValue:
              'Find in book',
          },
        )}
        onKeyDown={(
          e,
        ) => {
          if (
            e.key ===
            'Escape'
          )
            onOpenChange(
              false,
            );
        }}
        className="absolute inset-y-0 end-0 top-[62px] z-10 flex w-[360px] flex-col gap-3 border-s border-site-border bg-site-surface p-4 text-site-text"
      >
        <div className="flex items-center justify-between">
          <h2 className="t-heading">
            {t(
              'panel-title',
              {
                defaultValue:
                  'Find in book',
              },
            )}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() =>
              onOpenChange(
                false,
              )
            }
            aria-label={t(
              'close',
              {
                defaultValue:
                  'Close find',
              },
            )}
          >
            <X
              aria-hidden
            />
          </Button>
        </div>
        {
          body
        }
      </aside>
    );
  }

  return (
    <Sheet
      open
      onOpenChange={
        onOpenChange
      }
    >
      <SheetContent
        aria-describedby={
          undefined
        }
        className="max-h-[85dvh]"
      >
        <SheetHeader>
          <SheetTitle>
            {t(
              'panel-title',
              {
                defaultValue:
                  'Find in book',
              },
            )}
          </SheetTitle>
        </SheetHeader>
        {
          body
        }
      </SheetContent>
    </Sheet>
  );
}

function FindBody({
  index,
  unitLabel,
  query,
  onQuery,
  matchCase,
  onMatchCase,
  wholeWords,
  onWholeWords,
  phase,
  progress,
  groups,
  summary,
  flat,
  active,
  onStep,
  onChoose,
  tooShort,
  focusRequest,
}: {
  index: FindIndex | null;
  unitLabel:
    | 'page'
    | 'chapter';
  query: string;
  onQuery: (
    value: string,
  ) => void;
  matchCase: boolean;
  onMatchCase: (
    value: boolean,
  ) => void;
  wholeWords: boolean;
  onWholeWords: (
    value: boolean,
  ) => void;
  phase: Phase;
  progress: number;
  groups: UnitMatches[];
  summary: SearchSummary | null;
  flat: FlatMatch[];
  active: number;
  onStep: (
    delta: number,
  ) => void;
  onChoose: (
    at: number,
  ) => void;
  tooShort: boolean;
  focusRequest: number;
}) {
  const {
    t,
  } =
    useTranslation(
      'find-in-book',
    );
  const inputRef =
    useRef<HTMLInputElement>(
      null,
    );
  const isArriving =
    useArrivingKeys(
      groups.map(
        (
          g,
        ) =>
          g.unit,
      ),
    );
  const total =
    index?.count ??
    0;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [
    focusRequest,
  ]);

  // The active row stays in view as Next and Previous move through the list.
  const listRef =
    useRef<HTMLOListElement>(
      null,
    );
  useEffect(() => {
    if (
      active <
      0
    )
      return;
    listRef.current
      ?.querySelector<HTMLElement>(
        '[data-active="true"]',
      )
      ?.scrollIntoView(
        {
          block:
            'nearest',
        },
      );
  }, [
    active,
  ]);

  let status =
    '';
  if (
    phase ===
    'error'
  ) {
    status =
      t(
        'error',
        {
          defaultValue:
            'Could not search this book.',
        },
      );
  } else if (
    phase ===
      'done' &&
    summary
  ) {
    if (
      !summary.searchable
    )
      status =
        t(
          'no-text',
          {
            defaultValue:
              'This document has no searchable text',
          },
        );
    else if (
      summary.matches ===
      0
    )
      status =
        t(
          'no-matches',
          {
            defaultValue:
              'No matches',
          },
        );
    else {
      const matchesLabel =
        t(
          'matches',
          {
            count:
              summary.matches,
            defaultValue_one:
              '{{count}} match',
            defaultValue_other:
              '{{count}} matches',
          },
        );
      const pagesLabel =
        t(
          'pages',
          {
            count:
              summary.units,
            defaultValue_one:
              '{{count}} page',
            defaultValue_other:
              '{{count}} pages',
          },
        );
      const chaptersLabel =
        t(
          'chapters',
          {
            count:
              summary.units,
            defaultValue_one:
              '{{count}} chapter',
            defaultValue_other:
              '{{count}} chapters',
          },
        );
      status =
        t(
          'summary',
          {
            matches:
              matchesLabel,
            places:
              unitLabel ===
              'page'
                ? pagesLabel
                : chaptersLabel,
            defaultValue:
              '{{matches}} on {{places}}',
          },
        );
    }
  } else if (
    tooShort
  ) {
    status =
      t(
        'too-short',
        {
          defaultValue:
            'Type at least 2 characters',
        },
      );
  }

  let shown = 0;
  let offset = 0;
  const rows =
    groups.map(
      (
        group,
      ) => {
        const start =
          offset;
        offset +=
          group
            .ranges
            .length;
        return {
          group,
          start,
        };
      },
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <form
        role="search"
        onSubmit={(
          e,
        ) =>
          e.preventDefault()
        }
        aria-label={t(
          'search-label',
          {
            defaultValue:
              'Search this book',
          },
        )}
        className="flex flex-col gap-3"
      >
        <div className="flex items-center gap-2">
          <Input
            ref={
              inputRef
            }
            type="search"
            dir="auto"
            value={
              query
            }
            onChange={(
              e,
            ) =>
              onQuery(
                e
                  .target
                  .value,
              )
            }
            onKeyDown={(
              e,
            ) => {
              if (
                e.key !==
                'Enter'
              )
                return;
              e.preventDefault();
              onStep(
                e.shiftKey
                  ? -1
                  : 1,
              );
            }}
            placeholder={t(
              'placeholder',
              {
                defaultValue:
                  'Find in book',
              },
            )}
            aria-label={t(
              'search-label',
              {
                defaultValue:
                  'Search this book',
              },
            )}
            autoComplete="off"
            spellCheck={
              false
            }
            enterKeyHint="search"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={
              flat.length ===
              0
            }
            onClick={() =>
              onStep(
                -1,
              )
            }
            aria-label={t(
              'previous',
              {
                defaultValue:
                  'Previous match',
              },
            )}
            aria-keyshortcuts="Shift+Enter"
          >
            <ChevronUp
              aria-hidden
            />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={
              flat.length ===
              0
            }
            onClick={() =>
              onStep(
                1,
              )
            }
            aria-label={t(
              'next',
              {
                defaultValue:
                  'Next match',
              },
            )}
            aria-keyshortcuts="Enter"
          >
            <ChevronDown
              aria-hidden
            />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-site-text-muted">
          <label className="flex items-center gap-2">
            <Switch
              checked={
                matchCase
              }
              onCheckedChange={
                onMatchCase
              }
              aria-label={t(
                'match-case',
                {
                  defaultValue:
                    'Match case',
                },
              )}
            />
            {t(
              'match-case',
              {
                defaultValue:
                  'Match case',
              },
            )}
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={
                wholeWords
              }
              onCheckedChange={
                onWholeWords
              }
              aria-label={t(
                'whole-words',
                {
                  defaultValue:
                    'Whole words',
                },
              )}
            />
            {t(
              'whole-words',
              {
                defaultValue:
                  'Whole words',
              },
            )}
          </label>
        </div>
      </form>

      {phase ===
      'searching' ? (
        <p className="t-meta">
          {unitLabel ===
          'page'
            ? t(
                'searching-page',
                {
                  done: progress,
                  total,
                  defaultValue:
                    'Searching page {{done}} of {{total}}',
                },
              )
            : t(
                'searching-chapter',
                {
                  done: progress,
                  total,
                  defaultValue:
                    'Searching chapter {{done}} of {{total}}',
                },
              )}
        </p>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        className="t-label min-h-[1.3em]"
      >
        {
          status
        }
      </p>

      <ol
        ref={
          listRef
        }
        aria-label={t(
          'results',
          {
            defaultValue:
              'Results',
          },
        )}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {rows.map(
          ({
            group,
            start,
          }) => {
            if (
              shown >=
              MAX_ROWS
            )
              return null;
            const room =
              MAX_ROWS -
              shown;
            const visible =
              group.ranges.slice(
                0,
                room,
              );
            shown +=
              visible.length;
            return (
              <li
                key={
                  group.unit
                }
                className={cn(
                  'border-b border-site-border py-2',
                  isArriving(
                    group.unit,
                  ) &&
                    ARRIVE,
                )}
              >
                <p className="t-label mb-1">
                  {unitLabel ===
                  'page'
                    ? t(
                        'page-n',
                        {
                          n: group.unit,
                          defaultValue:
                            'Page {{n}}',
                        },
                      )
                    : t(
                        'chapter-n',
                        {
                          n: group.unit,
                          defaultValue:
                            'Chapter {{n}}',
                        },
                      )}
                </p>
                <ul>
                  {visible.map(
                    (
                      range,
                      i,
                    ) => {
                      const at =
                        start +
                        i;
                      const cut =
                        snippet(
                          index?.textOf(
                            group.unit,
                          ) ??
                            '',
                          range,
                        );
                      const isActive =
                        at ===
                        active;
                      return (
                        <li
                          key={
                            range.start
                          }
                        >
                          <button
                            type="button"
                            dir="auto"
                            data-active={
                              isActive
                            }
                            aria-current={
                              isActive ||
                              undefined
                            }
                            onClick={() =>
                              onChoose(
                                at,
                              )
                            }
                            className={cn(
                              't-body block w-full rounded-site px-2 py-1.5 text-start transition-[background-color] duration-(--m1) hover:bg-site-bg-subtle pointer-coarse:py-2.5',
                              isActive &&
                                'bg-site-bg-subtle',
                            )}
                          >
                            {cut.cutBefore
                              ? '… '
                              : null}
                            {
                              cut.before
                            }
                            <mark className="rounded-site-sm bg-site-text px-0.5 text-site-bg">
                              {
                                cut.match
                              }
                            </mark>
                            {
                              cut.after
                            }
                            {cut.cutAfter
                              ? ' …'
                              : null}
                          </button>
                        </li>
                      );
                    },
                  )}
                </ul>
              </li>
            );
          },
        )}
      </ol>
      {flat.length >
      MAX_ROWS ? (
        <p className="t-meta">
          {t(
            'truncated',
            {
              shown:
                MAX_ROWS,
              total:
                flat.length,
              defaultValue:
                'Showing the first {{shown}} of {{total}} matches. Next and Previous still reach every one.',
            },
          )}
        </p>
      ) : null}
    </div>
  );
}
