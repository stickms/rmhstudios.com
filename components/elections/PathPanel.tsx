import { useTranslation } from 'react-i18next';
import type { ChamberControl } from '@/lib/elections/types';
import type { Race } from '@/lib/elections/types';
import { OFFICE_NAME } from '@/lib/elections/types';
import { pathToControl, type PartyPath } from '@/lib/elections/path';

/** "Path to control": what each party still needs in each chamber, from the seats held plus the ratings. */
export function PathPanel({ chambers, races }: { chambers: Partial<Record<'senate' | 'house', ChamberControl>>; races: Race[] }) {
  const { t } = useTranslation('c-elections');
  const rows = pathToControl(chambers, races);
  if (!rows.length) return null;

  const line = (p: PartyPath, controlled: boolean) => {
    if (controlled) return t('path.has', { defaultValue: 'Has control' });
    if (!p.reachable) return t('path.out', { defaultValue: 'Out of reach — even every toss-up is not enough' });
    if (p.tossupsNeeded === 0) return t('path.leans', { defaultValue: 'Gets there on the races that lean its way' });
    return t('path.needs', { defaultValue: 'Needs {{n}} of the toss-ups', n: p.tossupsNeeded });
  };

  return (
    <section className="el-path" aria-label={t('path.title', { defaultValue: 'Path to control' })}>
      <p className="el-eyebrow" style={{ margin: '0 0 10px' }}>
        {t('path.title', { defaultValue: 'Path to control' })}
      </p>
      <div className="el-path__grid">
        {rows.map((c) => (
          <div key={c.office} className="el-box el-proj" style={{ margin: 0 }}>
            <h3 className="el-drawer__title" style={{ fontSize: 24 }}>
              {OFFICE_NAME[c.office]}
              <span className="el-eyebrow" style={{ marginLeft: 8 }}>
                {t('path.toWin', { defaultValue: '{{n}} to win', n: c.toWin })} ·{' '}
                {t('path.tossups', { defaultValue: '{{n}} toss-ups open', n: c.tossups })}
              </span>
            </h3>
            {[c.dem, c.gop].map((p) => (
              <p key={p.party} className="el-path__row">
                <span className={`el-chip el-chip--${p.party === 'DEM' ? 'dem' : 'gop'}`}>{p.party === 'DEM' ? 'Dem' : 'GOP'}</span>
                <span>
                  <strong>{p.seats}</strong> {t('path.seats', { defaultValue: 'seats' })}
                  {p.leaning ? ` + ${p.leaning} ${t('path.leaning', { defaultValue: 'leaning' })}` : ''} —{' '}
                  {line(p, c.controlledBy === p.party)}
                </span>
              </p>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
