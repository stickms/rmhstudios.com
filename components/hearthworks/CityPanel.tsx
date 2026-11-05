'use client';

import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins, Droplets, Smile, UsersRound, Zap } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import {
  DEFAULT_TAX_RATE,
  MAX_TAX_RATE,
  MILESTONES,
  MIN_TAX_RATE,
  type CityEventId,
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

/** The words for a town event: its name, and in plain words what it does. */
export function cityEventText(t: TFunction, id: CityEventId): { name: string; effect: string } {
  switch (id) {
    case 'festival':
      return {
        name: t('event-festival', { defaultValue: 'Festival' }),
        effect: t('event-festival-effect', {
          defaultValue: 'People are happier and shops do a little more business.',
        }),
      };
    case 'tradeFair':
      return {
        name: t('event-trade-fair', { defaultValue: 'Market fair' }),
        effect: t('event-trade-fair-effect', {
          defaultValue: 'Shops and workshops earn half as much again.',
        }),
      };
    case 'harvest':
      return {
        name: t('event-harvest', { defaultValue: 'Harvest windfall' }),
        effect: t('event-harvest-effect', { defaultValue: 'Taxes bring in a third more.' }),
      };
    case 'storm':
      return {
        name: t('event-storm', { defaultValue: 'Power-line storm' }),
        effect: t('event-storm-effect', {
          defaultValue: 'Windmills and water wheels give less power. Nobody leaves.',
        }),
      };
    case 'drySpell':
      return {
        name: t('event-dry-spell', { defaultValue: 'Dry spell' }),
        effect: t('event-dry-spell-effect', {
          defaultValue: 'Wells and pumps give less water. Nobody leaves.',
        }),
      };
  }
}

/** What a tax rate does, in words: more money and less cheer above the standard rate, the reverse below. */
export function taxEffectText(t: TFunction, rate: number): string {
  if (rate === DEFAULT_TAX_RATE)
    return t('tax-effect-standard', {
      defaultValue: 'Standard rate. People are neither pleased nor bothered.',
    });
  if (rate > DEFAULT_TAX_RATE)
    return t('tax-effect-high', {
      defaultValue:
        'Higher taxes bring in more from each resident, but people are less happy and fewer move in.',
    });
  if (rate === MIN_TAX_RATE)
    return t('tax-effect-none', {
      defaultValue:
        'No taxes. People are glad and more move in, but the town earns nothing from them.',
    });
  return t('tax-effect-low', {
    defaultValue: 'Lower taxes keep people happy and draw more in, but the town earns less.',
  });
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

/** The tax-rate slider. The thumb moves freely; the command is sent once, when the player lets go (or presses a key). */
function TaxControl() {
  const { t } = useTranslation('c-hearthworks');
  const rate = useHearthworks((s) => s.world.city.taxRate);
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? rate;
  return (
    <div className="hw-tax">
      <div className="hw-row">
        <span id="hw-tax-label">{t('tax-rate', { defaultValue: 'Tax rate' })}</span>
        <b>{shown}%</b>
      </div>
      <Slider
        aria-labelledby="hw-tax-label"
        min={MIN_TAX_RATE}
        max={MAX_TAX_RATE}
        step={1}
        value={[shown]}
        onValueChange={([v]) => setDraft(v ?? rate)}
        onValueCommit={([v]) => {
          setDraft(null);
          if (v !== undefined && v !== rate)
            hearthworksStore.getState().dispatch({ type: 'setTaxRate', rate: v });
        }}
      />
      <p className="hw-muted" aria-live="polite">
        {taxEffectText(t, shown)}
      </p>
    </div>
  );
}

/** The event in progress, if any: what it is, what it does, and how long it lasts. */
function EventBanner() {
  const { t } = useTranslation('c-hearthworks');
  const event = useHearthworks((s) => s.world.city.event);
  useHearthworks((s) => s.rev);
  if (!event) return null;
  const text = cityEventText(t, event.id);
  return (
    <div className="hw-event" role="status" data-event={event.id}>
      <div className="hw-row">
        <b>{text.name}</b>
        <span className="hw-muted">
          {t('event-days-left', { defaultValue: 'Days left: {{days}}', days: event.daysLeft })}
        </span>
      </div>
      <p className="hw-muted">{text.effect}</p>
    </div>
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
      <EventBanner />

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

      <h3 className="hw-panel__sub">{t('tax-title', { defaultValue: 'Taxes' })}</h3>
      <TaxControl />

      <h3 className="hw-panel__sub">{t('city-milestones', { defaultValue: 'Milestones' })}</h3>
      <ul className="hw-list">
        {MILESTONES.map((m) => (
          <MilestoneRow key={m.id} def={m} />
        ))}
      </ul>
    </section>
  );
}
