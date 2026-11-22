/**
 * RMHType analytics: the summary, the heatmap, your worst keys, and the tests built out of them (design G1).
 *
 * "Practise these keys" is the point of the whole feature: analytics that only describe a problem are a dashboard,
 * and a dashboard is not a reason to come back. The generated test is weighted toward the keys this panel just
 * showed, which closes the loop: measure, see, drill, measure.
 *
 * Reads go through React Query (`rmhTypeKeyStatsQuery`); clear and the practice test are mutations. Custom and
 * practice tests are labelled as excluded from global boards everywhere they appear, because they are
 * (`isLeaderboardEligible` in `lib/rmhtype/custom-test.ts` decides it; this component only reports it).
 *
 * `TypingStatsView` is the presentation, a pure function of its props, so the states render without a query client.
 * Existing strings keep their `c-rmhtype` keys; new ones live in `weak-keys`.
 *
 * The heatmap is painted in the site token contract rather than the `--app-*` palette on purpose: its correctness
 * argument is that it inherits the colour-vision retint, which applies to `--site-success`, `--site-warning` and
 * `--site-danger`. See the note in `./KeyHeatmap`.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { Target, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import type { GeneratedTest } from '@/lib/rmhtype/custom-test';
import { DEFAULT_LAYOUT, TYPING_LAYOUTS, type KeyMetrics, type TypingLayout, type TypingSummary } from '@/lib/rmhtype/keystats';
import {
  RMHTYPE_KEYSTATS_KEY,
  buildKeyPracticeTest,
  clearKeyStats,
  rmhTypeKeyStatsQuery,
} from '@/lib/rmhtype/rmhtype.queries';
import { KeyHeatmap } from './KeyHeatmap';
import { CustomTestPanel } from './CustomTestPanel';
import { useArrival } from '@/components/ui/arrive';

export interface KeyStatsData {
  layout: TypingLayout;
  keys: KeyMetrics[];
  worst: KeyMetrics[];
  summary: TypingSummary;
}

export type KeyStatsStatus = 'loading' | 'error' | 'ready';

interface TypingStatsProps {
  /** Hand the generated passage to the typing view. */
  onStartTest?: (test: GeneratedTest) => void;
  className?: string;
}

export function TypingStats({ onStartTest, className }: TypingStatsProps) {
  const { t } = useTranslation('weak-keys');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [layout, setLayout] = useState<TypingLayout>(DEFAULT_LAYOUT);
  const [punctuation, setPunctuation] = useState(false);
  const [numbers, setNumbers] = useState(false);

  const query = useQuery(rmhTypeKeyStatsQuery(layout));
  const stats: KeyStatsData | null = query.data?.stats ?? null;

  const practice = useMutation({
    mutationFn: () => buildKeyPracticeTest({ layout, punctuation, numbers }),
    onSuccess: (data) => {
      if (!data?.test) {
        toast.error(t('practice-failed', { defaultValue: 'Could not build a practice test.' }));
        return;
      }
      onStartTest?.(data.test);
    },
    onError: () => toast.error(t('practice-failed', { defaultValue: 'Could not build a practice test.' })),
  });

  const clear = useMutation({
    mutationFn: () => clearKeyStats(layout),
    onSuccess: () => {
      toast.success(t('clear-done', { defaultValue: 'Key statistics cleared.' }));
      void queryClient.invalidateQueries({ queryKey: RMHTYPE_KEYSTATS_KEY });
    },
    onError: () => toast.error(t('clear-failed', { defaultValue: 'Could not clear your key statistics.' })),
  });

  const onClear = async () => {
    const ok = await confirm({
      title: t('clear-title', { defaultValue: 'Clear your key statistics?' }),
      description: t('clear-description', {
        defaultValue: 'This removes the counts for {{layout}}. Your runs and best scores stay.',
        layout,
      }),
      confirmLabel: t('clear-confirm', { defaultValue: 'Clear statistics' }),
      danger: true,
    });
    if (ok) clear.mutate();
  };

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <TypingStatsView
        layout={layout}
        onLayoutChange={setLayout}
        status={query.isError ? 'error' : query.data ? 'ready' : 'loading'}
        stats={stats}
        onRetry={() => void query.refetch()}
        onPractice={() => practice.mutate()}
        practicing={practice.isPending}
        onClear={() => void onClear()}
        clearing={clear.isPending}
      />
      <CustomTestPanel
        onStartTest={onStartTest}
        punctuation={punctuation}
        numbers={numbers}
        onPunctuation={setPunctuation}
        onNumbers={setNumbers}
      />
    </div>
  );
}

interface TypingStatsViewProps {
  layout: TypingLayout;
  onLayoutChange: (layout: TypingLayout) => void;
  status: KeyStatsStatus;
  stats: KeyStatsData | null;
  onRetry: () => void;
  onPractice: () => void;
  practicing: boolean;
  onClear: () => void;
  clearing: boolean;
}

export function TypingStatsView({
  layout,
  onLayoutChange,
  status,
  stats,
  onRetry,
  onPractice,
  practicing,
  onClear,
  clearing,
}: TypingStatsViewProps) {
  const { t } = useTranslation('weak-keys');
  const arrival = useArrival(status !== 'loading');
  const summary = stats?.summary;
  const hasData = (summary?.totalAttempts ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-app-text-muted">
          {t('recorded-note', {
            defaultValue:
              'Counts per key: how often you pressed it, how often it was wrong, and how long it took. The order of what you typed is never stored.',
          })}
        </p>
        <Select
          value={layout}
          onChange={(event) => onLayoutChange(event.target.value as TypingLayout)}
          aria-label={t('layout-label', { ns: 'c-rmhtype', defaultValue: 'Keyboard layout' })}
          controlSize="sm"
          containerClassName="min-w-32"
        >
          {TYPING_LAYOUTS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </Select>
      </div>

      {status === 'loading' ? (
        <div
          className="space-y-3"
          role="status"
          aria-label={t('loading', { defaultValue: 'Loading your key statistics' })}
        >
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : status === 'error' ? (
        <div>
          <p className="text-app-danger">
            {t('load-failed', { defaultValue: 'Could not load your key statistics.' })}
          </p>
          <button type="button" className="mt-2 underline hover:text-app-text" onClick={onRetry}>
            {t('retry', { defaultValue: 'Try again' })}
          </button>
        </div>
      ) : !hasData ? (
        <div className={cn('py-4', arrival)}>
          <p className="t-heading">{t('keys-empty-title', { ns: 'c-rmhtype', defaultValue: 'No key data yet' })}</p>
          <p className="mt-1 max-w-prose text-app-text-muted">
            {t('keys-empty-body', {
              ns: 'c-rmhtype',
              defaultValue:
                'Finish a test on this layout and every key you pressed gets a speed and an error rate — never the words you typed.',
            })}
          </p>
        </div>
      ) : (
        // Box-less, so the parts stay items of the column's flex layout; they fade in (M9).
        <div className={arrival ? 'arrive-group' : 'contents'}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Figure
              label={t('stat-wpm', { ns: 'c-rmhtype', defaultValue: 'Implied WPM' })}
              value={Math.round(summary?.impliedWpm ?? 0)}
            />
            <Figure
              label={t('stat-accuracy', { ns: 'c-rmhtype', defaultValue: 'Accuracy' })}
              value={`${Math.round((summary?.accuracy ?? 0) * 100)}%`}
            />
            <Figure
              label={t('stat-per-key', { ns: 'c-rmhtype', defaultValue: 'Per key' })}
              value={`${Math.round(summary?.msPerKey ?? 0)} ms`}
            />
            <Figure label={t('stat-keys', { ns: 'c-rmhtype', defaultValue: 'Keys tracked' })} value={summary?.trackedKeys ?? 0} />
          </dl>

          <KeyHeatmap keys={stats?.keys ?? []} layout={layout} />

          {(stats?.worst.length ?? 0) > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="t-label">{t('worst-title', { ns: 'c-rmhtype', defaultValue: 'Worst keys' })}</h3>
              <ul>
                {stats?.worst.map((metric) => (
                  <li
                    key={metric.key}
                    className="flex items-center justify-between gap-4 border-b border-app-border py-2"
                  >
                    <span className="font-mono text-app-text">{metric.key === ' ' ? '␣' : metric.key}</span>
                    <span className="font-mono text-xs tabular-nums text-app-text-muted">
                      {t('worst-reading', {
                        ms: Math.round(metric.msPerKey),
                        rate: Math.round(metric.errorRate * 100),
                        defaultValue: '{{ms}} ms per key, {{rate}}% missed',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onPractice} loading={practicing}>
              <Target className="size-4" aria-hidden />
              {t('practise-action', { defaultValue: 'Practise these keys' })}
            </Button>
            <Button variant="ghost" onClick={onClear} disabled={clearing}>
              <Trash2 className="size-4" aria-hidden />
              {t('clear-action', { ns: 'c-rmhtype', defaultValue: 'Clear key stats' })}
            </Button>
          </div>
          <p className="text-xs text-app-text-muted">
            {t('practice-note', { defaultValue: 'Practice, not on the boards.' })}
          </p>
        </div>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs text-app-text-muted">{label}</dt>
      <dd className="font-mono text-lg tabular-nums text-app-text">{value}</dd>
    </div>
  );
}
