import { useTranslation } from 'react-i18next';
import type { ElectionSnapshot } from '@/lib/elections/types';
import { watchByClosing } from '@/lib/elections/watch';

const RATING_WORD: Record<string, string> = {
  tossup: 'Toss-up',
  'lean-dem': 'Lean D',
  'lean-rep': 'Lean R',
};

/** "What to watch": the competitive races still open, grouped by when their polls close. */
export function WatchList({
  snapshot,
  now,
  onSelectState,
}: {
  snapshot: ElectionSnapshot;
  now: Date | null;
  onSelectState: (postal: string) => void;
}) {
  const { t } = useTranslation('c-elections');
  const groups = watchByClosing(snapshot, now ?? new Date());
  if (!groups.length) return null;
  return (
    <section className="el-watch" aria-label={t('watch.hours', { defaultValue: 'What to watch, hour by hour' })}>
      <p className="el-eyebrow" style={{ margin: '0 0 10px' }}>
        {t('watch.hours', { defaultValue: 'What to watch, hour by hour' })}
      </p>
      <div className="el-watch__grid">
        {groups.map((g) => (
          <div key={g.iso || 'tbd'} className="el-box el-proj" style={{ margin: 0 }}>
            <h3 className="el-drawer__title" style={{ fontSize: 22 }}>
              {g.displayET || t('watch.tbd', { defaultValue: 'Time to be confirmed' })}
              {g.displayET ? <span className="el-eyebrow"> ET</span> : null}{' '}
              {g.closed ? <span className="el-chip el-chip--ink">{t('watch.closed', { defaultValue: 'Polls closed' })}</span> : null}
            </h3>
            <ul className="el-desk__list" style={{ margin: 0 }}>
              {g.races.map((r) => (
                <li key={r.id}>
                  <button type="button" className="el-linkbtn" onClick={() => onSelectState(r.state)}>
                    {r.label}
                  </button>{' '}
                  <span className="el-chip">{RATING_WORD[r.rating ?? ''] ?? ''}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
