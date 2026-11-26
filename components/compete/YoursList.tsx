/**
 * The rows of Compete > Tournaments > Yours: one tournament per row on a rule, with the member's place and prize.
 * Presentational (the section owns the query), so it renders to markup on its own.
 *
 * At 390 px each row is three lines (name, then game · format · status, then place and prize), so the figures wrap to
 * their own line and never sit against the title.
 */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { SwissLabel } from '@/components/competitive/SwissStandings';
import { ARRIVE } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import type { MyTournamentRow } from '@/lib/tournaments/mine.server';

type Translate = ReturnType<typeof useTranslation>['t'];

/** "1st of 16", "2nd of 16", "11th of 16": English ordinals through four literal keys. */
function placeLabel(t: Translate, lang: string, place: number, total: number): string {
  let category: string;
  try {
    category = new Intl.PluralRules(lang, { type: 'ordinal' }).select(place);
  } catch {
    category = 'other';
  }
  if (category === 'one') return t('yours-place-one', { defaultValue: '{{n}}st of {{total}}', n: place, total });
  if (category === 'two') return t('yours-place-two', { defaultValue: '{{n}}nd of {{total}}', n: place, total });
  if (category === 'few') return t('yours-place-few', { defaultValue: '{{n}}rd of {{total}}', n: place, total });
  return t('yours-place-other', { defaultValue: '{{n}}th of {{total}}', n: place, total });
}

export function YoursList({
  rows,
  className,
  isArriving,
}: {
  rows: readonly MyTournamentRow[];
  className?: string | undefined;
  /** A row that came with a later page fades in (M9). */
  isArriving?: ((id: string) => boolean) | undefined;
}) {
  const { t, i18n } = useTranslation('tournament-prizes');
  const lang = i18n?.language ?? 'en';
  return (
    <ul className={cn('flex flex-col', className)}>
      {rows.map((row) => (
        <li key={row.id} className={cn('rule-row', isArriving?.(row.id) && ARRIVE)}>
          <Link to="/tournaments/$id" params={{ id: row.id }} className="flex min-w-0 flex-col gap-1 py-3">
            <span className="t-body truncate font-medium" dir="auto">
              {row.name}
            </span>
            <span className="t-meta truncate">
              {row.gameTitle ?? row.gameId}
              {' · '}
              {row.format === 'SWISS' ? (
                <SwissLabel />
              ) : row.format === 'DOUBLE_ELIM' ? (
                t('double-elim-label', { ns: 'double-elimination', defaultValue: 'Double elim' })
              ) : row.format === 'ROUND_ROBIN' ? (
                t('round-robin', { ns: 'c-tournaments', defaultValue: 'Round robin' })
              ) : (
                t('single-elim-tournaments-index', { ns: 'c-tournaments', defaultValue: 'Single elim' })
              )}
              {' · '}
              {row.status === 'REGISTRATION'
                ? t('registering', { ns: 'c-tournaments', defaultValue: 'Registering' })
                : row.status === 'LIVE'
                  ? t('live', { ns: 'c-tournaments', defaultValue: 'Live' })
                  : row.status === 'CANCELLED'
                    ? t('status-cancelled', { ns: 'c-tournaments', defaultValue: 'Cancelled' })
                    : t('done-tournaments-id', { ns: 'c-tournaments', defaultValue: 'Finished' })}
            </span>
            <span className="t-meta flex flex-wrap gap-x-4 gap-y-1">
              {row.hosted ? <span>{t('yours-host', { defaultValue: 'Host' })}</span> : null}
              {row.entered && row.placement != null ? (
                <span>{placeLabel(t, lang, row.placement, row.playerCount)}</span>
              ) : null}
              {row.entered && row.placement == null ? (
                <span>{t('yours-entered', { defaultValue: 'Entered' })}</span>
              ) : null}
              {row.prizeCoins != null ? (
                <span>
                  {t('yours-won', {
                    count: row.prizeCoins,
                    n: row.prizeCoins,
                    defaultValue_one: 'Won {{n}} coin',
                    defaultValue: 'Won {{n}} coins',
                  })}
                </span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
