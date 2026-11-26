/**
 * RivalsList — the rows of the "Rivals" view (sprint 15 15): one named player per row, the member's record against
 * them ("8 matches · 5 wins · 3 losses") and the date of the latest match. Pure of data fetching, so it renders to
 * markup in a test. A row opens the matches the pair shared; it carries the rival's `key`, never an account id.
 */
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { cn } from '@/lib/utils';
import type { RivalView } from '@features/synapse-storm/engine/rivals';

interface RivalsListProps {
  rivals: RivalView[];
  onOpen: (rival: RivalView) => void;
}

export function RivalsList({ rivals, onOpen }: RivalsListProps) {
  const { t } = useTranslation('synapse-rivals');
  if (rivals.length === 0) {
    return (
      <p className="ssm-matches__note">
        {t('empty', { defaultValue: 'No rivals yet. Finish a versus match with another player to start a record.' })}
      </p>
    );
  }
  return (
    <ul className="ssm-matches__list">
      {rivals.map((rival) => (
        <RivalRow key={rival.key} rival={rival} onOpen={onOpen} />
      ))}
    </ul>
  );
}

function RivalRow({ rival, onOpen }: { rival: RivalView; onOpen: (rival: RivalView) => void }) {
  const { t } = useTranslation('synapse-rivals');
  const fmt = useLocaleFormat();
  return (
    <li className="ssm-matches__row">
      <button type="button" className="ssm-rival" onClick={() => onOpen(rival)}>
        <span className="ssm-rival__name">
          <bdi dir="auto">{rival.name}</bdi>
        </span>
        <span className="ssm-rival__record">
          {t('record-matches', {
            defaultValue: '{{count}} match',
            defaultValue_other: '{{count}} matches',
            count: rival.matches,
          })}
          {' · '}
          {t('record-wins', { defaultValue: '{{count}} win', defaultValue_other: '{{count}} wins', count: rival.wins })}
          {' · '}
          {t('record-losses', {
            defaultValue: '{{count}} loss',
            defaultValue_other: '{{count}} losses',
            count: rival.losses,
          })}
          {rival.ties > 0 && (
            <>
              {' · '}
              {t('record-ties', {
                defaultValue: '{{count}} tie',
                defaultValue_other: '{{count}} ties',
                count: rival.ties,
              })}
            </>
          )}
        </span>
        <span className="ssm-rival__last">
          {t('last-match', {
            defaultValue: 'Last match {{date}}',
            date: fmt.dateTime(rival.lastAt, { dateStyle: 'medium' }),
          })}
        </span>
      </button>
    </li>
  );
}

/** The "Matches" / "Rivals" switch: two pressed-state buttons in the game's own look (not a tab strip). */
export function RivalsSwitch({
  showingRivals,
  onShowMatches,
  onShowRivals,
}: {
  showingRivals: boolean;
  onShowMatches: () => void;
  onShowRivals: () => void;
}) {
  const { t } = useTranslation('synapse-rivals');
  return (
    <div className="ssm-matches__switch" role="group" aria-label={t('switch', { defaultValue: 'View' })}>
      <button
        type="button"
        className={cn('ssm-btn', showingRivals ? 'ssm-btn--ghost' : 'ssm-btn--secondary')}
        aria-pressed={!showingRivals}
        onClick={onShowMatches}
      >
        {t('matches-tab', { defaultValue: 'Matches' })}
      </button>
      <button
        type="button"
        className={cn('ssm-btn', showingRivals ? 'ssm-btn--secondary' : 'ssm-btn--ghost')}
        aria-pressed={showingRivals}
        onClick={onShowRivals}
      >
        {t('rivals-tab', { defaultValue: 'Rivals' })}
      </button>
    </div>
  );
}

/**
 * The line above a rival's shared matches: whose they are, and the way back to the rivals. The name is interpolated
 * (one key, so a locale can put it where its grammar wants) and wrapped in Unicode isolates for its own direction.
 */
export function RivalWith({ name, onAllRivals }: { name: string; onAllRivals: () => void }) {
  const { t } = useTranslation('synapse-rivals');
  return (
    <div className="ssm-matches__with">
      <span className="ssm-matches__with-name">
        {t('with-heading', { defaultValue: 'Matches with {{name}}', name: `\u2068${name}\u2069` })}
      </span>
      <button type="button" className="ssm-btn ssm-btn--ghost" onClick={onAllRivals}>
        {t('all-rivals', { defaultValue: 'All rivals' })}
      </button>
    </div>
  );
}

/** The rivals view's loading line. */
export function RivalsLoading() {
  const { t } = useTranslation('synapse-rivals');
  return (
    <p className="ssm-matches__note" role="status">
      {t('loading', { defaultValue: 'Loading your rivals' })}
    </p>
  );
}

/** The rivals view's signed-out line. */
export function RivalsSignedOut({ className }: { className?: string }) {
  const { t } = useTranslation('synapse-rivals');
  return (
    <p className={cn('ssm-matches__note', className)}>
      {t('signed-out', { defaultValue: 'Sign in to see your rivals' })}
    </p>
  );
}
