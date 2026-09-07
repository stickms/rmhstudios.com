/**
 * /rmh-datacenter/network — the backbone, the peering and the latency matrix.
 *
 * The matrix is a real `<table>` with a caption, a header row and row headers,
 * rather than a grid of divs: it is tabular data, a screen reader announcing
 * "ASH-01 to DUB-02, 68 ms" is the entire point of it, and the horizontal
 * overflow is handled by the wrapper so the page column never scrolls sideways.
 * Its ink is `--site-*`, so it looks like every other table on the site.
 */

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CAMPUSES } from '@/lib/datacenter/campuses';
import { DatacenterTabs } from './DatacenterTabs';
import { SectionHeading, SpecRow, Stat } from './parts';

/**
 * Round-trip milliseconds between campuses over the private backbone.
 * Symmetric by construction — one triangle, mirrored — so the two halves can
 * never disagree the way a hand-typed 6×6 grid eventually does.
 */
const RTT: Record<string, number> = {
  'ASH-01|PDX-01': 61,
  'ASH-01|DUB-02': 68,
  'ASH-01|FRA-03': 82,
  'ASH-01|SIN-01': 214,
  'ASH-01|GRU-01': 118,
  'PDX-01|DUB-02': 128,
  'PDX-01|FRA-03': 142,
  'PDX-01|SIN-01': 168,
  'PDX-01|GRU-01': 176,
  'DUB-02|FRA-03': 21,
  'DUB-02|SIN-01': 186,
  'DUB-02|GRU-01': 174,
  'FRA-03|SIN-01': 162,
  'FRA-03|GRU-01': 196,
  'SIN-01|GRU-01': 328,
};

function rtt(a: string, b: string): number | null {
  if (a === b) return null;
  return RTT[`${a}|${b}`] ?? RTT[`${b}|${a}`] ?? null;
}

export default function NetworkPage() {
  const { t } = useTranslation('c-rmh-datacenter');
  const sites = CAMPUSES.map((c) => c.code);

  return (
    <PageLayout
      title={t('net-title', { defaultValue: 'Network' })}
      description={t('net-description', {
        defaultValue: 'One autonomous system across six campuses, and the latency between them.',
      })}
    >
      <DatacenterTabs active="/rmh-datacenter/network" />

      <div className="space-y-8 px-4 pb-12">
        <section className="glass-pane rounded-site p-6 sm:p-8">
          <p className="max-w-prose text-site-text-muted">
            {t('net-lede', {
              defaultValue:
                'The campuses are not six unrelated facilities that happen to share a logo. They sit on one autonomous system with lit fibre between them, so traffic between two RMH halls never touches the public internet and is never billed as egress.',
            })}
          </p>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label={t('net-stat-backbone', { defaultValue: 'Backbone' })}
            value="400G"
            note={t('net-stat-backbone-desc', { defaultValue: 'Between campuses, diverse paths' })}
          />
          <Stat
            label={t('net-stat-peers', { defaultValue: 'Peers' })}
            value="640+"
            note={t('net-stat-peers-desc', { defaultValue: 'Settlement-free, nine exchanges' })}
          />
          <Stat
            label={t('net-stat-transit', { defaultValue: 'Transit' })}
            value="4"
            note={t('net-stat-transit-desc', { defaultValue: 'Providers, so none holds a route' })}
          />
          <Stat
            label={t('net-stat-scrub', { defaultValue: 'Scrubbing' })}
            value="18 Tbps"
            note={t('net-stat-scrub-desc', { defaultValue: 'Mitigation capacity, always on' })}
            tone="load"
          />
        </div>

        <section className="glass-pane rounded-site p-6 sm:p-8">
          <SectionHeading
            kicker={t('net-s1-kicker', { defaultValue: 'Latency' })}
            heading={t('net-s1-heading', {
              defaultValue: 'The matrix, measured rather than modelled',
            })}
          />
          <p className="mt-4 max-w-prose text-site-text-muted">
            {t('net-s1-lede', {
              defaultValue:
                'Median round trip between campuses over the backbone, sampled every minute for the last ninety days. These are the numbers a replication design should be built against — not great-circle distance divided by the speed of light in glass.',
            })}
          </p>
          <div className="mt-5 overflow-x-auto rounded-site border border-site-border">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <caption className="border-b border-site-border p-3 text-left text-xs tracking-wide text-site-text-dim uppercase">
                {t('net-matrix-caption', {
                  defaultValue: 'Median round-trip time, milliseconds · 90-day sample',
                })}
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="border-b border-site-border p-3 text-left text-xs tracking-wide text-site-accent uppercase"
                  >
                    {t('net-matrix-from', { defaultValue: 'From' })}
                  </th>
                  {sites.map((s) => (
                    <th
                      key={s}
                      scope="col"
                      className="border-b border-site-border p-3 text-right text-xs tracking-wide text-site-accent uppercase"
                    >
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sites.map((from) => (
                  <tr key={from}>
                    <th
                      scope="row"
                      className="border-b border-site-border p-3 text-left font-medium text-site-text last:border-b-0"
                    >
                      {from}
                    </th>
                    {sites.map((to) => {
                      const ms = rtt(from, to);
                      return (
                        <td
                          key={to}
                          className={
                            ms === null
                              ? 'border-b border-site-border p-3 text-right text-site-text-dim'
                              : 'border-b border-site-border p-3 text-right tabular-nums text-site-text-muted'
                          }
                        >
                          {ms === null ? '—' : ms}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <SectionHeading
            kicker={t('net-s2-kicker', { defaultValue: 'Connectivity' })}
            heading={t('net-s2-heading', {
              defaultValue: 'How traffic actually leaves the building',
            })}
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              [
                'NT-01',
                t('net-c1-name', { defaultValue: 'Blended IP transit' }),
                t('net-c1-desc', {
                  defaultValue:
                    'Four upstreams and 640+ settlement-free peers, blended by a route optimiser that prefers the shortest measured path rather than the cheapest one. Commit by the gigabit, burst to 95th percentile.',
                }),
              ],
              [
                'NT-02',
                t('net-c2-name', { defaultValue: 'Cloud on-ramps' }),
                t('net-c2-desc', {
                  defaultValue:
                    'Direct private circuits into the major public clouds from every campus, provisioned in a day, so a hybrid estate is a VLAN rather than a VPN over the open internet.',
                }),
              ],
              [
                'NT-03',
                t('net-c3-name', { defaultValue: 'Cross-connects' }),
                t('net-c3-desc', {
                  defaultValue:
                    'Single-mode fibre to any other tenant or carrier in the building for a one-time install fee. No recurring rent, and the patch is documented in your portal with both ends named.',
                }),
              ],
              [
                'NT-04',
                t('net-c4-name', { defaultValue: 'Bring your own AS' }),
                t('net-c4-desc', {
                  defaultValue:
                    'Announce your own prefixes over our ports, or land your own carriers in your own cage. Buying space here does not oblige you to buy bandwidth here.',
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
            kicker={t('net-s3-kicker', { defaultValue: 'Under attack' })}
            heading={t('net-s3-heading', {
              defaultValue: 'Mitigation that is on before the page loads',
            })}
          />
          <p className="mt-4 max-w-prose text-site-text-muted">
            {t('net-s3-lede', {
              defaultValue:
                'Volumetric scrubbing is always in path rather than triggered by a support ticket, because a mitigation that starts after a human notices has already missed the first four minutes.',
            })}
          </p>
          <dl className="mt-5">
            <SpecRow term={t('net-ddos-capacity', { defaultValue: 'Capacity' })}>
              {t('net-ddos-capacity-desc', {
                defaultValue:
                  '18 Tbps of scrubbing across six centres, sized against the largest attack seen on the internet rather than the largest we have taken.',
              })}
            </SpecRow>
            <SpecRow term={t('net-ddos-detect', { defaultValue: 'Detection' })}>
              {t('net-ddos-detect-desc', {
                defaultValue:
                  'Flow telemetry sampled at every border, with automatic diversion inside 10 seconds of a signature crossing threshold.',
              })}
            </SpecRow>
            <SpecRow term={t('net-ddos-l7', { defaultValue: 'Application layer' })}>
              {t('net-ddos-l7-desc', {
                defaultValue:
                  'Optional reverse proxy with rate limiting and bot scoring, for the attacks that arrive as valid requests at a plausible rate.',
              })}
            </SpecRow>
            <SpecRow term={t('net-ddos-report', { defaultValue: 'Afterwards' })}>
              {t('net-ddos-report-desc', {
                defaultValue:
                  'A written incident report within one working day, including what got through, not only what was stopped.',
              })}
            </SpecRow>
          </dl>
        </section>

        <section className="glass-pane rounded-site p-6 sm:p-8">
          <SectionHeading
            kicker={t('net-cta-kicker', { defaultValue: 'Peering' })}
            heading={t('net-cta-heading', { defaultValue: 'Open peering policy' })}
          />
          <p className="mt-4 max-w-prose text-site-text-muted">
            {t('net-cta-body', {
              defaultValue:
                'We peer with anyone at any exchange we are on, with no ratio requirement and no minimum traffic. Send a note and a PeeringDB entry and it will be up within a week.',
            })}
          </p>
          <div className="mt-6">
            <Button asChild variant="accent">
              <Link to="/rmh-datacenter/contact" search={{ intent: 'Peering' }}>
                {t('net-cta-button', { defaultValue: 'Ask about peering' })}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
