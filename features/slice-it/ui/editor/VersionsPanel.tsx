/**
 * Versions: the saves the editor has been writing, over the chart's `ChartRevision` rows.
 *
 * A dialog of rows, newest first and grouped by day in the member's zone. Each row can be previewed (drawn over the
 * timeline in the ghost layer the generator's preview uses, nothing is applied) and restored. Restore is an EDIT: the
 * stored notes replace the difficulty's notes as one undoable command, and the member saves it through the same PATCH
 * as any other edit, so a published chart's lint still applies. Nothing here writes to the server except "Save a
 * version", which the editor performs through its own save.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { useArrival } from '@/components/ui/arrive';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { apiQuery } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { listChartRevisionsApi } from '@features/slice-it/engine/charts.contract';
import { getRevision, VERSIONS_LIMIT } from '@features/slice-it/engine/editor/api-client';
import type { ChartRevisionDto } from '@features/slice-it/engine/editor/api-schemas';
import { REVISION_LABEL_MAX } from '@features/slice-it/engine/constants';
import {
  groupVersionsByDay,
  restoreVersionCommand,
  versionPreviewPlan,
} from '@features/slice-it/engine/editor/restore';
import { editorState, useEditorStore } from '@features/slice-it/engine/editor/store';
import type { Difficulty, Slice } from '@features/slice-it/engine/editor/types';

const ROW = 'flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-site-border py-3';

/** The member's own zone; UTC where the browser will not say. */
function memberTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Put `stored` into the editor as one undoable restore, and say so with an Undo that only undoes this restore.
 * Shared by the list's Restore and the preview bar's.
 */
function useRestore() {
  const { t } = useTranslation('chart-history');
  return (difficulty: Difficulty, stored: readonly Slice[], when: string) => {
    const state = editorState();
    const command = restoreVersionCommand(
      difficulty,
      state.charts[difficulty].notes,
      stored,
      `Restore version from ${when}`,
    );
    if (!command) {
      toast.info(t('restore-same', { defaultValue: 'That version is the same as the chart now' }));
      return false;
    }
    state.apply(command);
    toast.success(t('restored', { when, defaultValue: 'Restored the version from {{when}}' }), {
      action: {
        label: t('restored-undo', { defaultValue: 'Undo' }),
        // Only while the restore is still the last step: a later edit must not be undone by this button.
        onClick: () => {
          if (editorState().undoStack.at(-1) === command) editorState().undo();
        },
      },
    });
    return true;
  };
}

interface VersionsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Save the open difficulty as a named version. Resolves true when it was written. */
  onSaveVersion: (label: string) => Promise<boolean>;
  /** A version is being previewed: the editor shows the preview bar with this time. */
  onPreview: (when: string) => void;
}

export function VersionsPanel({ open, onOpenChange, onSaveVersion, onPreview }: VersionsPanelProps) {
  const { t } = useTranslation('chart-history');
  const fmt = useLocaleFormat();
  const prompt = usePrompt();
  const refusalText = useRefusalText();
  const queryClient = useQueryClient();
  const restore = useRestore();
  const active = useEditorStore((s) => s.active);
  const chartId = useEditorStore((s) => s.chartIds[s.active]);
  const [busy, setBusy] = useState<string | null>(null);

  const versions = useQuery({
    ...apiQuery(listChartRevisionsApi, { params: { id: chartId ?? '' }, query: { limit: VERSIONS_LIMIT } }),
    enabled: open && chartId !== null,
    // A save can land while the dialog is closed: always show the server's list when it opens.
    staleTime: 0,
  });
  const arrival = useArrival(!versions.isPending);

  const kindLabel = (kind: string): string =>
    kind === 'manual'
      ? t('kind-manual', { defaultValue: 'Saved version' })
      : kind === 'publish'
        ? t('kind-publish', { defaultValue: 'Published' })
        : t('kind-autosave', { defaultValue: 'Autosave' });

  const clock = (iso: string) => fmt.time(iso, { hour: 'numeric', minute: '2-digit' });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: [listChartRevisionsApi.path] });

  const act = async (version: ChartRevisionDto, mode: 'preview' | 'restore') => {
    if (!chartId || busy) return;
    setBusy(version.id);
    try {
      const detail = await getRevision(chartId, version.id);
      const when = clock(version.createdAt);
      const current = editorState().charts[active].notes;
      if (mode === 'restore') {
        restore(active, detail.notes, when);
        onOpenChange(false);
      } else {
        editorState().setVersionPreview(versionPreviewPlan(active, current, detail.notes));
        onPreview(when);
        onOpenChange(false);
      }
    } catch (cause) {
      toast.error(refusalText(cause));
      // A version pruned between the list and the click: the list is out of date.
      if (cause instanceof HttpError && cause.status === 404) refresh();
    } finally {
      setBusy(null);
    }
  };

  const saveVersion = async () => {
    const name = await prompt({
      title: t('save-title', { defaultValue: 'Name this version' }),
      label: t('save-label', { defaultValue: 'Name' }),
      confirmLabel: t('save-confirm', { defaultValue: 'Save version' }),
      cancelLabel: t('save-cancel', { defaultValue: 'Cancel' }),
      validate: (value) => {
        const trimmed = value.trim();
        if (trimmed.length === 0) return t('save-empty', { defaultValue: 'Enter a name.' });
        if (trimmed.length > REVISION_LABEL_MAX)
          return t('save-long', { max: REVISION_LABEL_MAX, defaultValue: 'Use at most {{max}} characters.' });
        return null;
      },
    });
    if (name === null) return;
    if (await onSaveVersion(name.trim())) refresh();
  };

  const groups = groupVersionsByDay(versions.data?.revisions ?? [], memberTimeZone());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title', { defaultValue: 'Versions' })}</DialogTitle>
          <DialogDescription>
            {t('description', {
              defaultValue:
                'Earlier saves of this difficulty. Preview draws a version over the timeline. Restore puts its notes back as one edit that you can undo, and you save it as usual.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div>
          <Button type="button" onClick={() => void saveVersion()} disabled={!chartId}>
            {t('save-version', { defaultValue: 'Save a version' })}
          </Button>
        </div>

        <div className="max-h-[50dvh] overflow-y-auto">
          {chartId === null ? (
            <EmptyState
              title={t('no-chart-title', { defaultValue: 'Nothing to show yet' })}
              description={t('no-chart-description', { defaultValue: 'This difficulty has not been saved yet.' })}
            />
          ) : versions.isPending ? (
            <div className="flex flex-col gap-3 py-3" aria-busy="true">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : versions.isError ? (
            <EmptyState
              title={t('error-title', { defaultValue: 'Could not load versions' })}
              description={refusalText(versions.error)}
              action={
                <Button type="button" onClick={() => void versions.refetch()}>
                  {t('error-retry', { defaultValue: 'Try again' })}
                </Button>
              }
            />
          ) : groups.length === 0 ? (
            <EmptyState
              title={t('empty-title', { defaultValue: 'No versions yet' })}
              description={t('empty-description', { defaultValue: 'Saves appear here as you edit.' })}
            />
          ) : (
            <div className={arrival}>
              {groups.map((group) => (
                <section key={group.day} aria-labelledby={`versions-day-${group.day}`}>
                  <h3 id={`versions-day-${group.day}`} className="t-label pt-3">
                    {fmt.date(new Date(`${group.day}T12:00:00`), { dateStyle: 'full' })}
                  </h3>
                  <ul>
                    {group.items.map((version) => {
                      const when = clock(version.createdAt);
                      return (
                        <li key={version.id} className={ROW}>
                          <div className="min-w-0 flex-1">
                            <p className="t-body">
                              <span className="font-medium">{kindLabel(version.kind)}</span>
                              {version.label ? (
                                <>
                                  {' '}
                                  <span dir="auto" className="break-words">
                                    {version.label}
                                  </span>
                                </>
                              ) : null}
                            </p>
                            <p className="t-meta">
                              {when}
                              {' · '}
                              {t('note-count', {
                                count: version.noteCount,
                                defaultValue_one: '{{count}} note',
                                defaultValue_other: '{{count}} notes',
                              })}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy !== null}
                            aria-label={t('preview-aria', {
                              when,
                              defaultValue: 'Preview the version from {{when}}',
                            })}
                            onClick={() => void act(version, 'preview')}
                          >
                            {t('preview', { defaultValue: 'Preview' })}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy !== null}
                            aria-label={t('restore-aria', {
                              when,
                              defaultValue: 'Restore the version from {{when}}',
                            })}
                            onClick={() => void act(version, 'restore')}
                          >
                            {t('restore', { defaultValue: 'Restore' })}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The line over the timeline while a version is being previewed: what the preview shows, with Restore and a way out.
 * Hidden when there is no preview for the open difficulty (any edit, undo or redo clears it).
 */
export function VersionPreviewBar({ when, onClose }: { when: string; onClose: () => void }) {
  const { t } = useTranslation('chart-history');
  const restore = useRestore();
  const plan = useEditorStore((s) => s.versionPreview);
  const active = useEditorStore((s) => s.active);
  if (!plan || plan.difficulty !== active) return null;

  const stop = () => {
    editorState().setVersionPreview(null);
    onClose();
  };

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-site-border py-2">
      <p className="t-body min-w-0 flex-1">
        {t('preview-bar', {
          when,
          added: plan.added.length,
          removed: plan.removed.length,
          defaultValue:
            'Previewing the version from {{when}}. Outlined notes are in it and not in the chart, struck notes are in the chart and not in it ({{added}} and {{removed}}).',
        })}
      </p>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          restore(plan.difficulty, plan.next, when);
          stop();
        }}
      >
        {t('restore', { defaultValue: 'Restore' })}
      </Button>
      <Button type="button" size="sm" onClick={stop}>
        {t('preview-stop', { defaultValue: 'Stop preview' })}
      </Button>
    </div>
  );
}
