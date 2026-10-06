'use client';

/**
 * Dunesday Planner — plan settings beside the marathon status and where the
 * hours go. The panels render bare (no inner window frames) inside the OS
 * window, as Windows 7 groups.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { allTitles, isIncluded } from '@/lib/dunesday/state';
import { TITLES } from '@/lib/dunesday/titles';
import { AeroWindow, BareChrome } from '../../AeroWindow';
import { useDunesday } from '../../DunesdayProvider';
import { PlanControls } from '../../PlanControls';
import { StatusPanel } from '../../StatusPanel';
import { Win7Progress } from '../../Win7Progress';

export default function PlannerApp() {
  const d = useDunesday();
  return (
    <BareChrome.Provider value>
      <div className="ds-app-grid2">
        <PlanControls
          state={d.state}
          actions={d.actions}
          effectiveAvg={d.plan.minutesPerDay}
          effectiveStart={d.settings.startDate}
        />
        <div className="ds-stack">
          <StatusPanel
            plan={d.plan}
            progress={d.progress}
            deadline={d.state.settings.deadline}
            fitMinutes={d.fitMinutes}
            essentialsFinish={d.essentialsFinish}
            onUseFit={() => d.actions.setSettings({ mode: 'fit' })}
            onEssentials={() => d.actions.preset('essentials')}
          />
          <TitleMix />
        </div>
      </div>
    </BareChrome.Provider>
  );
}

/** Where the hours go: MCU films vs series vs Dune vs extras. */
function TitleMix() {
  const { t } = useTranslation('c-dunesday');
  const { state } = useDunesday();
  const rows = useMemo(() => {
    const included = allTitles(state).filter((x) => isIncluded(state, x));
    const sum = (f: (x: (typeof included)[number]) => boolean) =>
      included.filter(f).reduce((a, x) => a + (state.runtimeOverrides[x.id] ?? x.minutes), 0);
    return [
      {
        key: 'films',
        label: t('mix-films', { defaultValue: 'MCU films' }),
        minutes: sum((x) => x.franchise === 'mcu' && x.kind === 'film'),
      },
      {
        key: 'series',
        label: t('mix-series', { defaultValue: 'MCU series & specials' }),
        minutes: sum((x) => x.franchise === 'mcu' && x.kind !== 'film'),
      },
      {
        key: 'dune',
        label: t('mix-dune', { defaultValue: 'Dune' }),
        minutes: sum((x) => x.franchise === 'dune'),
      },
      {
        key: 'extra',
        label: t('mix-extra', { defaultValue: 'Your extras' }),
        minutes: sum((x) => x.franchise === 'extra'),
      },
    ].filter((r) => r.minutes > 0);
  }, [state, t]);
  const total = rows.reduce((a, r) => a + r.minutes, 0) || 1;
  const skipped = TITLES.filter((x) => !isIncluded(state, x)).length;
  return (
    <AeroWindow
      title={t('mix-title', { defaultValue: 'Where the hours go' })}
      bodyClassName="ds-stack"
      bodyStyle={{ gap: 10 }}
    >
      {rows.map((r) => (
        <div key={r.key}>
          <div className="ds-row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
            <span>{r.label}</span>
            <strong>{Math.round(r.minutes / 60)}h</strong>
          </div>
          <Win7Progress value={r.minutes / total} />
        </div>
      ))}
      {skipped > 0 && (
        <span className="ds-hint">
          {t('mix-skipped', {
            count: skipped,
            defaultValue: '{{count}} titles left out of the plan.',
            defaultValue_one: '{{count}} title left out of the plan.',
            defaultValue_other: '{{count}} titles left out of the plan.',
          })}
        </span>
      )}
    </AeroWindow>
  );
}
