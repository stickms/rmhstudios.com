'use client';

/**
 * C2 — which chart of this song you are about to play.
 *
 * A song used to have exactly one interpretation forever. It can now carry
 * several `Chart` rows plus the generated fallback, and until this existed
 * nothing listed them — so an alternate chart could be authored and never
 * reached by anyone.
 *
 * Renders nothing at all when there is one chart, which is every song today.
 * A picker with one option is chrome that teaches the player a concept they do
 * not need, and hiding it costs one length check.
 *
 * Inside the game, so this is on the `--slice-*` neumorphic contract, not the
 * site's glass tokens.
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Star, User } from 'lucide-react';

export interface ChartOption {
  id: string | null;
  difficulty: string;
  name: string;
  rating: number | null;
  status: string;
  rankStatus: string;
  isGenerated: boolean;
  author: { id: string; name: string | null; username: string | null } | null;
}

export function ChartPicker({
  charts,
  selectedId,
  onSelect,
}: {
  charts: ChartOption[];
  /** `null` selects the generated fallback, which is also its id. */
  selectedId: string | null;
  onSelect: (chartId: string | null) => void;
}) {
  const { t } = useTranslation('r-slice-it');
  if (charts.length <= 1) return null;

  return (
    <div className="p-4 border-b border-slice-shadow-dark/30">
      <h3 className="text-sm font-bold text-slice-text uppercase mb-3">
        {t('chart-picker', { defaultValue: 'Chart' })}
      </h3>
      <div
        role="radiogroup"
        aria-label={t('chart-picker', { defaultValue: 'Chart' })}
        className="space-y-1.5"
      >
        {charts.map((chart) => {
          const active = chart.id === selectedId;
          return (
            <button
              key={chart.id ?? 'generated'}
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(chart.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors border ${
                active
                  ? 'bg-slice-accent/15 border-slice-accent text-slice-text'
                  : 'bg-slice-shadow-dark/20 border-slice-shadow-dark/30 text-slice-text-light hover:bg-slice-shadow-dark/40'
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold uppercase tracking-wide">
                  {chart.name}
                </span>
                <span className="block truncate text-[10px] text-slice-text-muted">
                  {chart.difficulty}
                  {chart.isGenerated && chart.id === null
                    ? ` · ${t('chart-auto', { defaultValue: 'Auto' })}`
                    : ''}
                  {chart.author ? ` · ${chart.author.name ?? chart.author.username ?? ''}` : ''}
                  {chart.status === 'draft'
                    ? ` · ${t('chart-draft', { defaultValue: 'Draft' })}`
                    : ''}
                </span>
              </span>
              {chart.rankStatus === 'ranked' && (
                <Star
                  className="w-3.5 h-3.5 shrink-0 fill-current"
                  aria-label={t('chart-ranked', { defaultValue: 'Ranked' })}
                />
              )}
              {chart.rating !== null && (
                <span className="shrink-0 text-[10px] tabular-nums text-slice-text-muted">
                  {chart.rating.toFixed(1)}
                </span>
              )}
              {chart.author === null && chart.id !== null && (
                <User className="w-3.5 h-3.5 shrink-0 opacity-40" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
