'use client';

/**
 * The lint panel — `docs/slice-it-chart-editor.md` §9.
 *
 * Grouped by rule with a count, expandable, and every row seeks the playhead to
 * the note at fault. Grouping is the design decision that matters: a chart with
 * forty off-grid notes produces forty findings, and forty rows is a list an
 * author scrolls past, while "off-grid × 40" is a thing they can decide about.
 *
 * Errors sort above warnings and are the only severity that disables Publish,
 * so the panel reads top-down as "what stops me shipping" then "what someone
 * might tell me about later".
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  OctagonAlert,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { publishChart } from '@/lib/slice-it/editor/api-client';
import { useEditorStore } from '@/lib/slice-it/editor/store';
import { groupFindings, type LintCode, type ScopedFinding } from '@/lib/slice-it/editor/lint';
import { formatTime } from './Timeline';

/** How many findings one expanded group lists before it stops. */
const ROWS_PER_GROUP = 12;

export function LintPanel({
  onBeforePublish,
}: { onBeforePublish?: () => Promise<void> | void } = {}) {
  const { t } = useTranslation('r-slice-it');
  const lint = useEditorStore((s) => s.lint);
  const active = useEditorStore((s) => s.active);
  const setActive = useEditorStore((s) => s.setActive);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const setSelection = useEditorStore((s) => s.setSelection);
  const setLintFocus = useEditorStore((s) => s.setLintFocus);
  const chartId = useEditorStore((s) => s.chartIds[s.active]);
  const status = useEditorStore((s) => s.chartStatus[s.active]);
  const setChartStatus = useEditorStore((s) => s.setChartStatus);
  const [scopeAll, setScopeAll] = useState(false);
  const [expanded, setExpanded] = useState<LintCode | null>(null);
  const [publishing, setPublishing] = useState(false);

  const groups = groupFindings(lint, scopeAll ? undefined : active);
  const errors = groups.reduce(
    (sum, group) => sum + (group.severity === 'error' ? group.findings.length : 0),
    0,
  );
  const warnings = groups.reduce(
    (sum, group) => sum + (group.severity === 'warning' ? group.findings.length : 0),
    0,
  );

  const labels: Record<LintCode, string> = {
    'unhittable-jack': t('editor-lint-unhittable-jack', { defaultValue: 'Unhittable jack' }),
    'too-early': t('editor-lint-too-early', { defaultValue: 'Inside the lead-in' }),
    'hold-too-short': t('editor-lint-hold-too-short', { defaultValue: 'Hold too short' }),
    'density-spike': t('editor-lint-density-spike', { defaultValue: 'Density spike' }),
    'empty-stretch': t('editor-lint-empty-stretch', { defaultValue: 'Empty stretch' }),
    'off-grid': t('editor-lint-off-grid', { defaultValue: 'Off the grid' }),
    'nesting-violation': t('editor-lint-nesting', { defaultValue: 'Missing from a higher tier' }),
  };

  /** Seek to a finding, switching difficulty when the finding is on another. */
  const goTo = (finding: ScopedFinding) => {
    if (finding.difficulty !== active) setActive(finding.difficulty);
    setPlayhead(finding.time);
    setLintFocus({ code: finding.code, time: finding.time });
    if (finding.noteId) setSelection([finding.noteId]);
  };

  const activeErrors = lint.perDifficulty[active]?.errors ?? 0;
  const published = status === 'public' || status === 'ranked';

  /**
   * Publish the open difficulty.
   *
   * Saves first, always. Publishing flips a flag on the row the SERVER holds,
   * and unsaved edits are not in that row — an author who fixed the last error
   * and hit Publish would otherwise publish the version that still had it, and
   * the endpoint would lint the old notes and refuse for a reason that is no
   * longer on screen.
   */
  const onPublish = async () => {
    if (!chartId || publishing) return;
    setPublishing(true);
    try {
      await onBeforePublish?.();
      const next = published ? 'draft' : 'public';
      const dto = await publishChart(chartId, next);
      setChartStatus(active, dto.status);
      toast.success(
        next === 'public'
          ? t('editor-publish-ok', { defaultValue: 'Chart published' })
          : t('editor-unpublish-ok', { defaultValue: 'Chart returned to draft' }),
      );
    } catch (cause: unknown) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : t('editor-publish-failed', { defaultValue: 'Could not publish this chart' }),
      );
    } finally {
      setPublishing(false);
    }
  };

  return (
    <section
      className="neumorphic flex flex-col gap-3 p-4"
      aria-label={t('editor-lint-title', { defaultValue: 'Chart checks' })}
    >
      <header className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">
          {t('editor-lint-title', { defaultValue: 'Chart checks' })}
        </h2>
        <span className="ml-auto flex items-center gap-3 text-xs tabular-nums">
          <span className="flex items-center gap-1" title={t('editor-lint-errors', { defaultValue: 'Errors' })}>
            <OctagonAlert className="h-3.5 w-3.5 text-[var(--slice-danger,#dc2626)]" aria-hidden />
            {errors}
            <span className="sr-only">{t('editor-lint-errors', { defaultValue: 'Errors' })}</span>
          </span>
          <span
            className="flex items-center gap-1"
            title={t('editor-lint-warnings', { defaultValue: 'Warnings' })}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-[var(--slice-warning,#d97706)]" aria-hidden />
            {warnings}
            <span className="sr-only">
              {t('editor-lint-warnings', { defaultValue: 'Warnings' })}
            </span>
          </span>
        </span>
      </header>

      <button
        type="button"
        aria-pressed={scopeAll}
        onClick={() => setScopeAll((value) => !value)}
        className={cn(
          'self-start px-2.5 py-1 text-xs transition-colors',
          scopeAll ? 'neumorphic-active' : 'neumorphic-sm',
        )}
      >
        {scopeAll
          ? t('editor-lint-scope-all', { defaultValue: 'All difficulties' })
          : t('editor-lint-scope-active', { defaultValue: 'This difficulty' })}
      </button>

      {groups.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-sm opacity-75">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {t('editor-lint-clean', { defaultValue: 'No problems found.' })}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {groups.map((group) => {
            const open = expanded === group.code;
            const Chevron = open ? ChevronDown : ChevronRight;
            return (
              <li key={group.code}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? null : group.code)}
                  className="neumorphic-sm flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                >
                  <Chevron className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                  {group.severity === 'error' ? (
                    <OctagonAlert
                      className="h-4 w-4 shrink-0 text-[var(--slice-danger,#dc2626)]"
                      aria-hidden
                    />
                  ) : (
                    <AlertTriangle
                      className="h-4 w-4 shrink-0 text-[var(--slice-warning,#d97706)]"
                      aria-hidden
                    />
                  )}
                  <span className="truncate">{labels[group.code]}</span>
                  <span className="ml-auto tabular-nums opacity-70">{group.findings.length}</span>
                </button>

                {open && (
                  <ul className="mt-1.5 flex flex-col gap-1 pl-6">
                    {group.findings.slice(0, ROWS_PER_GROUP).map((finding, index) => (
                      <li key={`${finding.noteId ?? 'span'}-${index}`}>
                        <button
                          type="button"
                          onClick={() => goTo(finding)}
                          className="neumorphic-inset flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left text-xs"
                        >
                          <span className="font-mono tabular-nums opacity-80">
                            {formatTime(finding.time)}
                          </span>
                          {scopeAll && (
                            <span className="shrink-0 opacity-60">{finding.difficulty}</span>
                          )}
                          <span className="truncate opacity-85">{finding.message}</span>
                        </button>
                      </li>
                    ))}
                    {group.findings.length > ROWS_PER_GROUP && (
                      <li className="px-2.5 py-1 text-xs opacity-60">
                        {t('editor-lint-more', {
                          defaultValue: '+{{count}} more',
                          count: group.findings.length - ROWS_PER_GROUP,
                        })}
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => void onPublish()}
          disabled={!chartId || publishing || (!published && activeErrors > 0)}
          className="neumorphic-sm flex h-9 items-center justify-center gap-2 px-3 text-sm disabled:opacity-40"
        >
          {publishing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="h-4 w-4" aria-hidden />
          )}
          {published
            ? t('editor-unpublish', { defaultValue: 'Return to draft' })
            : t('editor-publish', { defaultValue: 'Publish this difficulty' })}
        </button>
        {!published && activeErrors > 0 && (
          <p className="text-xs opacity-70">
            {t('editor-publish-blocked', {
              defaultValue: 'Errors block publishing; warnings do not.',
            })}
          </p>
        )}
      </div>
    </section>
  );
}
