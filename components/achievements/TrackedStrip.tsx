import { useTranslation } from 'react-i18next';
import { AchievementProgress } from '@/components/achievements/AchievementProgress';
import { TrackToggle } from '@/components/achievements/TrackToggle';

export interface StripRow {
  id: string;
  name: string;
  progress: number;
  target: number;
}

/** The achievements the member is tracking, as rows on rules with progress ("37 / 50") and Untrack. */
export function TrackedStrip({
  rows,
  max,
  busyId,
  onUntrack,
}: {
  rows: readonly StripRow[];
  max: number;
  busyId:
    | string
    | null;
  onUntrack: (
    id: string,
  ) => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'achievement-tracker',
    );
  return (
    <section
      aria-labelledby="tracked-heading"
      className="pt-6"
    >
      <h2
        id="tracked-heading"
        className="t-label pb-2"
      >
        {t(
          'tracked-heading',
          {
            count:
              rows.length,
            max,
            defaultValue:
              'Tracked ({{count}} of {{max}})',
          },
        )}
      </h2>
      {rows.length ===
      0 ? (
        <p className="t-body border-t border-b border-site-border py-3 text-site-text-muted">
          {t(
            'tracked-empty',
            {
              max,
              defaultValue:
                'Track up to {{max}} achievements to follow them here.',
            },
          )}
        </p>
      ) : (
        <ul className="border-t border-site-border">
          {rows.map(
            (
              row,
            ) => (
              <li
                key={
                  row.id
                }
                className="flex items-center gap-4 border-b border-site-border py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="t-body truncate font-semibold text-site-text">
                    {
                      row.name
                    }
                  </p>
                  <AchievementProgress
                    name={
                      row.name
                    }
                    progress={
                      row.progress
                    }
                    target={
                      row.target
                    }
                    className="mt-2"
                  />
                  <p className="t-meta mt-1">
                    {
                      row.progress
                    }{' '}
                    /{' '}
                    {
                      row.target
                    }
                  </p>
                </div>
                <TrackToggle
                  name={
                    row.name
                  }
                  tracked
                  busy={
                    busyId ===
                    row.id
                  }
                  onToggle={() =>
                    onUntrack(
                      row.id,
                    )
                  }
                />
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
