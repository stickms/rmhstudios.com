import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival } from '@/components/ui/arrive';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useModeTitle } from '@/components/daily-puzzles/mode-title';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { toast } from '@/lib/toast';
import { api, apiQuery } from '@/lib/contract/client';
import type { DailyPuzzleMode } from '@/lib/daily-puzzles/generate-core';
import {
  REPORTABLE_MODES,
  REPORT_KINDS,
  REVIEW_NOTE_MAX,
  REVIEW_OUTCOMES,
  type ReportKind,
  type ReviewOutcome,
} from '@/lib/daily-puzzles/reports';
import {
  generatePuzzleApi,
  getAdminPuzzlesApi,
  replacePuzzleApi,
  reviewReportsApi,
  type AdminPuzzleDay,
} from '@/lib/daily-puzzles/reports.contract';

/**
 * /admin/daily-puzzles: one tab per AI mode, and for the mode a row per day (today, the next two days, the last
 * seven): where the puzzle came from, the puzzle and its answer as plain text, the reports by kind and each report's
 * note with the member's handle. "Generate now" fills a missing future day; "Replace" swaps a future day's puzzle in
 * place until the day is about to start or anyone has played it. Today's and past puzzles are read-only. The
 * answer is shown here only; the member-facing pages never receive it.
 */
export function DailyPuzzlesAdmin() {
  const { t } = useTranslation('puzzle-reports');
  const modeTitle = useModeTitle();
  const refusalText = useRefusalText();
  const confirm = useConfirm();
  const fmt = useLocaleFormat();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<DailyPuzzleMode>('alibi');
  const [busy, setBusy] = useState<string | null>(null);

  const list = useQuery(apiQuery(getAdminPuzzlesApi, { query: { mode } }));
  const arrival = useArrival(!list.isPending);

  const kindLabel: Record<ReportKind, string> = {
    'two-answers': t('kind-two-answers', { defaultValue: 'Two answers fit' }),
    'wrong-answer': t('kind-wrong-answer', { defaultValue: 'The answer is wrong' }),
    unclear: t('kind-unclear', { defaultValue: 'The clue is unclear or contradicts itself' }),
    other: t('kind-other', { defaultValue: 'Something else' }),
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: [getAdminPuzzlesApi.path] });

  const generate = async (day: AdminPuzzleDay) => {
    setBusy(day.dateKey);
    try {
      const out = await api(generatePuzzleApi, { body: { gameMode: mode, dateKey: day.dateKey } });
      toast.success(
        out.created
          ? t('generated', { defaultValue: 'The puzzle was generated.' })
          : t('already-generated', { defaultValue: 'This day already had a puzzle.' }),
      );
      await refresh();
    } catch (error) {
      toast.error(
        refusalText.maybe(error) ?? t('generate-failed', { defaultValue: 'The puzzle did not generate. Try again.' }),
      );
    } finally {
      setBusy(null);
    }
  };

  const replace = async (day: AdminPuzzleDay) => {
    if (!day.puzzle) return;
    const ok = await confirm({
      title: t('replace-title', { defaultValue: 'Replace this puzzle?' }),
      description: t('replace-description', {
        defaultValue:
          'A new puzzle is generated and takes its place for everyone. This can only be done before the day starts. The action is recorded in the audit log.',
      }),
      confirmLabel: t('replace-confirm', { defaultValue: 'Replace puzzle' }),
      cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
    });
    if (!ok) return;
    setBusy(day.dateKey);
    try {
      await api(replacePuzzleApi, {
        body: { gameMode: mode, dateKey: day.dateKey, seenId: day.puzzle.id, seenCreatedAt: day.puzzle.createdAt },
      });
      toast.success(t('replaced', { defaultValue: 'The puzzle was replaced.' }));
    } catch (error) {
      toast.error(
        refusalText.maybe(error) ?? t('replace-failed', { defaultValue: 'The puzzle was not replaced. Try again.' }),
      );
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  const relationLabel = (d: AdminPuzzleDay) => {
    switch (d.relation) {
      case 'future':
        return t('relation-future', { defaultValue: 'Coming' });
      case 'today':
        return t('relation-today', { defaultValue: 'Today' });
      case 'past':
        return t('relation-past', { defaultValue: 'Past' });
    }
  };

  const sourceLabel = (source: string) =>
    source === 'deepseek'
      ? t('source-model', { defaultValue: 'Written by the model' })
      : t('source-fallback', { defaultValue: 'Built-in fallback' });

  /** Why a day with a puzzle has no Replace button. */
  const lockedNote = (d: AdminPuzzleDay) => {
    if (d.relation !== 'future' || d.scoreCount > 0)
      return t('locked-played', { defaultValue: 'Players have already played this puzzle' });
    return t('locked-soon', { defaultValue: 'This day is about to start, so its puzzle cannot be replaced' });
  };

  const tabs = REPORTABLE_MODES.map((id) => ({ id, label: modeTitle(id) }));

  return (
    <div className="space-y-6">
      <Tabs
        tabs={tabs}
        value={mode}
        onChange={(id) => setMode(id as DailyPuzzleMode)}
        idBase="daily-puzzles"
        aria-label={t('modes-label', { defaultValue: 'Puzzle modes' })}
      />

      {list.isPending ? (
        <div className="space-y-3" aria-busy="true" aria-label={t('loading', { defaultValue: 'Loading puzzles' })}>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : list.isError ? (
        <div role="alert" className="space-y-3 border-b border-site-border py-4">
          <p className="t-body text-site-danger">{t('load-failed', { defaultValue: 'The puzzles did not load.' })}</p>
          <Button variant="default" onClick={() => void list.refetch()}>
            {t('retry-load', { defaultValue: 'Try again' })}
          </Button>
        </div>
      ) : (
        <div
          id={`daily-puzzles-panel-${mode}`}
          role="tabpanel"
          aria-labelledby={`daily-puzzles-tab-${mode}`}
          className={arrival}
        >
          {list.data.days.length === 0 ? (
            <EmptyState
              title={t('empty-title', { defaultValue: 'No days to show' })}
              description={t('empty-description', { defaultValue: 'There are no puzzle days for this mode.' })}
            />
          ) : (
            list.data.days.map((d) => {
              const total = REPORT_KINDS.reduce((n, k) => n + d.reportCounts[k], 0);
              return (
                <section
                  key={d.dateKey}
                  aria-labelledby={`day-${d.dateKey}`}
                  className="space-y-3 border-b border-site-border py-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 id={`day-${d.dateKey}`} className="t-heading text-site-text">
                      <span dir="ltr">{d.dateKey}</span> <span className="t-label">{relationLabel(d)}</span>
                    </h2>
                    <p className="t-meta text-site-text-muted">
                      {d.puzzle ? sourceLabel(d.puzzle.source) : t('no-puzzle', { defaultValue: 'Not generated yet' })}
                      {' · '}
                      {t('score-count', { defaultValue: '{{n}} scores', n: fmt.number(d.scoreCount) })}
                    </p>
                  </div>

                  {d.puzzle ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1">
                        <h3 className="t-label">{t('puzzle-heading', { defaultValue: 'Puzzle' })}</h3>
                        <p dir="auto" className="t-body whitespace-pre-wrap break-words text-site-text">
                          {d.puzzle.puzzleText}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <h3 className="t-label">{t('answer-heading', { defaultValue: 'Answer' })}</h3>
                        <p dir="auto" className="t-body whitespace-pre-wrap break-words text-site-text">
                          {d.puzzle.answerText}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-3">
                    {d.generatable ? (
                      <Button variant="default" disabled={busy === d.dateKey} onClick={() => void generate(d)}>
                        {t('generate', { defaultValue: 'Generate now' })}
                      </Button>
                    ) : null}
                    {d.replaceable ? (
                      <Button variant="default" disabled={busy === d.dateKey} onClick={() => void replace(d)}>
                        {t('replace', { defaultValue: 'Replace' })}
                      </Button>
                    ) : d.puzzle ? (
                      <p className="t-meta text-site-text-muted">{lockedNote(d)}</p>
                    ) : null}
                  </div>
                  <DayReview day={d} mode={mode} onDone={refresh} />

                  <div className="space-y-2">
                    <h3 className="t-label">{t('reports-heading', { defaultValue: 'Reports' })}</h3>
                    {total === 0 ? (
                      <p className="t-meta text-site-text-muted">{t('no-reports', { defaultValue: 'No reports' })}</p>
                    ) : (
                      <>
                        <p className="t-meta text-site-text-muted">
                          {REPORT_KINDS.filter((k) => d.reportCounts[k] > 0)
                            .map((k) => `${kindLabel[k]}: ${fmt.number(d.reportCounts[k])}`)
                            .join(' · ')}
                        </p>
                        <ul className="space-y-1">
                          {d.reports.map((r) => (
                            <li key={r.id} className="t-body text-site-text">
                              <span className="t-meta text-site-text-muted">
                                {r.handle ? <bdi>@{r.handle}</bdi> : t('no-handle', { defaultValue: 'No handle' })}
                                {' · '}
                                {kindLabel[r.kind]}
                              </span>
                              {r.note ? (
                                <p dir="auto" className="whitespace-pre-wrap break-words">
                                  {r.note}
                                </p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </section>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A day's review (s15-07): what was concluded, how many reports are still open, and "Mark reviewed" while any are. One
 * outcome and an optional note cover every open report of the day; each reporter is told once. The note reaches only
 * members who finished the puzzle (a report needs a score row), and it must still never quote the answer.
 */
function DayReview({
  day,
  mode,
  onDone,
}: {
  day: AdminPuzzleDay;
  mode: DailyPuzzleMode;
  onDone: () => Promise<unknown>;
}) {
  const { t } = useTranslation('fix-notices');
  const fmt = useLocaleFormat();
  const refusalText = useRefusalText();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<ReviewOutcome>('stands');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const outcomeLabel: Record<ReviewOutcome, string> = {
    fault: t('outcome-fault', { defaultValue: 'You were right: the puzzle had a fault. Thank you.' }),
    stands: t('outcome-stands', { defaultValue: 'We checked the puzzle and its answer stands.' }),
  };

  const submit = async () => {
    if (sending) return;
    setSending(true);
    try {
      const out = await api(reviewReportsApi, {
        body: { gameMode: mode, dateKey: day.dateKey, outcome, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      toast.success(
        out.reviewed > 0
          ? t('review-done', { defaultValue: 'The reports were marked reviewed.' })
          : t('review-none', { defaultValue: 'Nothing to review: another admin already did.' }),
      );
      setOpen(false);
      setNote('');
    } catch (error) {
      toast.error(
        refusalText.maybe(error) ??
          t('review-failed', { defaultValue: 'The reports were not marked reviewed. Try again.' }),
      );
    } finally {
      setSending(false);
      await onDone();
    }
  };

  if (day.openReportCount === 0 && !day.review) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {day.review ? (
        <p className="t-meta text-site-text-muted">
          {day.review.outcome === 'fault'
            ? t('review-state-fault', { defaultValue: 'Reviewed: the puzzle had a fault' })
            : t('review-state-stands', { defaultValue: 'Reviewed: the answer stands' })}
          {day.openReportCount > 0
            ? ` · ${t('review-open-count', { defaultValue: '{{n}} still open', n: fmt.number(day.openReportCount) })}`
            : ''}
        </p>
      ) : null}
      {day.openReportCount > 0 ? (
        <Button variant="default" onClick={() => setOpen(true)}>
          {t('review-open', { defaultValue: 'Mark reviewed' })}
        </Button>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('review-title', { defaultValue: 'Mark these reports reviewed' })}</DialogTitle>
            <DialogDescription>
              {t('review-description', {
                defaultValue:
                  'Each member with an open report on this day is told the outcome once. The puzzle and the scores do not change. The action is recorded in the audit log.',
              })}
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-1.5">
            <legend className="sr-only">{t('review-outcome-legend', { defaultValue: 'Outcome' })}</legend>
            {REVIEW_OUTCOMES.map((value) => (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-3 rounded-site-sm border px-3 py-2 t-body ${
                  outcome === value
                    ? 'border-site-text text-site-text'
                    : 'border-site-border text-site-text-muted hover:bg-site-surface-hover'
                }`}
              >
                <input
                  type="radio"
                  name={`review-outcome-${day.dateKey}`}
                  value={value}
                  checked={outcome === value}
                  onChange={() => setOutcome(value)}
                  className="accent-(--site-accent)"
                />
                {outcomeLabel[value]}
              </label>
            ))}
          </fieldset>
          <div className="space-y-1.5">
            <label htmlFor={`review-note-${day.dateKey}`} className="t-label block">
              {t('review-note-label', { defaultValue: 'Note to the reporters (optional)' })}
            </label>
            <p id={`review-note-hint-${day.dateKey}`} className="t-meta text-site-text-muted">
              {t('review-note-hint', {
                defaultValue: 'Each reporter is shown this note, as plain text, with the outcome.',
              })}
            </p>
            <Textarea
              id={`review-note-${day.dateKey}`}
              aria-describedby={`review-note-hint-${day.dateKey}`}
              placeholder={t('review-note-placeholder', {
                defaultValue: 'Reporters have played this puzzle. Add a note (optional)',
              })}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={REVIEW_NOTE_MAX}
              rows={3}
              dir="auto"
              className="min-h-0 resize-none px-3 py-2"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
              {t('review-cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={sending}>
              {t('review-submit', { defaultValue: 'Mark reviewed' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
