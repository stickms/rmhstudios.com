import { useTranslation } from 'react-i18next';

export interface GameLoadingFallbackProps {
  /**
   * Page background to hold while the app's own chunk loads. Defaults to the
   * dark ground most games paint; pass the app's actual background for the ones
   * that don't (RMHCalculator's white UI, Daily Puzzles' paper ground).
   */
  background?: string;
  /** Ink for the spinner + label. Defaults to white, to match `background`. */
  foreground?: string;
}

/**
 * Loading takeover for lazily-loaded games and full-screen apps.
 *
 * This used to be an unconditional `bg-black h-screen` sheet regardless of what
 * was loading behind it, so the light-grounded apps opened with a hard flash of
 * black before their own UI appeared. The colours are parameters now and each
 * such route passes its own — the fallback should read as the app arriving, not
 * as a different app.
 */
export function GameLoadingFallback({
  background = '#000000',
  foreground = '#ffffff',
}: GameLoadingFallbackProps = {}) {
  const { t } = useTranslation('shared');
  return (
    <div
      className="flex h-screen w-full items-center justify-center"
      style={{ backgroundColor: background, color: foreground }}
      role="status"
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2"
          style={{
            borderColor: 'color-mix(in srgb, currentColor 20%, transparent)',
            borderTopColor: 'currentColor',
          }}
        />
        <p
          className="text-sm"
          style={{ color: 'color-mix(in srgb, currentColor 70%, transparent)' }}
        >
          {t('loading', { defaultValue: 'Loading…' })}
        </p>
      </div>
    </div>
  );
}
