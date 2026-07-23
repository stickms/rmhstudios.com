/**
 * ReasoningStream — collapsible live view of DeepSeek's chain-of-thought.
 *
 * Shows the `reasoning_content` the Reasoner model streams while it computes. The
 * Chat model emits little/no reasoning, so this collapses to a compact "thinking"
 * indicator until (and unless) text arrives. Auto-scrolls to the newest text.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

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
  const bodyRef = useRef<HTMLDivElement>(null);

  // Keep the newest reasoning in view while streaming.
  useEffect(() => {
    if (open && active && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [text, open, active]);

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
        <div ref={bodyRef} className="rmhcalc-reasoning__body">
          {text ? (
            <p className="rmhcalc-reasoning__text">{text}</p>
          ) : (
            <p className="rmhcalc-reasoning__placeholder">
              {t('reasoning-waiting', { defaultValue: 'Waiting for the model…' })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
