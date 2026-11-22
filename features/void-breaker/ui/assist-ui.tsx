import { useTranslation } from 'react-i18next';

/**
 * Assist (no timed input): the countdown, the breather between waves and
 * narrative lines wait for the player. A button for touch, Enter for a keyboard.
 */
export function AssistContinueHint({
  onContinue,
}: {
  onContinue: () => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'game-assists',
    );
  return (
    <div className="absolute inset-x-0 top-[calc(4.5rem+var(--safe-top))] z-30 flex justify-center px-4 pointer-events-none">
      <button
        type="button"
        onClick={
          onContinue
        }
        className="pointer-events-auto rounded-lg border border-[#00f5ff]/40 bg-black/80 px-4 py-2 font-mono text-xs text-[#00f5ff]"
      >
        {t(
          'continue-hint',
          {
            defaultValue:
              'Continue (Enter)',
          },
        )}
      </button>
    </div>
  );
}
