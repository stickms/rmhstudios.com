/**
 * /rmh-datacenter/power — the power train, the cooling, and where the heat goes.
 *
 * The per-campus PUE column is read straight from `lib/datacenter/campuses.ts`
 * and sorted here, so the page cannot quietly disagree with the facilities
 * tables or with the fleet figure on the overview — that figure is a weighted
 * mean of this column rather than a number somebody typed once.
 *
 * The meters run "better is fuller": the bar is how close a campus is to the
 * best PUE in the estate, and units past the pressure mark take the warning
 * token. Singapore stays on the list at 1.28 for the reason the copy gives.
 */

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CAMPUSES, FLEET_PUE } from '@/lib/datacenter/campuses';
import { CapacityMeter } from './CapacityMeter';
import { DatacenterTabs } from './DatacenterTabs';
import { SectionHeading, SpecRow, Stat } from './parts';

/** The ideal a bar is drawn against — a hall that spent nothing on overhead. */
const PERFECT_PUE = 1;
/** Worst plotted, so the scale has a floor a reader can reason about. */
const WORST_PUE = 1.4;
/** Above this, a campus is drawn in the warning token rather than the accent. */
const PUE_TARGET = 1.2;

/** 1 at a perfect ratio, 0 at the floor. */
function efficiency(pue: number): number {
  return (WORST_PUE - pue) / (WORST_PUE - PERFECT_PUE);
}

export default function PowerPage() {
  const { t } = useTranslation('c-rmh-datacenter');
  const ranked = [...CAMPUSES].sort((a, b) => a.pue - b.pue);

  return (
    <PageLayout
      title={t('pow-title', { defaultValue: 'Power & cooling' })}
      description={t('pow-description', {
        defaultValue: 'Where the watts go, published per campus with the worst one included.',
      })}
    >
      <DatacenterTabs active="/rmh-datacenter/power" />

      <div className="space-y-8 px-4 pb-12">
        <section className="glass-pane rounded-site p-6 sm:p-8">
          <p className="max-w-prose text-site-text-muted">
            {t('pow-lede', {
              defaultValue:
                'Two utility feeds, two UPS trains, two generator plants and a cooling loop designed to survive losing half of itself. Everything below is a trailing twelve-month figure, which means it includes the heat waves.',
            })}
          </p>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label={t('pow-stat-pue', { defaultValue: 'Fleet PUE' })}
            value={FLEET_PUE.toFixed(2)}
            note={t('pow-stat-pue-desc', {
              defaultValue: 'Trailing twelve months, weighted by load',
            })}
          />
          <Stat
            label={t('pow-stat-renew', { defaultValue: 'Renewable' })}
            value="91%"
            note={t('pow-stat-renew-desc', { defaultValue: 'On PPAs, not unbundled certificates' })}
          />
          <Stat
            label={t('pow-stat-wue', { defaultValue: 'Fleet WUE' })}
            value="0.31"
            note={t('pow-stat-wue-desc', { defaultValue: 'Litres of water per kWh of IT load' })}
            tone="load"
          />
          <Stat
            label={t('pow-stat-heat', { defaultValue: 'Heat exported' })}
            value="14 GWh"
            note={t('pow-stat-heat-desc', {
              defaultValue: 'Into district heating, last twelve months',
            })}
            tone="load"
          />
        </div>

        <section className="glass-pane rounded-site p-6 sm:p-8">
          <SectionHeading
            kicker={t('pow-s1-kicker', { defaultValue: 'The train' })}
            heading={t('pow-s1-heading', { defaultValue: 'From the substation to the PDU' })}
          />
          <p className="mt-4 max-w-prose text-site-text-muted">
            {t('pow-s1-lede', {
              defaultValue:
                'Every hall is fed by two independent paths from the utility to the cabinet, and each path is sized to carry the whole load on its own. Concurrent maintainability is the design goal: any component can be taken out for work with the hall still running on the other side.',
            })}
          </p>
          <dl className="mt-5">
            <SpecRow term={t('pow-utility', { defaultValue: 'Utility' })}>
              {t('pow-utility-desc', {
                defaultValue:
                  'Two feeds from separate substations on separate transmission paths at the four largest campuses; a single feed with a second ring connection at the two smallest.',
              })}
            </SpecRow>
            <SpecRow term={t('pow-ups', { defaultValue: 'UPS' })}>
              {t('pow-ups-desc', {
                defaultValue:
                  'Two independent 2N lithium-ion trains per hall, each holding the full load for eight minutes — long enough for the generators, and short enough that nobody is tempted to treat the battery as a plan.',
              })}
            </SpecRow>
            <SpecRow term={t('pow-gen', { defaultValue: 'Generation' })}>
              {t('pow-gen-desc', {
                defaultValue:
                  'N+1 diesel plant with 72 hours of fuel on site and two contracted resupply routes. Started under load monthly and run to full rated output twice a year.',
              })}
            </SpecRow>
            <SpecRow term={t('pow-dist', { defaultValue: 'Distribution' })}>
              {t('pow-dist-desc', {
                defaultValue:
                  'A+B busway to every cabinet, metered per outlet, with the readings exposed in the portal and over the API at one-minute resolution.',
              })}
            </SpecRow>
          </dl>
        </section>

        <section className="glass-pane rounded-site p-6 sm:p-8">
          <SectionHeading
            kicker={t('pow-s2-kicker', { defaultValue: 'Efficiency' })}
            heading={t('pow-s2-heading', { defaultValue: 'PUE per campus, worst included' })}
          />
          <p className="mt-4 max-w-prose text-site-text-muted">
            {t('pow-s2-lede', {
              defaultValue:
                'Singapore is the outlier and stays on the list. A tropical hall running 40 kW cabinets on liquid will never post a Dublin number, and hiding it behind a fleet average would misrepresent both.',
            })}
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {ranked.map((c) => (
              <CapacityMeter
                key={c.id}
                label={c.code}
                value={c.pue.toFixed(2)}
                ratio={efficiency(c.pue)}
                tone={c.pue > PUE_TARGET ? 'warning' : 'accent'}
              />
            ))}
          </div>
          <p className="mt-5 max-w-prose text-sm text-site-text-dim">
            {t('pow-s2-note', {
              defaultValue:
                'The bar is total facility power divided by IT load, measured at the utility intake and averaged over the trailing twelve months, plotted against a 1.40 floor. A fuller bar is a better ratio, and a campus above 1.20 is drawn in the warning tone rather than the accent.',
            })}
          </p>
        </section>

        <section>
          <SectionHeading
            kicker={t('pow-s3-kicker', { defaultValue: 'Cooling' })}
            heading={t('pow-s3-heading', { defaultValue: 'Three loops, chosen by climate' })}
          />
          <p className="mt-4 max-w-prose text-site-text-muted">
            {t('pow-s3-lede', {
              defaultValue:
                'There is no single right cooling design; there is a right one for the ambient outside the wall. Each campus was built for its own climate rather than to a group standard.',
            })}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              [
                'C-01',
                t('pow-cool-free', { defaultValue: 'Indirect free cooling' }),
                t('pow-cool-free-desc', {
                  defaultValue:
                    'Dublin and Hillsboro. Outside air cools a sealed internal loop through a heat exchanger, so the hall never breathes what is outside it. 8,400 usable hours a year in Dublin.',
                }),
              ],
              [
                'C-02',
                t('pow-cool-rdhx', { defaultValue: 'Rear-door heat exchangers' }),
                t('pow-cool-rdhx-desc', {
                  defaultValue:
                    'Ashburn and Frankfurt. Water at the back of the cabinet catches the heat where it is made, which keeps the hall itself at a working temperature for the people in it.',
                }),
              ],
              [
                'C-03',
                t('pow-cool-dlc', { defaultValue: 'Direct-to-chip liquid' }),
                t('pow-cool-dlc-desc', {
                  defaultValue:
                    'Singapore throughout, and the accelerator halls everywhere else. Cold plates on the die, a CDU per row, and a dry-cooler loop that never touches the building chillers.',
                }),
              ],
            ].map(([code, name, desc]) => (
              <Card key={code} className="flex flex-col gap-2 p-5">
                <span className="text-xs font-medium tracking-wide text-site-accent uppercase">
                  {code}
                </span>
                <h3 className="font-display text-lg font-semibold text-site-text">{name}</h3>
                <p className="text-sm text-site-text-muted">{desc}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="glass-pane rounded-site p-6 sm:p-8">
          <SectionHeading
            kicker={t('pow-s4-kicker', { defaultValue: 'Afterwards' })}
            heading={t('pow-s4-heading', { defaultValue: 'The heat has somewhere to go' })}
          />
          <p className="mt-4 max-w-prose text-site-text-muted">
            {t('pow-s4-lede', {
              defaultValue:
                'A datacenter converts almost all of its electricity into low-grade heat. Rejecting that to the sky is the default; selling it into a district loop is better, and at Frankfurt it is what happens.',
            })}
          </p>
          <dl className="mt-5">
            <SpecRow term={t('pow-heat-fra', { defaultValue: 'Frankfurt · 42 °C out' })}>
              {t('pow-heat-fra-desc', {
                defaultValue:
                  'Recovered water leaves FRA-03 into the municipal heating loop at 42 °C, roughly 14 GWh over the last twelve months — about 1,300 homes through a German winter.',
              })}
            </SpecRow>
            <SpecRow term={t('pow-heat-water', { defaultValue: 'Water, counted' })}>
              {t('pow-heat-water-desc', {
                defaultValue:
                  'Fleet WUE is 0.31 L/kWh and Hillsboro is 0.21. Evaporative cooling trades water for electricity, so publishing PUE without WUE tells only the flattering half of that trade.',
              })}
            </SpecRow>
          </dl>
        </section>

        <section className="glass-pane rounded-site p-6 sm:p-8">
          <SectionHeading
            kicker={t('pow-cta-kicker', { defaultValue: 'Reporting' })}
            heading={t('pow-cta-heading', { defaultValue: 'Your share of all of this, monthly' })}
          />
          <p className="mt-4 max-w-prose text-site-text-muted">
            {t('pow-cta-body', {
              defaultValue:
                'Customers get their own energy, water and carbon attribution against measured load rather than a floor-space ratio — the numbers a sustainability report can actually be built from.',
            })}
          </p>
          <div className="mt-6">
            <Button asChild variant="accent">
              <Link to="/rmh-datacenter/contact" search={{ intent: 'Sustainability reporting' }}>
                {t('pow-cta-button', { defaultValue: 'Ask for a sample report' })}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
