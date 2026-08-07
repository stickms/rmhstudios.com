'use client';

/**
 * The shell every Slice It AI panel renders inside.
 *
 * It exists to make the *non-ready* states impossible to forget. A panel author
 * writing their own container writes the happy path, ships, and the first
 * player on a deployment without a key sees a heading with nothing under it.
 * Here the four unhappy states are the shell's job and the caller only supplies
 * the content for `ready`.
 *
 * Neumorphic rather than the site's glass tier on purpose: Slice It is a
 * full-screen game with its own `--slice-*` palette and is exempt from the
 * `--site-*` contract (`lib/__tests__/design-consistency.test.ts` lists both
 * `slice-it` and `game` in `FULLSCREEN_TIER_DIRS`). A `.glass-pane` dropped in
 * here would be the one surface in the game that looked like the rest of the
 * site, which is the opposite of consistent.
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { AiState } from './useSliceAi';

export interface AiPanelProps {
  title: string;
  state: AiState;
  /** Rendered only in `ready`. */
  children?: React.ReactNode;
  /** Shown in `idle` on the button that fires the call. */
  actionLabel: string;
  onRun: () => void;
  /**
   * A computed, model-free line shown under the heading in every state.
   *
   * This is what stops the panel ever being empty: the chart readout, the
   * pooled timing numbers, the raw score gap. It is the feature's floor.
   */
  fallback?: React.ReactNode;
  className?: string;
}

export function AiPanel({
  title,
  state,
  children,
  actionLabel,
  onRun,
  fallback,
  className,
}: AiPanelProps) {
  const { t } = useTranslation('c-game');

  return (
    <section
      className={cn(
        'bg-slice-bg rounded-2xl p-4 text-left',
        'shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)]',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 mb-3">
        <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slice-text-light">
          <Sparkles className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" />
          {title}
        </h3>
        {(state === 'idle' || state === 'ready' || state === 'error') && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRun}
            className="h-7 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-600 hover:bg-slice-shadow-dark/20 transition-colors border-none shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] active:shadow-[inset_2px_2px_4px_var(--slice-shadow-dark),inset_-2px_-2px_4px_var(--slice-shadow-light)]"
          >
            {state === 'ready' || state === 'error' ? (
              <RefreshCw className="w-3 h-3 mr-1" aria-hidden="true" />
            ) : null}
            {state === 'ready' || state === 'error'
              ? t('ai-again', { defaultValue: 'Again' })
              : actionLabel}
          </Button>
        )}
      </header>

      {fallback ? (
        <p className="text-xs font-medium text-slice-text-muted leading-relaxed mb-3">{fallback}</p>
      ) : null}

      {state === 'loading' && (
        <p
          className="text-xs font-bold uppercase tracking-widest text-slice-text-light"
          // A results card is a busy moment; a live region announces the panel
          // filling in without stealing focus from the buttons.
          aria-live="polite"
        >
          {t('ai-thinking', { defaultValue: 'Reading your run…' })}
        </p>
      )}

      {state === 'unavailable' && (
        <p className="text-xs font-medium text-slice-text-light leading-relaxed">
          {t('ai-unavailable', {
            defaultValue: 'Coaching is offline right now. The numbers above still hold.',
          })}
        </p>
      )}

      {state === 'budget' && (
        <p className="text-xs font-medium text-slice-text-light leading-relaxed">
          {t('ai-budget', {
            defaultValue: "You've used this month's AI allowance. It resets on the 1st.",
          })}
        </p>
      )}

      {state === 'error' && (
        <p className="text-xs font-medium text-slice-text-light leading-relaxed">
          {t('ai-error', { defaultValue: 'That did not come back. Try again in a moment.' })}
        </p>
      )}

      {state === 'ready' ? children : null}
    </section>
  );
}

/** A labelled line of model output. The shared row shape across the panels. */
export function AiLine({ text, evidence }: { text: string; evidence?: string }) {
  return (
    <li className="text-xs leading-relaxed">
      <span className="font-semibold text-slice-text">{text}</span>
      {evidence ? (
        <span className="block mt-0.5 font-mono text-[10px] text-slice-text-light">{evidence}</span>
      ) : null}
    </li>
  );
}
