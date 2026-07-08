'use client';

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
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

  useEffect(() => {
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
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
        <Suspense
          fallback={
            <div className="w-[300px] h-[360px] rounded-site border border-site-border bg-site-bg animate-pulse" />
          }
        >
          <EmojiPickerPanel
            onSelect={(emoji) => {
              onSelect(emoji);
              onClose();
            }}
          />
        </Suspense>
      ) : (
        <div className="flex items-center gap-1 rounded-full border border-site-border bg-site-bg px-2 py-1.5 shadow-xl">
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
