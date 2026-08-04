'use client';

/**
 * RMHType analytics: the summary, the heatmap, your worst keys, and the two
 * tests built out of them (design G1).
 *
 * The "practice your worst keys" button is the point of the whole feature —
 * analytics that only describe a problem are a dashboard, and a dashboard is not
 * a reason to come back. The generated test is weighted toward the keys this
 * panel just showed you, which closes the loop: measure → see → drill → measure.
 *
 * Custom and practice tests are labelled as excluded from global boards
 * everywhere they appear, because they are. `isLeaderboardEligible` in
 * `lib/rmhtype/custom-test.ts` is where that is decided; this component only
 * reports it.
 *
 * Painted in the site token contract rather than the `--app-*` app palette: the
 * heatmap's whole correctness argument is that it inherits the colour-vision
 * retint, and that retint applies to `--site-success` / `--site-warning` /
 * `--site-danger` (app/globals.css). See the note in `./KeyHeatmap`.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Keyboard, Target, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import {
  DEFAULT_LAYOUT,
  TYPING_LAYOUTS,
  type KeyMetrics,
  type TypingLayout,
  type TypingSummary,
} from '@/lib/rmhtype/keystats';
import { buildCustomTest, type GeneratedTest } from '@/lib/rmhtype/custom-test';
import { KeyHeatmap } from './KeyHeatmap';

interface KeyStatsResponse {
  layout: TypingLayout;
  keys: KeyMetrics[];
  worst: KeyMetrics[];
  summary: TypingSummary;
}

interface TypingStatsProps {
  /** Hand the generated passage to the typing view. */
  onStartTest?: (test: GeneratedTest) => void;
  className?: string;
}

export function TypingStats({ onStartTest, className }: TypingStatsProps) {
  const { t } = useTranslation('c-rmhtype');
  const [layout, setLayout] = useState<TypingLayout>(DEFAULT_LAYOUT);
  const [stats, setStats] = useState<KeyStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [pasted, setPasted] = useState('');
  const [punctuation, setPunctuation] = useState(false);
  const [numbers, setNumbers] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rmhtype/keystats?layout=${layout}`);
      const data = (await res.json().catch(() => null)) as { stats?: KeyStatsResponse } | null;
      setStats(res.ok ? (data?.stats ?? null) : null);
    } finally {
      setLoading(false);
    }
  }, [layout]);

  useEffect(() => {
    void load();
  }, [load]);

  async function practiceWorstKeys() {
    setGenerating(true);
    try {
      const res = await fetch('/api/rmhtype/practice-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout, punctuation, numbers }),
      });
      const data = (await res.json().catch(() => null)) as { test?: GeneratedTest } | null;
      if (!res.ok || !data?.test) {
        toast.error(t('practice-failed', { defaultValue: 'Could not build a practice test' }));
        return;
      }
      onStartTest?.(data.test);
      toast.success(
        t('practice-ready', {
          defaultValue: 'Practice test ready — it does not count toward global boards',
        }),
      );
    } finally {
      setGenerating(false);
    }
  }

  function startCustom() {
    const text = pasted.trim();
    if (text.length === 0) return;
    onStartTest?.(buildCustomTest({ mode: 'custom', text }));
  }

  async function clearStats() {
    const res = await fetch(`/api/rmhtype/keystats?layout=${layout}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error(t('clear-failed', { defaultValue: 'Could not clear your key stats' }));
      return;
    }
    toast.success(t('clear-done', { defaultValue: 'Key stats cleared' }));
    await load();
  }

  const summary = stats?.summary;
  const hasData = (summary?.totalAttempts ?? 0) > 0;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <Card pane className="px-5 sm:px-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-medium text-site-text">
              {t('keys-title', { defaultValue: 'Your keys' })}
            </h2>
            <Select
              value={layout}
              onChange={(event) => setLayout(event.target.value as TypingLayout)}
              aria-label={t('layout-label', { defaultValue: 'Keyboard layout' })}
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

          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : !hasData ? (
            <EmptyState
              icon={Keyboard}
              title={t('keys-empty-title', { defaultValue: 'No key data yet' })}
              description={t('keys-empty-body', {
                defaultValue:
                  'Finish a test on this layout and every key you pressed gets a speed and an error rate — never the words you typed.',
              })}
            />
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile
                  label={t('stat-wpm', { defaultValue: 'Implied WPM' })}
                  value={Math.round(summary?.impliedWpm ?? 0)}
                />
                <StatTile
                  label={t('stat-accuracy', { defaultValue: 'Accuracy' })}
                  value={`${Math.round((summary?.accuracy ?? 0) * 100)}%`}
                />
                <StatTile
                  label={t('stat-per-key', { defaultValue: 'Per key' })}
                  value={`${Math.round(summary?.msPerKey ?? 0)} ms`}
                />
                <StatTile
                  label={t('stat-keys', { defaultValue: 'Keys tracked' })}
                  value={summary?.trackedKeys ?? 0}
                />
              </dl>

              <KeyHeatmap keys={stats?.keys ?? []} layout={layout} />

              {(stats?.worst.length ?? 0) > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-site-text-muted">
                    {t('worst-title', { defaultValue: 'Worst keys' })}
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {stats?.worst.map((metric) => (
                      <li
                        key={metric.key}
                        className="glass-fill flex items-center gap-2 rounded-site px-3 py-1.5"
                      >
                        <span className="font-mono text-sm text-site-text">{metric.key}</span>
                        <span className="font-mono text-xs tabular-nums text-site-text-muted">
                          {Math.round(metric.msPerKey)} ms · {Math.round(metric.errorRate * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={practiceWorstKeys} loading={generating}>
                  <Target className="size-4" aria-hidden />
                  {t('practice-action', { defaultValue: 'Practice your worst keys' })}
                </Button>
                <Button variant="ghost" onClick={clearStats}>
                  <Trash2 className="size-4" aria-hidden />
                  {t('clear-action', { defaultValue: 'Clear key stats' })}
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      <Card pane className="px-5 sm:px-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-medium text-site-text">
              {t('custom-title', { defaultValue: 'Custom test' })}
            </h2>
            <Badge variant="outline" size="sm">
              {t('not-ranked', { defaultValue: 'Not ranked' })}
            </Badge>
          </div>
          <p className="text-sm text-site-text-muted">
            {t('custom-note', {
              defaultValue:
                'You choose the text, so you choose the difficulty — custom and practice runs are kept off global leaderboards. Your per-key stats still count.',
            })}
          </p>

          <Textarea
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            rows={4}
            placeholder={t('custom-placeholder', { defaultValue: 'Paste any text to type…' })}
            aria-label={t('custom-label', { defaultValue: 'Custom test text' })}
          />

          <div className="flex flex-wrap items-center gap-4">
            <ToggleRow
              id="rmhtype-punctuation"
              checked={punctuation}
              onCheckedChange={setPunctuation}
              label={t('punctuation', { defaultValue: 'Punctuation' })}
            />
            <ToggleRow
              id="rmhtype-numbers"
              checked={numbers}
              onCheckedChange={setNumbers}
              label={t('numbers', { defaultValue: 'Numbers' })}
            />
            <Button onClick={startCustom} disabled={pasted.trim().length === 0}>
              {t('custom-start', { defaultValue: 'Type this' })}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass-fill rounded-site px-3 py-2">
      <dt className="text-xs text-site-text-muted">{label}</dt>
      <dd className="font-mono text-lg tabular-nums text-site-text">{value}</dd>
    </div>
  );
}

/**
 * A labelled switch. The row is 44px tall so the whole thing — label included —
 * is a comfortable target on a phone, even though `Switch`'s own track is the
 * site's compact one.
 */
function ToggleRow({
  id,
  checked,
  onCheckedChange,
  label,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex h-11 items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}
