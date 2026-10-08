/**
 * /rmh-datacenter/facilities — the estate, campus by campus.
 *
 * The numbers come from `lib/datacenter/campuses.ts`; the prose stays here,
 * keyed by campus id with literal keys, because `i18next-parser` cannot see
 * through a key read out of a catalog and a description stored beside the data
 * would never reach `locales/`.
 *
 * Each campus draws its OWN hall — `Campus.hall` feeds the same loft the front
 * page uses — so the shape beside Singapore is a short, tall, liquid-cooled box
 * and the one beside Ashburn is a long one. Six copies of one picture would
 * have been easier and would have been a lie.
 */

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CAMPUSES, TOTAL_HALLS, TOTAL_MW } from '@/lib/datacenter/campuses';
import { CapacityMeter } from './CapacityMeter';
import { DatacenterTabs } from './DatacenterTabs';
import { HallDiagram } from './HallDiagram';
import { SectionHeading, SpecRow, Stat } from './parts';
import { useCampusNames } from './useCampusNames';

export default function FacilitiesPage() {
  const { t } = useTranslation('c-rmh-datacenter');
  const names = useCampusNames();

  const prose: Record<string, { cooling: string; desc: string }> = {
    'ash-01': {
      cooling: t('fac-ash-cooling', { defaultValue: 'Rear-door heat exchangers, N+2 chillers' }),
      desc: t('fac-ash-desc', {
        defaultValue:
          'The anchor campus, and the one the rest of the estate is measured against. Four halls on a 62 MW utility feed, two substations on separate transmission paths, and the densest peering fabric we touch anywhere — fourteen carriers enter the building through two diverse conduits.',
      }),
    },
    'dub-02': {
      cooling: t('fac-dub-cooling', { defaultValue: 'Indirect free cooling, 8,400 h/year' }),
      desc: t('fac-dub-desc', {
        defaultValue:
          'The European landing point and the most efficient hall we run: Irish ambient means indirect free cooling for all but a few hundred hours a year, and the supply is 100% renewable on a fifteen-year wind PPA. Data stays in the EU by contract as well as by geography.',
      }),
    },
    'sin-01': {
      cooling: t('fac-sin-cooling', { defaultValue: 'Direct-to-chip liquid, 40 kW racks' }),
      desc: t('fac-sin-desc', {
        defaultValue:
          'The APAC hall, liquid cooled end to end because at 30 °C ambient with 80% humidity air is the expensive coolant. It carries the worst PUE in the estate and the best watts-per-rack, which is the trade tropical density actually makes.',
      }),
    },
    'fra-03': {
      cooling: t('fac-fra-cooling', { defaultValue: 'Adiabatic, with district heat export' }),
      desc: t('fac-fra-desc', {
        defaultValue:
          'Continental Europe’s interconnection point, and the campus that exports its waste heat: recovered water leaves the building at 42 °C into a district heating loop that serves about 1,300 homes over a winter.',
      }),
    },
    'pdx-01': {
      cooling: t('fac-pdx-cooling', { defaultValue: 'Evaporative, WUE 0.21 L/kWh' }),
      desc: t('fac-pdx-desc', {
        defaultValue:
          'The west-coast site, on hydro supply and the transpacific cable landings. Smaller than the others on purpose: it exists so a US customer can hold a second copy of their estate on a different grid interconnection without leaving the country.',
      }),
    },
    'gru-01': {
      cooling: t('fac-gru-cooling', { defaultValue: 'Chilled water, N+1' }),
      desc: t('fac-gru-desc', {
        defaultValue:
          'The newest campus, opened to serve South American latency rather than to chase capacity. Two halls, room on the land for four more, and the only site in the estate where we still buy grid power on a spot contract.',
      }),
    },
  };

  return (
    <PageLayout
      title={t('fac-title', { defaultValue: 'Facilities' })}
      description={t('fac-description', {
        defaultValue: 'Six campuses we own — halls, power, cooling and committed capacity.',
      })}
    >
      <DatacenterTabs active="/rmh-datacenter/facilities" />

      <div className="space-y-8 px-4 pb-12">
        <section className="glass-pane rounded-site p-6 sm:p-8">
          <p className="max-w-prose text-site-text-muted">
            {t('fac-lede', {
              defaultValue:
                'Not leased suites inside somebody else’s building. We hold the freehold, the generators and the fibre entering the site, which is why a maintenance window here is one we schedule rather than one we are notified about.',
            })}
          </p>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label={t('fac-stat-sites', { defaultValue: 'Campuses' })}
            value={String(CAMPUSES.length)}
            note={t('fac-stat-sites-desc', { defaultValue: 'Across three continents' })}
          />
          <Stat
            label={t('fac-stat-halls', { defaultValue: 'Halls' })}
            value={String(TOTAL_HALLS)}
            note={t('fac-stat-halls-desc', { defaultValue: 'Independently powered and cooled' })}
          />
          <Stat
            label={t('fac-stat-power', { defaultValue: 'Contracted' })}
            value={`${TOTAL_MW} MW`}
            note={t('fac-stat-power-desc', { defaultValue: 'Utility capacity across the estate' })}
            tone="load"
          />
          <Stat
            label={t('fac-stat-expansion', { defaultValue: 'Land banked' })}
            value="210 MW"
            note={t('fac-stat-expansion-desc', { defaultValue: 'Permitted and awaiting build' })}
          />
        </div>

        {CAMPUSES.map((c) => {
          const copy = prose[c.id];
          return (
            <section key={c.id} id={c.id} className="glass-pane rounded-site p-6 sm:p-8">
              <SectionHeading kicker={`${c.code} · ${c.region}`} heading={names[c.id]} />
              <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_minmax(0,18rem)]">
                <div className="min-w-0">
                  <p className="max-w-prose text-site-text-muted">{copy.desc}</p>
                </div>
                <div className="min-w-0 space-y-4">
                  <div className="text-site-accent">
                    <HallDiagram
                      spec={c.hall}
                      className="w-full"
                      label={t('fac-hall-label', {
                        defaultValue:
                          '{{code}}: a hall {{length}} m long, {{width}} m across and {{height}} m to the roof.',
                        code: c.code,
                        length: c.hall.length,
                        width: c.hall.width,
                        height: c.hall.height,
                      })}
                    />
                  </div>
                  <CapacityMeter
                    label={t('spec-capacity', { defaultValue: 'Committed capacity' })}
                    value={`${Math.round(c.committed * 100)}%`}
                    ratio={c.committed}
                    pressure={c.pressure}
                  />
                </div>
              </div>
              <dl className="mt-6">
                <SpecRow term={t('spec-halls', { defaultValue: 'Halls' })}>{c.halls}</SpecRow>
                <SpecRow term={t('spec-power', { defaultValue: 'Contracted power' })}>
                  {c.megawatts} MW
                </SpecRow>
                <SpecRow term={t('spec-tier', { defaultValue: 'Design standard' })}>
                  {c.tier}
                </SpecRow>
                <SpecRow term={t('spec-pue', { defaultValue: 'PUE (TTM)' })}>
                  {c.pue.toFixed(2)}
                </SpecRow>
                <SpecRow term={t('spec-cooling', { defaultValue: 'Cooling' })}>
                  {copy.cooling}
                </SpecRow>
                <SpecRow term={t('spec-certs', { defaultValue: 'Attestations' })}>
                  {c.certs}
                </SpecRow>
                <SpecRow term={t('spec-access', { defaultValue: 'Access' })}>
                  {t('spec-access-value', {
                    defaultValue:
                      'Five layers, mantrap, biometric at the cage, escorted remote hands 24/7',
                  })}
                </SpecRow>
              </dl>
            </section>
          );
        })}

        <section>
          <SectionHeading
            kicker={t('fac-sec-kicker', { defaultValue: 'Getting in' })}
            heading={t('fac-sec-heading', {
              defaultValue: 'Five layers between the road and your cage',
            })}
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              [
                'L1 · L2',
                t('sec-perimeter-name', { defaultValue: 'Perimeter and lobby' }),
                t('sec-perimeter-desc', {
                  defaultValue:
                    'Anti-ram fencing, vehicle traps and a staffed lobby where every visit is against a named ticket raised at least 24 hours ahead.',
                }),
              ],
              [
                'L3',
                t('sec-mantrap-name', { defaultValue: 'Mantrap' }),
                t('sec-mantrap-desc', {
                  defaultValue:
                    'A single-occupancy interlock with weight and badge agreement — the door behind you closes before the one in front opens, and tailgating is a physical impossibility rather than a policy.',
                }),
              ],
              [
                'L4 · L5',
                t('sec-cage-name', { defaultValue: 'Hall and cage' }),
                t('sec-cage-desc', {
                  defaultValue:
                    'Biometric at the hall door and again at your cage, with a 90-day retained camera record covering every aisle and a per-cabinet electronic lock log you can export.',
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
            kicker={t('fac-cta-kicker', { defaultValue: 'Site tour' })}
            heading={t('fac-cta-heading', { defaultValue: 'Walk the hall before you sign for it' })}
          />
          <p className="mt-4 max-w-prose text-site-text-muted">
            {t('fac-cta-body', {
              defaultValue:
                'Tours run on weekday mornings at every campus, escorted by the engineer who runs that floor rather than by a salesperson.',
            })}
          </p>
          <div className="mt-6">
            <Button asChild variant="accent">
              <Link to="/rmh-datacenter/contact" search={{ intent: 'Site tour' }}>
                {t('book-a-tour', { defaultValue: 'Book a tour' })}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
