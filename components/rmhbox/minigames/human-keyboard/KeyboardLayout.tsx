/**
 * KeyboardLayout — Full 26-letter visual keyboard.
 *
 * Shows a QWERTY-style layout where owned keys are highlighted,
 * unowned keys are dimmed, and the active key (matching the next
 * expected letter) has a prominent highlight. Touch-friendly with
 * a minimum 36 px hit target per key.
 */
'use client';

const ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

interface KeyboardLayoutProps {
  /** Letters assigned to this player (uppercase) */
  myKeys: string[];
  /** The next expected letter in the sentence (uppercase), or null */
  nextExpectedLetter: string | null;
  /** Callback when the player taps a key */
  onKeyPress: (key: string) => void;
}

export default function KeyboardLayout({ myKeys, nextExpectedLetter, onKeyPress }: KeyboardLayoutProps) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {ROWS.map((row, ri) => (
        <div key={ri} className="flex justify-center gap-1">
          {row.map((letter) => {
            const owned = myKeys.includes(letter);
            const isActive = owned && nextExpectedLetter === letter;

            let className =
              'flex items-center justify-center rounded-md text-xs font-bold transition-all min-w-[36px] min-h-[36px] w-9 h-9 ';

            if (isActive) {
              className +=
                'border-2 border-(--rmhbox-accent) bg-(--rmhbox-accent) text-(--rmhbox-bg) scale-110 shadow-lg';
            } else if (owned) {
              className +=
                'border border-(--rmhbox-accent)/50 bg-(--rmhbox-accent)/15 text-(--rmhbox-accent)';
            } else {
              className +=
                'border border-(--rmhbox-border) bg-(--rmhbox-surface-hover) text-(--rmhbox-text-muted) opacity-40';
            }

            return (
              <button
                key={letter}
                type="button"
                disabled={!owned}
                onClick={() => onKeyPress(letter)}
                className={className}
              >
                {letter}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
