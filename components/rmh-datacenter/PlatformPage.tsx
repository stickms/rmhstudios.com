/**
 * /rmh-datacenter/platform — the five ways to buy the building.
 *
 * Each product is an anchored `.glass-pane` section, because the overview's
 * rows and the ventures panel both deep-link into one. Pricing is deliberately
 * shaped as "what the meter reads" rather than a per-month figure: every one of
 * these is quoted against a load, and a table of headline prices would be the
 * one part of this section that goes stale without anybody noticing.
 */

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatacenterTabs } from './DatacenterTabs';
import { SectionHeading, SpecRow } from './parts';

export default function PlatformPage() {
  const { t } = useTranslation('c-rmh-datacenter');

  return (
    <PageLayout
      title={t('plat-title', { defaultValue: 'Platform' })}
      description={t('plat-description', {
        defaultValue: 'The same halls, sold at whichever layer you want to stop caring at.',
      })}
    >
      <DatacenterTabs active="/rmh-datacenter/platform" />

      <div className="space-y-8 px-4 pb-12">
        <section className="glass-pane rounded-site p-6 sm:p-8">
          <p className="max-w-prose text-site-text-muted">
            {t('plat-lede', {
              defaultValue:
                'The same halls, the same power train and the same network, sold at five different depths — from an empty cage you rack yourself to a pod of accelerators we run for you. Moving between them is a contract change, not a migration.',
            })}
          </p>
        </section>

        <section id="colocation" className="glass-pane rounded-site p-6 sm:p-8">
          <SectionHeading
            kicker="PL-01"
            heading={t('plat-colo-heading', {
              defaultValue: 'Colocation — your hardware, our floor',
            })}
          />
          <p className="mt-4 max-w-prose text-site-text-muted">
            {t('plat-colo-lede', {
              defaultValue:
                'Half racks, full racks and locked cages from a quarter cabinet to a private suite. Sold by drawn kilowatts rather than by rack unit, so a half-empty cabinet full of GPUs is priced honestly and a full cabinet of storage is not penalised for existing.',
            })}
          </p>
          <dl className="mt-5">
            <SpecRow term={t('plat-colo-t1', { defaultValue: 'Power' })}>
              {t('plat-colo-t1-desc', {
                defaultValue:
                  'A+B feeds from separate UPS trains and separate generators, metered per PDU and readable through the API. Standard cabinets are provisioned to 12 kW; high-density rows go to 40 kW on liquid.',
              })}
            </SpecRow>
            <SpecRow term={t('plat-colo-t2', { defaultValue: 'Remote hands' })}>
              {t('plat-colo-t2-desc', {
                defaultValue:
                  'Staffed 24/7 at every campus, with a 15-minute response commitment on a P1. Reboots, media swaps and cabling are included; anything longer than an hour is quoted before it starts.',
              })}
            </SpecRow>
            <SpecRow term={t('plat-colo-t3', { defaultValue: 'Cross-connects' })}>
              {t('plat-colo-t3-desc', {
                defaultValue:
                  'A one-time install fee and no monthly rent. Connecting to another tenant in the same building should not be an annuity, and treating it as one is why so much traffic takes a detour through an exchange.',
              })}
            </SpecRow>
            <SpecRow term={t('plat-colo-t4', { defaultValue: 'Change windows' })}>
              {t('plat-colo-t4-desc', {
                defaultValue:
                  'Published a quarter ahead, because we schedule our own platform migrations against the same calendar. Emergency work is announced within 30 minutes of the decision, not after it.',
              })}
            </SpecRow>
          </dl>
        </section>

        <section id="bare-metal" className="glass-pane rounded-site p-6 sm:p-8">
          <SectionHeading
            kicker="PL-02"
            heading={t('plat-metal-heading', {
              defaultValue: 'Bare metal — a whole machine, provisioned in minutes',
            })}
          />
          <p className="mt-4 max-w-prose text-site-text-muted">
            {t('plat-metal-lede', {
              defaultValue:
                'Single-tenant servers with no hypervisor between your workload and the silicon: no noisy neighbour, no steal time, and a NUMA topology that is the one on the datasheet.',
            })}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              [
                'GP',
                t('plat-metal-gp', { defaultValue: 'General purpose' }),
                t('plat-metal-gp-desc', {
                  defaultValue:
                    '32–192 cores, 256 GB–3 TB, dual 25G. The default for application and database tiers.',
                }),
                t('chip-minutes', { defaultValue: 'Ready in ~7 min' }),
              ],
              [
                'ST',
                t('plat-metal-st', { defaultValue: 'Storage dense' }),
                t('plat-metal-st-desc', {
                  defaultValue:
                    'Up to 1.2 PB raw per chassis on spinning disk, or 240 TB of NVMe for hot sets.',
                }),
                t('chip-raid', { defaultValue: 'Hardware or ZFS' }),
              ],
              [
                'MEM',
                t('plat-metal-mem', { defaultValue: 'Memory optimised' }),
                t('plat-metal-mem-desc', {
                  defaultValue:
                    'Up to 12 TB of RAM for in-memory databases and analytics that refuse to shard.',
                }),
                t('chip-numa', { defaultValue: 'Pinned NUMA' }),
              ],
            ].map(([code, name, desc, chip]) => (
              <Card key={code} className="flex flex-col items-start gap-2 p-5">
                <span className="text-xs font-medium tracking-wide text-site-accent uppercase">
                  {code}
                </span>
                <h3 className="font-display text-lg font-semibold text-site-text">{name}</h3>
                <p className="text-sm text-site-text-muted">{desc}</p>
                <Badge variant="outline">{chip}</Badge>
              </Card>
            ))}
          </div>
        </section>

        <section id="accelerated" className="glass-pane rounded-site p-6 sm:p-8">
          <SectionHeading
            kicker="PL-03"
            heading={t('plat-gpu-heading', {
              defaultValue: 'Accelerated compute — halls built for 40 kW racks',
            })}
          />
          <p className="mt-4 max-w-prose text-site-text-muted">
            {t('plat-gpu-lede', {
              defaultValue:
                'A training run does not fail because the GPUs are slow; it fails because the rack cannot dissipate them. These halls are direct-to-chip liquid cooled from the slab up, with a coolant distribution unit per row and a dry cooler loop that never touches the building chillers.',
            })}
          </p>
          <dl className="mt-5">
            <SpecRow term={t('plat-gpu-t1', { defaultValue: 'By the node' })}>
              {t('plat-gpu-t1-desc', {
                defaultValue:
                  'Eight accelerators, NVLink inside the chassis, 400G to the fabric. Hourly, or reserved for a year at roughly a third of that.',
              })}
            </SpecRow>
            <SpecRow term={t('plat-gpu-t2', { defaultValue: 'By the pod' })}>
              {t('plat-gpu-t2-desc', {
                defaultValue:
                  'Thirty-two nodes on a non-blocking rail-optimised fabric, delivered as one scheduler domain with a shared parallel filesystem.',
              })}
            </SpecRow>
            <SpecRow term={t('plat-gpu-t3', { defaultValue: 'Bring your own' })}>
              {t('plat-gpu-t3-desc', {
                defaultValue:
                  'If you already own the accelerators, we will cool them. Liquid-ready cabinets are available in Ashburn, Singapore and Frankfurt with manifolds pre-plumbed.',
              })}
            </SpecRow>
            <SpecRow term={t('plat-gpu-t4', { defaultValue: 'What we tell you first' })}>
              {t('plat-gpu-t4-desc', {
                defaultValue:
                  'Lead time, honestly. Accelerator supply moves, and a delivery date we cannot hold is worth less to you than a slot two months out that we can.',
              })}
            </SpecRow>
          </dl>
        </section>

        <section id="storage" className="glass-pane rounded-site p-6 sm:p-8">
          <SectionHeading
            kicker="PL-04"
            heading={t('plat-store-heading', {
              defaultValue: 'Storage — in the same building as the compute',
            })}
          />
          <p className="mt-4 max-w-prose text-site-text-muted">
            {t('plat-store-lede', {
              defaultValue:
                'Block, object and archive tiers on the same floor as your servers, reachable over a cross-connect rather than the internet — which is the difference between a restore that is a scheduling problem and one that is a budget problem.',
            })}
          </p>
          <dl className="mt-5">
            <SpecRow term={t('plat-store-block', { defaultValue: 'Block' })}>
              {t('plat-store-block-desc', {
                defaultValue:
                  'Triple-replicated NVMe, single-digit millisecond p99, snapshots that do not stall the writer. Attaches to bare metal and to colocated hosts alike.',
              })}
            </SpecRow>
            <SpecRow term={t('plat-store-object', { defaultValue: 'Object' })}>
              {t('plat-store-object-desc', {
                defaultValue:
                  'S3-compatible, erasure coded across three halls in a region, versioned and object-locked where a retention rule says so. No egress charge within our own network.',
              })}
            </SpecRow>
            <SpecRow term={t('plat-store-archive', { defaultValue: 'Archive' })}>
              {t('plat-store-archive-desc', {
                defaultValue:
                  'LTO in a robot library, two copies in two campuses, retrieval measured in hours and quoted before you commit. Written, verified and periodically re-read rather than assumed.',
              })}
            </SpecRow>
          </dl>
        </section>

        <section id="resilience" className="glass-pane rounded-site p-6 sm:p-8">
          <SectionHeading
            kicker="PL-05"
            heading={t('plat-dr-heading', {
              defaultValue: 'Resilience — a second site, and a rehearsal you cannot skip',
            })}
          />
          <p className="mt-4 max-w-prose text-site-text-muted">
            {t('plat-dr-lede', {
              defaultValue:
                'A warm standby on a different grid interconnection and a different fibre path, replicated over the backbone at no egress cost. The contract requires two rehearsed failovers a year, because an untested plan is a document rather than a recovery.',
            })}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              [
                'RPO',
                t('plat-dr-rpo', { defaultValue: 'Down to 30 seconds' }),
                t('plat-dr-rpo-desc', {
                  defaultValue:
                    'Continuous block replication between campuses in the same region, or asynchronous across regions.',
                }),
              ],
              [
                'RTO',
                t('plat-dr-rto', { defaultValue: 'Under 15 minutes' }),
                t('plat-dr-rto-desc', {
                  defaultValue:
                    'Measured at the last rehearsal, not at the design review — and the report is yours.',
                }),
              ],
              [
                'TEST',
                t('plat-dr-test', { defaultValue: 'Twice a year' }),
                t('plat-dr-test-desc', {
                  defaultValue:
                    'Scheduled with you, run against production data, and written up whether or not it went well.',
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
            kicker={t('plat-cta-kicker', { defaultValue: 'Quoting' })}
            heading={t('plat-cta-heading', { defaultValue: 'Send a load, get a hall' })}
          />
          <p className="mt-4 max-w-prose text-site-text-muted">
            {t('plat-cta-body', {
              defaultValue:
                'Kilowatts, cabinets, regions and compliance obligations. A quote comes back within two working days, with the campuses that do not fit named as well as the ones that do.',
            })}
          </p>
          <div className="mt-6">
            <Button asChild variant="accent">
              <Link to="/rmh-datacenter/contact">
                {t('request-capacity', { defaultValue: 'Request capacity' })}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
