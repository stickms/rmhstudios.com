/**
 * ReasoningStream — collapsible live view of DeepSeek's chain-of-thought.
 *
 * Shows the `reasoning_content` the Reasoner model streams while it computes. The
 * Chat model emits little/no reasoning, so this collapses to a compact "thinking"
 * indicator until (and unless) text arrives. Auto-scrolls to the newest text.
 */

import { useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useStickToBottom } from '@/hooks/useStickToBottom';

export function ReasoningStream({
  text,
  active,
  className,
}: {
  /** Accumulated reasoning text so far. */
  text: string;
  /** True while the model is still streaming. */
  active: boolean;
  className?: string;
}) {
  const { t } = useTranslation('c-rmhcalculator');
  const [open, setOpen] = useState(true);
  // `useStickToBottom`, not `scrollTop = scrollHeight` in an effect. Reading
  // `scrollHeight` FORCES a synchronous layout on every new entry, and the old
  // form re-pinned unconditionally — so a reader scrolled up to check an earlier
  // line was yanked back down by the next one. See
  // docs/performance-audit-2026-08-12.md §1.5.
  const { containerRef, contentRef } = useStickToBottom<HTMLDivElement, HTMLDivElement>();

  if (!text && !active) return null;

  return (
    <div className={cn('rmhcalc-reasoning', className)}>
      <button
        type="button"
        className="rmhcalc-reasoning__header"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Sparkles
          size={14}
          aria-hidden="true"
          className={cn('rmhcalc-reasoning__spark', active && 'is-active')}
        />
        <span className="rmhcalc-reasoning__title">
          {active
            ? t('reasoning-active', { defaultValue: 'Reasoning…' })
            : t('reasoning-done', { defaultValue: 'Reasoning' })}
        </span>
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={cn('rmhcalc-reasoning__chevron', open && 'is-open')}
        />
      </button>
      {open && (
        <div ref={containerRef} className="rmhcalc-reasoning__body">
          <div ref={contentRef}>
          {text ? (
            <p className="rmhcalc-reasoning__text">{text}</p>
          ) : (
            <p className="rmhcalc-reasoning__placeholder">
              {t('reasoning-waiting', { defaultValue: 'Waiting for the model…' })}
            </p>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
