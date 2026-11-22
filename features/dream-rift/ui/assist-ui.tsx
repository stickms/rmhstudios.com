import { useTranslation } from 'react-i18next';

/**
 * Dream Rift's assist lines (settings > Game assists): one line of text each,
 * announced politely, in the game's own look (L8).
 */

/** In a run: assisted solo runs say they are not ranked. */
export function AssistRunLine() {
  const { t } = useTranslation('more-game-assists');
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid="dream-rift-assist-line"
      className="pointer-events-none absolute inset-x-0 bottom-2 z-20 px-4 text-center text-[11px] text-[color:var(--dr-cream-dim)]"
    >
      {t('dream-rift-run-line', {
        defaultValue: 'Assists on: this run will not be ranked.',
      })}
    </p>
  );
}

/** In a co-op lobby or run: gameplay assists cannot apply to a shared sim. */
export function CoopAssistLine({ className }: { className?: string }) {
  const { t } = useTranslation('more-game-assists');
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid="dream-rift-coop-assist-line"
      className={className ?? 'text-xs text-[color:var(--dr-cream-dim)]'}
    >
      {t('coop-line', {
        defaultValue: 'In co-op only Calm visuals and Colour-safe apply.',
      })}
    </p>
  );
}

/** The way to the one settings page, from Dream Rift's own settings screen. */
export function AssistSettingsLink() {
  const { t } = useTranslation('more-game-assists');
  return (
    <a
      href="/settings/game-assists"
      className="text-xs text-[color:var(--dr-cream-dim)] underline hover:text-[color:var(--dr-cream)]"
    >
      {t('settings-link', { defaultValue: 'Game assists' })}
    </a>
  );
}
