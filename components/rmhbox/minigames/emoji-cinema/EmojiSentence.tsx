'use client';

interface EmojiSentenceProps {
  emojis: string[];
  maxEmojis: number;
  onRemove?: (index: number) => void;
  readOnly?: boolean;
}

export default function EmojiSentence({ emojis, maxEmojis, onRemove, readOnly = false }: EmojiSentenceProps) {
  // Defensive: ensure emojis is always an array
  const safeEmojis = Array.isArray(emojis) ? emojis : [];

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="flex items-center gap-1 min-h-14 p-3 rounded-xl bg-(--rmhbox-surface) border border-(--rmhbox-border) w-full overflow-x-auto">
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
              className={`text-3xl p-1 rounded transition-transform ${
                readOnly ? 'cursor-default' : 'hover:scale-110 hover:bg-(--rmhbox-border) cursor-pointer'
              }`}
              title={readOnly ? undefined : 'Click to remove'}
            >
              {emoji}
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
