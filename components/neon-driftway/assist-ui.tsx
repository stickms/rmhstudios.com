import { useTranslation } from 'react-i18next';
import { AssistStartNotice as StartNotice } from '@/components/games/assist-run';
import type { NdwAssistFlags } from '@/lib/neon-driftway/assist-profile';

/**
 * Neon Driftway's assist lines (settings > Game assists). Each is one line of text, announced
 * politely, in the game's own look (L8). No motion, no frame loop.
 */

/** While an assisted run is in progress: what it means for the board. */
export function AssistRunLine({ flags, online }: { flags: NdwAssistFlags; online?: boolean }) {
  const { t } = useTranslation('driftway-laundry-assists');
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid="neon-driftway-assist-line"
      className="pointer-events-none absolute inset-x-0 bottom-3 z-30 px-4 text-center font-mono text-[11px] text-zinc-300"
    >
      {online
        ? t('driftway-online-line', { defaultValue: 'Assists on for what you see. Races are not ranked either way.' })
        : flags.speedScale < 1
          ? t('driftway-run-line-slow', {
              defaultValue: 'Assisted, not ranked. Speed floor {{percent}}%.',
              percent: Math.round(flags.speedScale * 100),
            })
          : t('driftway-run-line', { defaultValue: 'Assisted, not ranked.' })}
    </p>
  );
}

/** The start screen: the shared notice when assists are on, and a link to the one settings page. */
export function AssistMenuLines({ signedIn }: { signedIn: boolean }) {
  const { t } = useTranslation('driftway-laundry-assists');
  if (!signedIn) return null;
  return (
    <div className="space-y-1 text-xs text-zinc-300">
      <StartNotice signedIn={signedIn} className="text-center text-xs text-zinc-300" />
      <p>
        <a href="/settings/game-assists" className="underline hover:text-white">
          {t('settings-link', { defaultValue: 'Game assists' })}
        </a>
      </p>
    </div>
  );
}

/** The results, when the server says the run was not ranked. */
export function AssistedNotRanked({ ranked }: { ranked: boolean | null }) {
  const { t } = useTranslation('driftway-laundry-assists');
  if (ranked !== false) return null;
  return (
    <p role="status" data-testid="assist-not-ranked" className="text-center text-xs text-amber-300">
      {t('assisted-not-ranked', { defaultValue: 'Assisted, not ranked' })}
    </p>
  );
}
