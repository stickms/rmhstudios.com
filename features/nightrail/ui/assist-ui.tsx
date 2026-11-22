import { useTranslation } from 'react-i18next';

/**
 * Nightrail's assist lines (settings > Game assists). Each is one line of text,
 * announced politely, in the game's own look (L8).
 */

/** While an assisted run is in progress: what it means for the board, and the way to the settings. */
export function AssistRunLine() {
  const { t } = useTranslation('more-game-assists');
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid="nightrail-assist-line"
      className="pointer-events-none absolute inset-x-0 z-30 px-4 text-center font-mono text-[11px] text-slate-300"
      style={{ bottom: 'calc(var(--safe-bottom) + 0.75rem)' }}
    >
      {t('nightrail-run-line', {
        defaultValue: 'Assists on: this run will not be ranked.',
      })}
    </p>
  );
}

/** A quiet link to the one settings page, always present on the start screen. */
export function AssistSettingsLink({ className }: { className?: string }) {
  const { t } = useTranslation('more-game-assists');
  return (
    <a href="/settings/game-assists" className={className ?? 'text-xs text-slate-400 underline hover:text-white'}>
      {t('settings-link', { defaultValue: 'Game assists' })}
    </a>
  );
}
