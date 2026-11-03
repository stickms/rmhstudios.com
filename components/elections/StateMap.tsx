import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Office, Race } from '@/lib/elections/types';
import { OFFICE_NAME } from '@/lib/elections/types';
import { buildStateViews, emptyView, type StateView } from '@/lib/elections/map-model';
import { STATE_CODES, stateName } from '@/lib/elections/states';
import { TileGrid, type TileCell } from './TileGrid';
import { RaceCard } from './RaceCard';

/** The map plus its state drawer. */
export function StateMap({
  races,
  offices,
  selected,
  onSelect,
}: {
  races: Race[];
  offices: Office[];
  selected: string | null;
  onSelect: (postal: string | null) => void;
}) {
  const { t } = useTranslation('c-elections');
  const [office, setOffice] = useState<Office>(offices.includes('senate') ? 'senate' : offices[0]);

  const views = useMemo(() => {
    const m = new Map<Office, Map<string, StateView>>();
    for (const o of offices) m.set(o, buildStateViews(races, o));
    return m;
  }, [races, offices]);

  const cells = useMemo(() => {
    const current = views.get(office) ?? new Map<string, StateView>();
    const out = new Map<string, TileCell>();
    for (const code of STATE_CODES) {
      const v = current.get(code) ?? emptyView(code);
      out.set(code, {
        tone: v.tone,
        caption: v.caption,
        flipped: v.flipped,
        label: v.races.length
          ? `${v.name}: ${OFFICE_NAME[office]}, ${v.caption || v.phase}`
          : `${v.name}: no ${OFFICE_NAME[office]} race`,
      });
    }
    return out;
  }, [views, office]);

  const stateRaces = useMemo(
    () => (selected ? races.filter((r) => r.state === selected) : []),
    [races, selected],
  );

  return (
    <div className="el-map">
      <div>
        <div
          className="el-tabs"
          role="group"
          aria-label={t('map.office', { defaultValue: 'Office' })}
        >
          {offices.map((o) => (
            <button
              key={o}
              type="button"
              className="el-btn"
              aria-pressed={office === o}
              onClick={() => setOffice(o)}
            >
              {OFFICE_NAME[o]}
            </button>
          ))}
        </div>
        <TileGrid
          cells={cells}
          selected={selected}
          onSelect={(p) => onSelect(selected === p ? null : p)}
          ariaLabel={t('map.aria', {
            defaultValue: 'Map of states. Select a state for its races.',
          })}
        />
        <div className="el-legend" aria-hidden>
          <span>
            <i style={{ background: 'var(--el-dem)' }} />
            {t('map.lDem', { defaultValue: 'Dem won' })}
          </span>
          <span>
            <i style={{ background: 'var(--el-hatch)' }} />
            {t('map.lGop', { defaultValue: 'GOP won' })}
          </span>
          <span>
            <i
              style={{ background: 'radial-gradient(#000 1.5px,transparent 2px) 0 0/6px 6px,#fff' }}
            />
            {t('map.lLeadD', { defaultValue: 'Dem leads / leans' })}
          </span>
          <span>
            <i
              style={{ background: 'repeating-linear-gradient(135deg,#000 0 1px,#fff 1px 7px)' }}
            />
            {t('map.lLeadR', { defaultValue: 'GOP leads / leans' })}
          </span>
          <span>
            <i style={{ background: 'repeating-linear-gradient(45deg,#000 0 2px,#fff 2px 5px)' }} />
            {t('map.lToss', { defaultValue: 'Toss-up' })}
          </span>
          <span>
            <i style={{ background: 'transparent', borderStyle: 'dashed' }} />
            {t('map.lNone', { defaultValue: 'No race' })}
          </span>
        </div>
      </div>

      <aside className="el-drawer el-box" aria-live="polite">
        {selected ? (
          <div className="el-stack">
            <h3 className="el-drawer__title">{stateName(selected)}</h3>
            {stateRaces.length === 0 ? (
              <p className="el-eyebrow">
                {t('map.noRaces', {
                  defaultValue: 'No federal or governor races here this cycle.',
                })}
              </p>
            ) : (
              stateRaces
                .sort((a, b) => a.office.localeCompare(b.office) || a.label.localeCompare(b.label))
                .slice(0, 12)
                .map((r) => <RaceCard key={r.id} race={r} />)
            )}
            {stateRaces.length > 12 ? (
              <p className="el-eyebrow">
                {t('map.more', {
                  defaultValue: '+{{n}} more — see Races below',
                  n: stateRaces.length - 12,
                })}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="el-stack">
            <h3 className="el-drawer__title">{t('map.pick', { defaultValue: 'Pick a state' })}</h3>
            <p className="el-eyebrow">
              {t('map.pickHint', {
                defaultValue:
                  'Every tile is one state, same size — the way Senate and governor nights are won.',
              })}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
