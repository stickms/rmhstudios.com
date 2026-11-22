import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { useArrival } from '@/components/ui/arrive';
import { api, apiQuery } from '@/lib/contract/client';
import { diffWords, type DiffPart } from '@/lib/feed/word-diff';
import { applyDeckUpdatesApi, deckUpdatesApi } from '@/lib/study/deck-sync.contract';
import type { ChangedItem, DeckDiff, NewItem, RemovedItem, Side } from '@/lib/study/deck-sync';

type TabId = 'new' | 'changed' | 'conflicts' | 'removed';
type Detail = {
  state: 'ok' | 'needs-link' | 'unavailable';
  diff: DeckDiff;
};
type Resolution = 'mine' | 'theirs';

interface Props {
  deckId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after rows were applied, so the deck page reloads its cards and its line. */
  onApplied: () => void;
}

/** A word diff: insertions and deletions are marked by `<ins>` / `<del>` and hidden words, not colour alone. */
function WordDiff({ before, after }: { before: string; after: string }) {
  const { t } = useTranslation('deck-updates');
  const parts: DiffPart[] = diffWords(before, after);
  return (
    <span dir="auto" className="t-body whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part.op === 'insert') {
          return (
            <ins key={i} className="text-site-success underline">
              <span className="sr-only">
                {t('diff-added', {
                  defaultValue: 'added:',
                })}{' '}
              </span>
              {part.value}
            </ins>
          );
        }
        if (part.op === 'delete') {
          return (
            <del key={i} className="text-site-danger line-through">
              <span className="sr-only">
                {t('diff-removed', {
                  defaultValue: 'removed:',
                })}{' '}
              </span>
              {part.value}
            </del>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </span>
  );
}

function CardText({ card }: { card: Side }) {
  return (
    <div className="min-w-0">
      <p dir="auto" className="t-body whitespace-pre-wrap break-words font-medium">
        {card.front}
      </p>
      {card.back && (
        <p dir="auto" className="t-body whitespace-pre-wrap break-words text-site-text-muted">
          {card.back}
        </p>
      )}
    </div>
  );
}

export function DeckUpdatesDialog({ deckId, open, onOpenChange, onApplied }: Props) {
  const { t } = useTranslation('deck-updates');
  const uid = useId();
  const updatesQuery = useQuery({
    ...apiQuery(deckUpdatesApi, { params: { id: deckId } }),
    enabled: open,
    retry: false,
  });
  const detail: Detail | undefined = updatesQuery.data;
  // Skeleton until the first answer (and while a retry runs); a refetch after Apply keeps the list up.
  const loading = detail === undefined && (updatesQuery.isFetching || !updatesQuery.isError);
  const failed = updatesQuery.isError;
  const [tab, setTab] = useState<TabId>('new');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [resolutions, setResolutions] = useState<Map<string, Resolution>>(new Map());
  const [busy, setBusy] = useState(false);
  const arrival = useArrival(!loading);

  // Each fresh answer (first load, reopen, refetch after Apply) reseeds the selection, adjusting state during render.
  const [seededAt, setSeededAt] = useState(0);
  if (detail !== undefined && seededAt !== updatesQuery.dataUpdatedAt) {
    const data = detail;
    setSeededAt(updatesQuery.dataUpdatedAt);
    // New and changed rows start selected; removals and conflicts are an explicit choice.
    setPicked(
      new Set([
        ...data.diff.added.map((r) => `new:${r.sourceCardId}`),
        ...data.diff.changed.map((r) => `changed:${r.cardId}`),
      ]),
    );
    setResolutions(new Map());
    setTab((current) => {
      const d = data.diff;
      const counts: Record<TabId, number> = {
        new: d.added.length,
        changed: d.changed.length,
        conflicts: d.conflicts.length,
        removed: d.removed.length,
      };
      if (counts[current] > 0) return current;
      return (['new', 'changed', 'conflicts', 'removed'] as const).find((id) => counts[id] > 0) ?? current;
    });
  }

  const load = () => updatesQuery.refetch();

  const diff = detail?.diff;
  const toggle = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const resolve = (cardId: string, value: Resolution) =>
    setResolutions((prev) => {
      const next = new Map(prev);
      if (next.get(cardId) === value) next.delete(cardId);
      else next.set(cardId, value);
      return next;
    });

  const selectedCount = picked.size + resolutions.size;

  async function apply() {
    if (!diff || busy || selectedCount === 0) return;
    setBusy(true);
    try {
      const items = [
        ...diff.added
          .filter((r) => picked.has(`new:${r.sourceCardId}`))
          .map((r) => ({
            type: 'new' as const,
            sourceCardId: r.sourceCardId,
          })),
        ...diff.changed
          .filter((r) => picked.has(`changed:${r.cardId}`))
          .map((r) => ({
            type: 'changed' as const,
            cardId: r.cardId,
            expectedHash: r.expectedHash,
          })),
        ...diff.conflicts.flatMap((r) => {
          const resolution = resolutions.get(r.cardId);
          return resolution
            ? [
                {
                  type: 'conflict' as const,
                  cardId: r.cardId,
                  resolution,
                  expectedHash: r.expectedHash,
                },
              ]
            : [];
        }),
        ...diff.removed
          .filter((r) => picked.has(`removed:${r.cardId}`))
          .map((r) => ({
            type: 'removed' as const,
            cardId: r.cardId,
            expectedHash: r.expectedHash,
          })),
      ];
      const result = await api(applyDeckUpdatesApi, {
        params: {
          id: deckId,
        },
        body: {
          items,
        },
      });
      toast.success(
        t('applied', {
          count: result.applied,
          defaultValue_one: 'Applied {{count}} change',
          defaultValue: 'Applied {{count}} changes',
        }),
      );
      if (result.skipped.length > 0) {
        toast.message(
          t('skipped', {
            count: result.skipped.length,
            defaultValue_one: '{{count}} card changed meanwhile and was skipped',
            defaultValue: '{{count}} cards changed meanwhile and were skipped',
          }),
        );
      }
      if (result.leftOut > 0) {
        toast.message(
          t('left-out', {
            count: result.leftOut,
            defaultValue_one: '{{count}} new card did not fit in this deck and was left out',
            defaultValue: '{{count}} new cards did not fit in this deck and were left out',
          }),
        );
      }
      onApplied();
      await load();
    } catch {
      toast.error(
        t('apply-failed', {
          defaultValue: 'Could not apply the changes',
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  const pending = diff ? diff.added.length + diff.changed.length + diff.conflicts.length + diff.removed.length : 0;
  const tabs = [
    {
      id: 'new',
      label: t('tab-new', {
        defaultValue: 'New',
      }),
      count: diff?.added.length ?? 0,
    },
    {
      id: 'changed',
      label: t('tab-changed', {
        defaultValue: 'Changed',
      }),
      count: diff?.changed.length ?? 0,
    },
    {
      id: 'conflicts',
      label: t('tab-conflicts', {
        defaultValue: 'Conflicts',
      }),
      count: diff?.conflicts.length ?? 0,
    },
    {
      id: 'removed',
      label: t('tab-removed', {
        defaultValue: 'Removed',
      }),
      count: diff?.removed.length ?? 0,
    },
  ];

  const checkRow = (key: string, label: string, body: React.ReactNode) => (
    <li key={key} className="border-b border-site-border py-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 shrink-0 accent-[var(--site-text)]"
          checked={picked.has(key)}
          onChange={() => toggle(key)}
          aria-label={label}
        />
        <div className="min-w-0 flex-1 space-y-1">{body}</div>
      </label>
    </li>
  );

  const renderNew = (row: NewItem) =>
    checkRow(
      `new:${row.sourceCardId}`,
      t('select-card', {
        defaultValue: 'Select this card',
      }),
      <CardText card={row.card} />,
    );

  const renderChanged = (row: ChangedItem) =>
    checkRow(
      `changed:${row.cardId}`,
      t('select-card', {
        defaultValue: 'Select this card',
      }),
      <>
        <p>
          <WordDiff before={row.mine.front} after={row.theirs.front} />
        </p>
        {(row.mine.back || row.theirs.back) && (
          <p>
            <WordDiff before={row.mine.back} after={row.theirs.back} />
          </p>
        )}
        {row.mine.kind !== row.theirs.kind && (
          <p className="t-meta">
            {t('kind-changed', {
              defaultValue: 'The card type changed too.',
            })}
          </p>
        )}
      </>,
    );

  const renderConflict = (row: ChangedItem) => {
    const choice = resolutions.get(row.cardId);
    return (
      <li key={row.cardId} className="space-y-3 border-b border-site-border py-3">
        <div className="space-y-1">
          <p className="t-label">
            {t('your-version', {
              defaultValue: 'Your version',
            })}
          </p>
          <CardText card={row.mine} />
        </div>
        <div className="space-y-1">
          <p className="t-label">
            {t('their-version', {
              defaultValue: "The author's version",
            })}
          </p>
          <CardText card={row.theirs} />
        </div>
        <div
          className="flex gap-2"
          role="group"
          aria-label={t('resolve-conflict', {
            defaultValue: 'Resolve this conflict',
          })}
        >
          <Button
            variant="default"
            size="sm"
            aria-pressed={choice === 'mine'}
            onClick={() => resolve(row.cardId, 'mine')}
          >
            {t('keep-mine', {
              defaultValue: 'Keep mine',
            })}
          </Button>
          <Button
            variant="default"
            size="sm"
            aria-pressed={choice === 'theirs'}
            onClick={() => resolve(row.cardId, 'theirs')}
          >
            {t('take-theirs', {
              defaultValue: 'Take theirs',
            })}
          </Button>
        </div>
      </li>
    );
  };

  const renderRemoved = (row: RemovedItem) =>
    checkRow(
      `removed:${row.cardId}`,
      t('select-card-remove', {
        defaultValue: 'Remove this card',
      }),
      <CardText card={row.card} />,
    );

  const empty: Record<TabId, string> = {
    new: t('empty-new', {
      defaultValue: 'No new cards.',
    }),
    changed: t('empty-changed', {
      defaultValue: 'No changed cards.',
    }),
    conflicts: t('empty-conflicts', {
      defaultValue: 'No conflicts.',
    }),
    removed: t('empty-removed', {
      defaultValue: 'No cards were removed by the author.',
    }),
  };
  const rows: Record<TabId, React.ReactNode[]> = {
    new: diff?.added.map(renderNew) ?? [],
    changed: diff?.changed.map(renderChanged) ?? [],
    conflicts: diff?.conflicts.map(renderConflict) ?? [],
    removed: diff?.removed.map(renderRemoved) ?? [],
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullscreen className="flex max-h-[85dvh] w-full max-w-2xl flex-col gap-4">
        <div className="space-y-1">
          <DialogTitle className="t-heading">
            {t('dialog-title', {
              defaultValue: 'Updates from the author',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('dialog-description', {
              defaultValue:
                'Changes keep your review progress. Cards you edited are never overwritten without your say.',
            })}
          </DialogDescription>
        </div>

        {loading ? (
          <div
            className="space-y-3"
            role="status"
            aria-label={t('loading', {
              defaultValue: 'Loading updates',
            })}
          >
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : failed || !diff ? (
          <EmptyState
            title={t('load-failed', {
              defaultValue: 'Could not load the updates',
            })}
            action={
              <Button
                variant="default"
                onClick={() => {
                  void load();
                }}
              >
                {t('retry', {
                  defaultValue: 'Try again',
                })}
              </Button>
            }
          />
        ) : detail?.state === 'unavailable' ? (
          <EmptyState
            title={t('unavailable', {
              defaultValue: 'The original is no longer shared.',
            })}
          />
        ) : pending === 0 ? (
          <EmptyState
            title={t('up-to-date', {
              defaultValue: 'This deck is up to date.',
            })}
          />
        ) : (
          <div className={`flex min-h-0 flex-1 flex-col gap-2 ${arrival ?? ''}`}>
            <Tabs
              tabs={tabs}
              value={tab}
              onChange={(id) => setTab(id as TabId)}
              idBase={uid}
              aria-label={t('tabs-label', {
                defaultValue: 'Kinds of update',
              })}
            />
            <div
              role="tabpanel"
              id={`${uid}-panel-${tab}`}
              aria-labelledby={`${uid}-tab-${tab}`}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {rows[tab].length === 0 ? <p className="t-meta py-4">{empty[tab]}</p> : <ul>{rows[tab]}</ul>}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-site-border pt-3">
          <Button variant="default" onClick={() => onOpenChange(false)}>
            {t('close', {
              defaultValue: 'Close',
            })}
          </Button>
          <Button variant="primary" disabled={selectedCount === 0 || !diff} loading={busy} onClick={apply}>
            {t('apply-selected', {
              defaultValue: 'Apply selected',
            })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
