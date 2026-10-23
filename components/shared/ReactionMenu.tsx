'use client';

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CHAT_REACTION_EMOJIS } from '@/lib/shared/chat-constants';

const EmojiPickerPanel = lazy(() => import('./EmojiPickerPanel'));

interface ReactionMenuProps {
  x: number;
  y: number;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function ReactionMenu({ x, y, onSelect, onClose }: ReactionMenuProps) {
  const { t } = useTranslation('feed');
  const [showFull, setShowFull] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    // Passive (OPT-39): this is a dismiss-on-outside-tap probe — it reads
    // `e.target` and closes, and must never cancel the scroll the tap started.
    // Declared rather than assumed, so the browser can begin scrolling without
    // waiting to see whether this handler calls `preventDefault()`.
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const width = showFull ? 300 : 280;
  const height = showFull ? 380 : 52;
  const style = {
    top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
  };

  return createPortal(
    <div ref={rootRef} className="fixed z-[100]" style={style}>
      {showFull ? (
        // Exempt the emoji-picker widget from the app-wide twemoji observer: it
        // renders its own emoji and re-renders internally, so letting twemoji
        // rewrite its nodes crashes React with a removeChild error.
        // The picker floats in a bare fixed div, so it carries the L4 surface itself.
        <div data-no-twemoji className="glass-overlay overflow-hidden p-0">
          <Suspense
            fallback={
              <Skeleton className="h-[360px] w-[300px] rounded-site" />
            }
          >
            <EmojiPickerPanel
              onSelect={(emoji) => {
                onSelect(emoji);
                onClose();
              }}
            />
          </Suspense>
        </div>
      ) : (
        <div
          ref={barRef}
          // The shared bloom (globals.css §7.1). No `data-state`: this menu is
          // mounted already-open at the tap point and the caller unmounts it to
          // dismiss, so there is only ever an enter to play — and it plays from
          // the centre, which is where the finger is.
          data-motion="pop"
          className="flex items-center gap-1 rounded-full px-2 py-1.5 glass-overlay"
        >
          {CHAT_REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="text-lg leading-none hover:scale-125 transition-transform"
              onClick={() => {
                onSelect(emoji);
                onClose();
              }}
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            aria-label={t('reaction-more', { defaultValue: 'More emoji' })}
            className="ml-1 flex h-6 w-6 items-center justify-center rounded-full bg-site-surface text-site-text-dim hover:text-site-text transition-colors"
            onClick={() => setShowFull(true)}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
