'use client';

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const EmojiPickerPanel = lazy(() => import('./EmojiPickerPanel'));

interface EmojiPickerButtonProps {
  onSelect: (emoji: string) => void;
  /** Which way the popover opens relative to the button. Default 'up' (compose bars sit at the bottom). */
  direction?: 'up' | 'down';
  className?: string;
  /**
   * Replaces the default `text-site-text-dim hover:text-site-accent` color classes on the
   * trigger button. Use this for panels themed with static Tailwind arbitrary-value classes
   * (e.g. `text-(--rmhtube-text-dim) hover:text-(--rmhtube-accent)`).
   */
  buttonClassName?: string;
  /**
   * Inline style applied to the trigger button. Use this for panels whose theme is a dynamic
   * prefix (e.g. `themePrefix` in shared/ChatPanel.tsx), since Tailwind can't compile class
   * names built from interpolated strings.
   */
  buttonStyle?: React.CSSProperties;
}

export function EmojiPickerButton({
  onSelect,
  direction = 'up',
  className = '',
  buttonClassName,
  buttonStyle,
}: EmojiPickerButtonProps) {
  const { t } = useTranslation('feed');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('emoji-picker-open', { defaultValue: 'Add emoji' })}
        aria-expanded={open}
        className={`p-1.5 transition-colors ${buttonClassName ?? 'text-site-text-dim hover:text-site-accent'}`}
        style={buttonStyle}
      >
        <Smile className="w-5 h-5" />
      </button>
      {open && (
        <div
          className={`absolute right-0 z-50 ${
            direction === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          <Suspense
            fallback={
              <div className="w-[300px] h-[360px] rounded-site border border-site-border bg-site-bg animate-pulse" />
            }
          >
            <EmojiPickerPanel onSelect={onSelect} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
