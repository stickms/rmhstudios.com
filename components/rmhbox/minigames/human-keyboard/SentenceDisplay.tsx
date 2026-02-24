/**
 * SentenceDisplay — Character-by-character sentence highlighting.
 *
 * Renders the target sentence with typed characters greyed out,
 * the current cursor position highlighted, and remaining characters
 * in the default text colour. Shows the expected next letter below.
 */
'use client';

interface SentenceDisplayProps {
  /** The full sentence to type */
  sentence: string;
  /** Current cursor position (0-indexed) */
  displayCursorPosition: number;
}

export default function SentenceDisplay({ sentence, displayCursorPosition }: SentenceDisplayProps) {
  const nextLetter = displayCursorPosition < sentence.length
    ? sentence[displayCursorPosition]
    : null;

  return (
    <div className="w-full">
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface-hover) p-4 font-mono text-lg leading-relaxed break-words select-none">
        {sentence.split('').map((char, i) => {
          let className: string;
          if (i < displayCursorPosition) {
            // Already typed
            className = 'text-(--rmhbox-text-muted) opacity-50';
          } else if (i === displayCursorPosition) {
            // Current cursor
            className = 'bg-(--rmhbox-accent) text-(--rmhbox-bg) rounded-sm px-0.5 font-bold';
          } else {
            // Remaining
            className = 'text-(--rmhbox-text)';
          }
          return (
            <span key={i} className={className}>
              {char}
            </span>
          );
        })}
      </div>

      {nextLetter != null && (
        <p className="mt-2 text-center text-sm text-(--rmhbox-text-muted)">
          Next letter:{' '}
          <span className="font-bold text-(--rmhbox-accent)">
            {nextLetter === ' ' ? '⎵ (space)' : nextLetter.toUpperCase()}
          </span>
        </p>
      )}
    </div>
  );
}
