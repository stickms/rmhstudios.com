'use client';

interface EmojiSentenceProps {
  emojis: string[];
  maxEmojis: number;
  onRemove?: (index: number) => void;
  readOnly?: boolean;
}

/**
 * EmojiSentence — Displays the emoji sequence in a wrapping grid.
 * Up to 6 emojis per line, max 2 lines (12 total).
 * Uses Twemoji images for cross-platform consistency.
 */
export default function EmojiSentence({ emojis, maxEmojis, onRemove, readOnly = false }: EmojiSentenceProps) {
  // Defensive: ensure emojis is always an array
  const safeEmojis = Array.isArray(emojis) ? emojis : [];

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="flex flex-wrap items-center gap-1 min-h-[3.5rem] p-3 rounded-xl bg-(--rmhbox-surface) border border-(--rmhbox-border) w-full"
        style={{ maxWidth: '24rem' }}
      >
        {safeEmojis.length === 0 ? (
          <span className="text-(--rmhbox-text-muted) text-sm italic mx-auto">
            {readOnly ? 'Waiting for emojis…' : 'Tap emojis below to build your clue'}
          </span>
        ) : (
          safeEmojis.map((emoji, i) => (
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
              <img
                src={`https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${emojiToTwemojiCode(emoji)}.png`}
                alt={emoji}
                className="w-8 h-8"
                draggable={false}
                onError={(e) => {
                  // Fallback to native emoji if Twemoji image fails
                  const target = e.currentTarget;
                  target.style.display = 'none';
                  if (target.parentElement) {
                    const span = document.createElement('span');
                    span.textContent = emoji;
                    span.className = 'text-3xl';
                    target.parentElement.appendChild(span);
                  }
                }}
              />
            </button>
          ))
        )}
      </div>
      <span className="text-xs text-(--rmhbox-text-muted)">
        {safeEmojis.length}/{maxEmojis} emojis
      </span>
    </div>
  );
}

/**
 * Convert a native emoji string to Twemoji hex code for CDN URL.
 * E.g. "😀" → "1f600", "👨‍👩‍👧" → "1f468-200d-1f469-200d-1f467"
 */
function emojiToTwemojiCode(emoji: string): string {
  const codePoints: string[] = [];
  for (const codePoint of emoji) {
    const hex = codePoint.codePointAt(0)?.toString(16);
    if (hex) codePoints.push(hex);
  }
  // Filter out variation selectors (fe0f) for simpler matching
  return codePoints.filter((cp) => cp !== 'fe0f').join('-');
}
