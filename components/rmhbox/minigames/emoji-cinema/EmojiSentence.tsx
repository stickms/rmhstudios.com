/**
 * EmojiSentence — Displays the emoji sequence in a constant-width wrapping grid.
 * Up to 6 emojis per line, max 2 lines (12 total).
 * Uses twemoji-parser for reliable emoji → Twemoji URL conversion.
 */
'use client';

import { useState, useCallback } from 'react';
import { getEmojiUrl } from '@/lib/rmhbox/emoji-cinema/twemoji-url';

interface EmojiSentenceProps {
  emojis: string[];
  maxEmojis: number;
  onRemove?: (index: number) => void;
  readOnly?: boolean;
}

export default function EmojiSentence({ emojis, maxEmojis, onRemove, readOnly = false }: EmojiSentenceProps) {
  // Defensive: ensure emojis is always an array
  const safeEmojis = Array.isArray(emojis) ? emojis : [];
  // Track which emojis failed to load Twemoji images
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());

  const handleImageError = useCallback((index: number) => {
    setFailedImages((prev) => new Set(prev).add(index));
  }, []);

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {/* Constant-width container: 6 × 3rem cells + 5 × 0.25rem gaps + 2 × 0.75rem padding = ~21.25rem */}
      <div className="flex flex-wrap items-center gap-1 min-h-14 p-3 rounded-xl bg-(--rmhbox-surface) border border-(--rmhbox-border) w-86">
        {safeEmojis.length === 0 ? (
          <span className="text-(--rmhbox-text-muted) text-sm italic mx-auto">
            {readOnly ? 'Waiting for emojis…' : 'Tap emojis below to build your clue'}
          </span>
        ) : (
          safeEmojis.map((emoji, i) => {
            const twemojiUrl = getEmojiUrl(emoji);
            return (
              <button
                key={i}
                disabled={readOnly}
                onClick={() => !readOnly && onRemove?.(i)}
                className={`p-1 rounded transition-transform ${
                  readOnly ? 'cursor-default' : 'hover:scale-110 hover:bg-(--rmhbox-border) cursor-pointer'
                }`}
                style={{ width: '3rem', height: '3rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title={readOnly ? undefined : 'Click to remove'}
              >
                {!twemojiUrl || failedImages.has(i) ? (
                  <span className="text-3xl">{emoji}</span>
                ) : (
                  <img
                    src={twemojiUrl}
                    alt={emoji}
                    className="w-8 h-8"
                    draggable={false}
                    onError={() => handleImageError(i)}
                  />
                )}
              </button>
            );
          })
        )}
      </div>
      <span className="text-xs text-(--rmhbox-text-muted)">
        {safeEmojis.length}/{maxEmojis} emojis
      </span>
    </div>
  );
}
