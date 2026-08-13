'use client';

import { lazy, Suspense, useRef, useState } from 'react';
import { Smile } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';

const EmojiPickerPanel = lazy(() => import('./EmojiPickerPanel'));

interface EmojiPickerButtonProps {
  onSelect: (emoji: string) => void;
  /** Which way the popover opens relative to the button. Default 'up' (compose bars sit at the bottom). */
  direction?: 'up' | 'down';
  className?: string;
  /**
   * Replaces the default `text-site-text-dim hover:text-site-accent` color classes on the
   * trigger button. Use this for panels themed with static Tailwind arbitrary-value classes
   * (e.g. `text-(--app-text-dim) hover:text-(--app-accent)`).
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Outside-press dismissal, Escape, the close animation and the presence hold
  // all live in AnchoredMenu now — this file used to carry its own copy of the
  // first two, and the outside test was against a `rootRef` the panel no longer
  // renders inside.

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('emoji-picker-open', { defaultValue: 'Add emoji' })}
        aria-expanded={open}
        className={`p-1.5 transition-colors ${buttonClassName ?? 'text-site-text-dim hover:text-site-accent'}`}
        style={buttonStyle}
      >
        <Smile className="w-5 h-5" />
      </button>
      {/* PORTALLED, because the 300x360 panel is bigger than the boxes it opens
          inside. Every host — EditPostModal, ProfileEditModal, ComposeModal — is
          a `.glass-overlay`, which declares `overflow-y: auto`; `overflow-y:
          auto` with a visible `overflow-x` computes overflow-x to `auto` too, so
          BOTH axes clip. The worst case is EditPostModal, where the trigger is
          pinned to the LEFT of the footer (`mr-auto`) while this panel is
          right-anchored: most of the emoji grid was cut off at the dialog border
          with no way to scroll to it.

          z-60 at body level, not the old local z-50, because it has to clear the
          z-50 dialog it was opened from — the same band `Select` uses for
          exactly that reason. `focusOnOpen={false}`: the panel has its own
          search field and grid, and pulling focus to the first cell would skip
          it. AnchoredMenu also supplies the collision flip that `direction` was
          approximating by hand, so the caller's preference is now a hint that
          gets overridden when the chosen side has no room. */}
      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        side={direction === 'up' ? 'top' : 'bottom'}
        align="end"
        focusOnOpen={false}
        label={t('emoji-picker-open', { defaultValue: 'Add emoji' })}
        // The picker renders its own emoji and re-renders as you scroll/pick;
        // exclude it from the app-wide twemoji observer so it never rewrites a
        // node the picker owns (which crashes React) and never walks its huge
        // subtree on every scroll mutation.
        className="z-[60] p-0"
      >
        <div data-no-twemoji>
          <Suspense
            fallback={
              <div className="w-[300px] h-[360px] rounded-site border border-site-border bg-site-bg animate-pulse" />
            }
          >
            <EmojiPickerPanel onSelect={onSelect} />
          </Suspense>
        </div>
      </AnchoredMenu>
    </div>
  );
}
