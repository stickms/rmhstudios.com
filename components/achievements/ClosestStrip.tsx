import { useTranslation } from 'react-i18next';
import { AchievementProgress } from '@/components/achievements/AchievementProgress';
import { TrackToggle } from '@/components/achievements/TrackToggle';
import type { StripRow } from '@/components/achievements/TrackedStrip';

/** "Closest to unlocking": the locked achievements nearest their target, as rows on rules. Renders nothing when empty. */
export function ClosestStrip({
  rows,
  tracked,
  busyId,
  onToggle,
}: {
  rows: readonly StripRow[];
  tracked: ReadonlySet<string>;
  busyId: string | null;
  onToggle: (id: string, tracked: boolean) => void;
}) {
  const { t } = useTranslation('achievement-tracker');
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="closest-heading" className="pt-6">
      <h2 id="closest-heading" className="t-label pb-2">
        {t('closest-heading', {
          defaultValue: 'Closest to unlocking',
        })}
      </h2>
      <ul className="border-t border-site-border">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-4 border-b border-site-border py-3">
            <div className="min-w-0 flex-1">
              <p className="t-body truncate font-semibold text-site-text">{row.name}</p>
              <AchievementProgress name={row.name} progress={row.progress} target={row.target} className="mt-2" />
              <p className="t-meta mt-1">
                {row.progress} / {row.target}
              </p>
            </div>
            <TrackToggle
              name={row.name}
              tracked={tracked.has(row.id)}
              busy={busyId === row.id}
              onToggle={() => onToggle(row.id, tracked.has(row.id))}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
