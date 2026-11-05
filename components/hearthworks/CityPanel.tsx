'use client';

import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Coins, Droplets, Smile, UsersRound, Zap } from 'lucide-react';
import {
  MILESTONES,
  type MilestoneDef,
  type UnlockId,
  type UtilityId,
  type ZoneId,
} from '@/lib/hearthworks/content';
import { hearthworksStore, useHearthworks } from '@/lib/hearthworks/store';
import { milestoneProgress, nextStep, type NextStep } from '@/lib/hearthworks/world';

/** The words for the city's named things. Literal defaults, so the extractor and the drift test can see every one. */
export function zoneName(t: TFunction, zone: ZoneId): string {
  switch (zone) {
    case 'homes':
      return t('zone-homes', { defaultValue: 'Homes' });
    case 'market':
      return t('zone-market', { defaultValue: 'Shops' });
    case 'workshop':
      return t('zone-workshop', { defaultValue: 'Workshops' });
  }
}

export function utilityName(t: TFunction, kind: UtilityId): string {
  switch (kind) {
    case 'well':
      return t('util-well', { defaultValue: 'Well' });
    case 'windmill':
      return t('util-windmill', { defaultValue: 'Windmill' });
    case 'pump':
      return t('util-pump', { defaultValue: 'Pumping station' });
    case 'waterwheel':
      return t('util-waterwheel', { defaultValue: 'Water wheel' });
  }
}

export function milestoneText(t: TFunction, id: string): { name: string; goal: string } {
  switch (id) {
    case 'hamlet':
      return {
        name: t('ms-hamlet', { defaultValue: 'Hamlet' }),
        goal: t('ms-hamlet-goal', {
          defaultValue: '16 residents, light and water for most of them, and a shop.',
        }),
      };
    case 'village':
      return {
        name: t('ms-village', { defaultValue: 'Village' }),
        goal: t('ms-village-goal', {
          defaultValue: '30 residents, 12 jobs, and neighbours who are content.',
        }),
      };
    case 'commons':
      return {
        name: t('ms-commons', { defaultValue: 'Green commons' }),
        goal: t('ms-commons-goal', { defaultValue: '3 parks and a happy village of 40.' }),
      };
    case 'town':
      return {
        name: t('ms-town', { defaultValue: 'Town' }),
        goal: t('ms-town-goal', {
          defaultValue: '80 residents, 3 dense lots, and the books in the black.',
        }),
      };
    case 'city':
      return {
        name: t('ms-city', { defaultValue: 'City' }),
        goal: t('ms-city-goal', {
          defaultValue: '200 residents, 3 workshops, and the lights on everywhere.',
        }),
      };
    default:
      return { name: id, goal: '' };
  }
}

export function unlockName(t: TFunction, id: UnlockId): string {
  switch (id) {
    case 'zone:workshop':
      return zoneName(t, 'workshop');
    case 'utility:pump':
      return utilityName(t, 'pump');
    case 'utility:waterwheel':
      return utilityName(t, 'waterwheel');
  }
}

export function stepText(t: TFunction, step: NextStep): string {
  switch (step) {
    case 'road':
      return t('step-road', {
        defaultValue: 'Drag a road out from the town green in the middle of the map.',
      });
    case 'zone-homes':
      return t('step-zone-homes', { defaultValue: 'Paint a homes zone beside your road.' });
    case 'power':
      return t('step-power', { defaultValue: 'Put a windmill beside a road for power.' });
    case 'water':
      return t('step-water', { defaultValue: 'Put a well beside a road for water.' });
    case 'zone-market':
      return t('step-zone-market', {
        defaultValue: 'Paint a shops zone: work for your residents, and somewhere to spend.',
      });
    case 'milestone':
      return t('step-milestone', { defaultValue: 'Keep growing toward the next milestone.' });
    case 'grow':
      return t('step-grow', { defaultValue: 'Your town is thriving. Keep building.' });
  }
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function Meter({
  label,
  value,
  max = 100,
  text,
}: {
  label: string;
  value: number;
  max?: number;
  text?: string;
}) {
  return (
    <div className="hw-meter hw-meter--wide">
      <span className="hw-meter__label">{label}</span>
      <div
        className="hw-meter__track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div
          className="hw-meter__fill"
          style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }}
        />
      </div>
      <span className="hw-meter__value">{text ?? value}</span>
    </div>
  );
}

/** One line of the town's vital signs, shown over the city tools: people, mood, power, water and the daily budget. */
export function CityReadout() {
  const { t } = useTranslation('c-hearthworks');
  const stats = useHearthworks((s) => s.world.city.stats);
  const people = useHearthworks((s) => s.world.city.population);
  useHearthworks((s) => s.rev);
  const net = stats.net;
  return (
    <p className="hw-city-readout">
      <span title={t('readout-people', { defaultValue: 'Residents' })}>
        <UsersRound aria-hidden size={16} /> {people}
      </span>
      <span
        title={t('readout-power', { defaultValue: 'Homes and shops with power' })}
        data-low={stats.powerCover < 70 ? 'true' : undefined}
      >
        <Zap aria-hidden size={16} /> {stats.powerCover}%
      </span>
      <span
        title={t('readout-water', { defaultValue: 'Homes and shops with water' })}
        data-low={stats.waterCover < 70 ? 'true' : undefined}
      >
        <Droplets aria-hidden size={16} /> {stats.waterCover}%
      </span>
      <span
        title={t('readout-net', { defaultValue: 'Town budget per day' })}
        data-low={net < 0 ? 'true' : undefined}
      >
        <Coins aria-hidden size={16} /> {signed(net)}
      </span>
    </p>
  );
}

function MilestoneRow({ def }: { def: MilestoneDef }) {
  const { t } = useTranslation('c-hearthworks');
  const world = useHearthworks((s) => s.world);
  useHearthworks((s) => s.rev);
  const text = milestoneText(t, def.id);
  const reached = world.city.reached.includes(def.id);
  const claimed = world.city.claimed.includes(def.id);
  const progress = Math.round(milestoneProgress(world, def) * 100);
  return (
    <li className="hw-milestone" data-state={claimed ? 'claimed' : reached ? 'reached' : 'open'}>
      <div className="hw-row">
        <b>{text.name}</b>
        {reached && !claimed ? (
          <button
            type="button"
            className="hw-small"
            onClick={() =>
              hearthworksStore.getState().dispatch({ type: 'claimMilestone', id: def.id })
            }
          >
            {t('milestone-claim', { defaultValue: 'Claim +{{reward}}', reward: def.reward })}
          </button>
        ) : claimed ? (
          <span className="hw-muted">{t('milestone-claimed', { defaultValue: 'Claimed' })}</span>
        ) : (
          <span className="hw-muted">{progress}%</span>
        )}
      </div>
      <p className="hw-muted">{text.goal}</p>
      {!reached && <Meter label={text.name} value={progress} />}
      {def.unlocks.length > 0 && (
        <p className="hw-muted">
          {t('milestone-opens', {
            defaultValue: 'Opens: {{what}}',
            what: def.unlocks.map((u) => unlockName(t, u)).join(', '),
          })}
        </p>
      )}
    </li>
  );
}

/** The town panel: how it is doing, what it wants, the budget, and the milestones with their rewards. */
export function CityPanel() {
  const { t } = useTranslation('c-hearthworks');
  const world = useHearthworks((s) => s.world);
  useHearthworks((s) => s.rev);
  const s = world.city.stats;
  return (
    <section
      className="hw-panel hw-panel--tall"
      aria-label={t('city-title', { defaultValue: 'Town' })}
    >
      <h2 className="hw-panel__title">{t('city-title', { defaultValue: 'Town' })}</h2>
      <p className="hw-muted">{stepText(t, nextStep(world))}</p>

      <h3 className="hw-panel__sub">{t('city-people', { defaultValue: 'People' })}</h3>
      <Meter
        label={t('meter-people', { defaultValue: 'People' })}
        value={world.city.population}
        max={Math.max(1, s.housing)}
        text={`${world.city.population}/${s.housing}`}
      />
      <Meter label={t('meter-mood', { defaultValue: 'Mood' })} value={s.happiness} />
      <Meter
        label={t('meter-power', { defaultValue: 'Power' })}
        value={s.powerCover}
        text={`${s.powerCover}%`}
      />
      <Meter
        label={t('meter-water', { defaultValue: 'Water' })}
        value={s.waterCover}
        text={`${s.waterCover}%`}
      />
      <p className="hw-muted">
        <Smile aria-hidden size={14} />{' '}
        {t('city-jobs', {
          defaultValue: '{{jobs}} jobs for {{workers}} workers',
          jobs: s.jobs,
          workers: s.workforce,
        })}
      </p>

      <h3 className="hw-panel__sub">{t('city-wants', { defaultValue: 'Wants to grow' })}</h3>
      <Meter label={t('meter-homes', { defaultValue: 'Homes' })} value={s.demandHomes} />
      <Meter label={t('meter-shops', { defaultValue: 'Shops' })} value={s.demandMarket} />
      <Meter label={t('meter-work', { defaultValue: 'Work' })} value={s.demandWorkshop} />

      <h3 className="hw-panel__sub">{t('city-budget', { defaultValue: 'Budget per day' })}</h3>
      <ul className="hw-list">
        <li className="hw-row">
          <span>{t('budget-tax', { defaultValue: 'Taxes' })}</span>
          <b>{signed(s.tax)}</b>
        </li>
        <li className="hw-row">
          <span>{t('budget-trade', { defaultValue: 'Trade' })}</span>
          <b>{signed(s.trade)}</b>
        </li>
        <li className="hw-row">
          <span>{t('budget-upkeep', { defaultValue: 'Upkeep' })}</span>
          <b>{signed(-s.upkeep)}</b>
        </li>
        <li className="hw-row">
          <span>{t('budget-net', { defaultValue: 'Shared between players' })}</span>
          <b>{signed(s.net)}</b>
        </li>
      </ul>

      <h3 className="hw-panel__sub">{t('city-milestones', { defaultValue: 'Milestones' })}</h3>
      <ul className="hw-list">
        {MILESTONES.map((m) => (
          <MilestoneRow key={m.id} def={m} />
        ))}
      </ul>
    </section>
  );
}
