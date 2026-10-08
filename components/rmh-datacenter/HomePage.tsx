/**
 * RMH Datacenter — the overview.
 *
 * On the site's own design language: `PageLayout`, the shared tab strip, and
 * glass by role (`Card` for repeated content, `.glass-pane` for the singular
 * panels). The section shipped first as a microsite with its own palette,
 * typography and chrome; that was a second design system inside one product,
 * and every figure on it had to be re-styled to say what a figure says
 * everywhere else. The numbers now come from `--site-*` like every other number
 * on the site: accent for health, warning for load and heat.
 *
 * Every figure is derived from `lib/datacenter/campuses.ts` rather than typed
 * into the copy, so the front page and the per-campus tables cannot disagree.
 */

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CAMPUSES, FLEET_PUE, TOTAL_MW } from '@/lib/datacenter/campuses';
import { CapacityMeter } from './CapacityMeter';
import { DatacenterTabs } from './DatacenterTabs';
import { HallDiagram } from './HallDiagram';
import { useCampusNames } from './useCampusNames';
import { Stat, SectionHeading } from './parts';

export default function HomePage() {
  const { t } = useTranslation('c-rmh-datacenter');
  const names = useCampusNames();
  const anchor = CAMPUSES[0];

  const platform: { code: string; name: string; desc: string; hash: string }[] = [
    {
      code: 'PL-01',
      hash: 'colocation',
      name: t('home-pl-colo-name', { defaultValue: 'Colocation' }),
      desc: t('home-pl-colo-desc', {
        defaultValue:
          'Locked cages, full racks and half racks on a raised floor, with A+B feeds, metered PDUs and your own hands on your own hardware.',
      }),
    },
    {
      code: 'PL-02',
      hash: 'bare-metal',
      name: t('home-pl-metal-name', { defaultValue: 'Bare metal' }),
      desc: t('home-pl-metal-desc', {
        defaultValue:
          'Dedicated servers provisioned in minutes, with no hypervisor between your workload and the silicon it was sized for.',
      }),
    },
    {
      code: 'PL-03',
      hash: 'accelerated',
      name: t('home-pl-gpu-name', { defaultValue: 'Accelerated compute' }),
      desc: t('home-pl-gpu-desc', {
        defaultValue:
          'Direct-to-chip liquid cooled GPU halls built for training runs that would trip a 6 kW rack, sold by the node or by the pod.',
      }),
    },
    {
      code: 'PL-04',
      hash: 'storage',
      name: t('home-pl-storage-name', { defaultValue: 'Storage' }),
      desc: t('home-pl-storage-desc', {
        defaultValue:
          'NVMe block, S3-compatible object and tape archive in the same building as your compute, so a restore is a cross-connect rather than an egress bill.',
      }),
    },
    {
      code: 'PL-05',
      hash: 'resilience',
      name: t('home-pl-dr-name', { defaultValue: 'Resilience' }),
      desc: t('home-pl-dr-desc', {
        defaultValue:
          'A warm second site on another grid and another fibre path, with a failover you are contractually required to rehearse twice a year.',
      }),
    },
  ];

  return (
    <PageLayout
      title={t('page-title', { defaultValue: 'RMH Datacenter' })}
      description={t('page-description', {
        defaultValue: 'The infrastructure arm — floor space, power and the network already in it.',
      })}
    >
      <DatacenterTabs active="/rmh-datacenter" />

      <div className="space-y-8 px-4 pb-12">
        <section className="glass-pane rounded-site p-6 sm:p-8">
          <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
            <div className="min-w-0">
              <h2 className="font-display text-3xl leading-tight font-semibold tracking-[-0.02em] text-site-text sm:text-4xl">
                {t('hero-heading', {
                  defaultValue: 'Floor space, power and a network that is already there.',
                })}
              </h2>
              <p className="mt-4 max-w-prose text-site-text-muted">
                {t('hero-lede', {
                  defaultValue:
                    'RMH Datacenter is the infrastructure arm of RMH Studios. We build and run the halls the rest of the group sits in — six owned campuses, a private backbone between all of them — and we sell the space, the power and the cooling we did not use.',
                })}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild variant="accent">
                  <Link to="/rmh-datacenter/platform">
                    {t('see-the-platform', { defaultValue: 'See the platform' })}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/rmh-datacenter/contact">
                    {t('request-capacity', { defaultValue: 'Request capacity' })}
                  </Link>
                </Button>
              </div>
            </div>
            <div className="min-w-0 text-site-accent">
              <HallDiagram
                spec={anchor.hall}
                className="w-full"
                label={t('hero-hall-label', {
                  defaultValue:
                    'A wireframe of an RMH hall: one closed surface, ribbed by bay and drawn from a fixed three-quarter view.',
                })}
              />
              <p className="mt-3 text-center text-xs text-site-text-dim">
                {t('hero-hall-caption', {
                  defaultValue: '{{code}} · {{length}} m × {{width}} m × {{height}} m',
                  code: anchor.code,
                  length: anchor.hall.length,
                  width: anchor.hall.width,
                  height: anchor.hall.height,
                })}
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label={t('stat-sites-label', { defaultValue: 'Campuses' })}
            value={String(CAMPUSES.length)}
            note={t('stat-sites-desc', { defaultValue: 'Owned and operated, three continents' })}
          />
          <Stat
            label={t('stat-power-label', { defaultValue: 'Contracted' })}
            value={`${TOTAL_MW} MW`}
            note={t('stat-power-desc', { defaultValue: 'Utility capacity across the estate' })}
            tone="load"
          />
          <Stat
            label={t('stat-pue-label', { defaultValue: 'Fleet PUE' })}
            value={FLEET_PUE.toFixed(2)}
            note={t('stat-pue-desc', { defaultValue: 'Trailing twelve months, weighted by load' })}
          />
          <Stat
            label={t('stat-uptime-label', { defaultValue: 'Committed' })}
            value="99.999%"
            note={t('stat-uptime-desc', { defaultValue: 'Power and cooling availability SLA' })}
          />
        </div>

        <section className="glass-pane rounded-site p-6 sm:p-8">
          <SectionHeading
            kicker={t('s01-kicker', { defaultValue: 'The floor' })}
            heading={t('s01-heading', {
              defaultValue: 'We were the first tenant, so the hall is built like one',
            })}
          />
          <p className="mt-4 max-w-prose text-site-text-muted">
            {t('s01-lede', {
              defaultValue:
                'Most colocation is a landlord business: someone builds the shell, and the people running workloads inside it are somebody else. Every RMH hall was specified by the team that had to run a platform in it — which is why the power density, the cross-connect fees and the change-window policy all look like they were written by a tenant.',
            })}
          </p>
          <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {[
              ['s01-f1', 'Racks sold at the density they can actually draw'],
              ['s01-f2', 'Cross-connects are a one-time fee, never a monthly rent'],
              ['s01-f3', 'Maintenance windows published a quarter ahead'],
              ['s01-f4', 'The same change calendar we schedule our own migrations against'],
            ].map(([key, dflt]) => (
              <li key={key} className="u-reveal-soft flex items-start gap-2 text-sm text-site-text">
                <Check className="mt-0.5 size-4 shrink-0 text-site-accent" aria-hidden />
                <span>{t(key, { defaultValue: dflt })}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionHeading
            kicker={t('s02-kicker', { defaultValue: 'Platform' })}
            heading={t('s02-heading', {
              defaultValue: 'Five ways to take delivery of the same building',
            })}
          />
          <div className="mt-5 grid gap-3">
            {platform.map((p) => (
              <Card key={p.hash} interactive className="p-0">
                <Link
                  to="/rmh-datacenter/platform"
                  hash={p.hash}
                  className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:gap-6"
                >
                  <span className="w-20 shrink-0 text-xs font-medium tracking-wide text-site-accent uppercase">
                    {p.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-lg font-semibold text-site-text">
                      {p.name}
                    </span>
                    <span className="mt-1 block text-sm text-site-text-muted">{p.desc}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-site-text-dim" aria-hidden />
                </Link>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <SectionHeading
            kicker={t('s03-kicker', { defaultValue: 'Campuses' })}
            heading={t('s03-heading', {
              defaultValue: 'Six sites, and none of them a leased suite',
            })}
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CAMPUSES.slice(0, 3).map((c) => (
              <Card key={c.id} interactive className="p-0">
                <Link
                  to="/rmh-datacenter/facilities"
                  hash={c.id}
                  className="flex flex-col gap-3 p-5"
                >
                  <span className="text-site-accent">
                    <HallDiagram spec={c.hall} className="h-20 w-full" label="" />
                  </span>
                  <span className="text-xs font-medium tracking-wide text-site-accent uppercase">
                    {c.code} · {c.region}
                  </span>
                  <span className="font-display text-lg font-semibold text-site-text">
                    {names[c.id]}
                  </span>
                  <CapacityMeter
                    label={t('meter-committed', { defaultValue: 'Committed' })}
                    value={`${Math.round(c.committed * 100)}%`}
                    ratio={c.committed}
                    pressure={c.pressure}
                  />
                </Link>
              </Card>
            ))}
          </div>
          <div className="mt-5">
            <Button asChild variant="accent-outline">
              <Link to="/rmh-datacenter/facilities">
                {t('all-six-campuses', { defaultValue: 'All six campuses' })}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </section>

        <section className="glass-pane rounded-site p-6 sm:p-8">
          <SectionHeading
            kicker={t('cta-kicker', { defaultValue: 'Next step' })}
            heading={t('cta-heading', { defaultValue: 'Tell us the load, not the product name' })}
          />
          <p className="mt-4 max-w-prose text-site-text-muted">
            {t('cta-body', {
              defaultValue:
                'Kilowatts, cabinets, where your users are and what you have to be compliant with. We will come back with the halls that fit and the ones that do not.',
            })}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="accent">
              <Link to="/rmh-datacenter/contact">
                {t('request-capacity', { defaultValue: 'Request capacity' })}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/rmh-datacenter/power">
                {t('read-the-power-file', { defaultValue: 'How the power train is built' })}
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
