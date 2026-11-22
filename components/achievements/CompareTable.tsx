import { Coins, Gamepad2, Hammer, Lock, Sparkles, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { TrackToggle } from '@/components/achievements/TrackToggle';
import type { AchievementCategory } from '@/lib/achievements/catalog';
import type { CompareRow, SideState } from '@/lib/achievements/compare';

const CATEGORY_ICON: Record<AchievementCategory, typeof Users> = {
  social: Users,
  games: Gamepad2,
  economy: Coins,
  creator: Hammer,
  special: Sparkles,
};

/** Rarity as a percentage ("4%"); under a tenth of a percent it is "<0.1%". */
function formatShare(share: number, locale?: string): string {
  const percent = share * 100;
  if (percent < 0.1)
    return `<${new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(0.001)}`;
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: percent < 10 ? 1 : 0,
  }).format(share);
}

/** A member's state in words: "Unlocked 3 May 2026", "3 / 10" or "Locked". Never a symbol alone. */
function StateText({ side, target }: { side: SideState; target: number }) {
  const { t } = useTranslation('achievement-compare');
  const lf = useLocaleFormat();
  if (side.unlocked) {
    const date = side.unlockedAt ? lf.date(new Date(side.unlockedAt), { dateStyle: 'medium' }) : null;
    return (
      <>
        <span className="font-medium text-site-text">{t('state-unlocked', { defaultValue: 'Unlocked' })}</span>
        {date ? <span className="t-meta block">{date}</span> : null}
      </>
    );
  }
  return (
    <>
      <span className="text-site-text-muted">{t('state-locked', { defaultValue: 'Locked' })}</span>
      {target > 1 ? (
        <span className="t-meta block">
          {t('progress-of', {
            progress: side.progress,
            target,
            defaultValue: '{{progress}} / {{target}}',
          })}
        </span>
      ) : null}
    </>
  );
}

/**
 * The comparison as a table on rules: the achievement (icon, name, description, rarity), then the viewer's state and the
 * other member's. "Only them" rows carry Track so the viewer can pin the achievement at once.
 */
export function CompareTable({
  rows,
  themName,
  trackedIds,
  busyId,
  canTrack,
  onToggleTrack,
}: {
  rows: readonly CompareRow[];
  themName: string;
  trackedIds: ReadonlySet<string>;
  busyId: string | null;
  /** False until the tracker has loaded: Track would otherwise act on an unknown set. */
  canTrack: boolean;
  onToggleTrack: (id: string, tracked: boolean) => void;
}) {
  const { t } = useTranslation('achievement-compare');
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-start">
        <caption className="sr-only">
          {t('table-caption', { name: themName, defaultValue: 'Your achievements beside {{name}}’s' })}
        </caption>
        <thead>
          <tr className="border-b border-site-border">
            <th scope="col" className="t-label py-2 pe-3 text-start">
              {t('col-achievement', { defaultValue: 'Achievement' })}
            </th>
            <th scope="col" className="t-label w-24 px-2 py-2 text-start sm:w-36 sm:px-3">
              {t('col-you', { defaultValue: 'You' })}
            </th>
            <th scope="col" className="t-label w-24 px-2 py-2 text-start sm:w-36 sm:px-3">
              {themName}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const Icon = row.masked ? Lock : CATEGORY_ICON[row.category];
            return (
              <tr key={row.id} className="border-b border-site-border align-top">
                <th scope="row" className="py-3 pe-3 text-start font-normal">
                  <div className="flex items-start gap-3">
                    <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-site-text-muted" />
                    <div className="min-w-0">
                      <p className="t-body font-semibold">
                        {row.masked ? t('secret-name', { defaultValue: 'A secret achievement' }) : row.name}
                      </p>
                      <p className="t-meta">
                        {row.masked
                          ? t('secret-description', {
                              defaultValue: 'Unlock it yourself to see what it is.',
                            })
                          : row.description}
                      </p>
                      {row.rarity !== null && row.rarity > 0 ? (
                        <p className="t-meta">
                          {t('rarity', {
                            percent: formatShare(row.rarity),
                            defaultValue: '{{percent}} of players',
                          })}
                        </p>
                      ) : null}
                      {row.trackable && canTrack ? (
                        <div className="mt-2">
                          <TrackToggle
                            name={row.name}
                            tracked={trackedIds.has(row.id)}
                            busy={busyId === row.id}
                            onToggle={() => onToggleTrack(row.id, trackedIds.has(row.id))}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </th>
                <td className="t-body px-2 py-3 sm:px-3">
                  <StateText side={row.you} target={row.target} />
                </td>
                <td className="t-body px-2 py-3 sm:px-3">
                  <StateText side={row.them} target={row.target} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
