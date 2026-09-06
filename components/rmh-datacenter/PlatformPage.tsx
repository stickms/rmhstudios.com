/**
 * /rmh-datacenter/platform — the five ways to buy the building.
 *
 * Each product is an anchored section, because the home page's entry rows and
 * the footer both deep-link into one. Pricing is deliberately shaped as "what
 * the meter reads" rather than a per-month figure: every one of these is quoted
 * against a load, and a table of headline prices would be the one part of this
 * site that goes stale without anybody noticing.
 */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export default function PlatformPage() {
  const { t } = useTranslation('c-rmh-datacenter');

  return (
    <>
      <section className="pagehead">
        <div className="container pagehead-inner">
          <span className="kicker">{t('plat-kicker', { defaultValue: 'Platform' })}</span>
          <h1>{t('plat-title', { defaultValue: 'Stop caring wherever you like' })}</h1>
          <p className="lede">
            {t('plat-lede', {
              defaultValue:
                'The same halls, the same power train and the same network, sold at five different depths — from an empty cage you rack yourself to a pod of accelerators we run for you. Moving between them is a contract change, not a migration.',
            })}
          </p>
        </div>
      </section>

      <section className="sec" id="colocation">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">PL-01</div>
            <div className="sechead-body">
              <span className="kicker">
                {t('plat-colo-kicker', { defaultValue: 'Colocation' })}
              </span>
              <h2>{t('plat-colo-heading', { defaultValue: 'Your hardware, our floor' })}</h2>
              <p className="lede">
                {t('plat-colo-lede', {
                  defaultValue:
                    'Half racks, full racks and locked cages from a quarter cabinet to a private suite. Sold by drawn kilowatts rather than by rack unit, so a half-empty cabinet full of GPUs is priced honestly and a full cabinet of storage is not penalised for existing.',
                })}
              </p>
            </div>
          </div>
          <div className="tiles reveal d1">
            <div className="tile">
              <h3>{t('plat-colo-t1', { defaultValue: 'Power' })}</h3>
              <p>
                {t('plat-colo-t1-desc', {
                  defaultValue:
                    'A+B feeds from separate UPS trains and separate generators, metered per PDU and readable through the API. Standard cabinets are provisioned to 12 kW; high-density rows go to 40 kW on liquid.',
                })}
              </p>
            </div>
            <div className="tile">
              <h3>{t('plat-colo-t2', { defaultValue: 'Remote hands' })}</h3>
              <p>
                {t('plat-colo-t2-desc', {
                  defaultValue:
                    'Staffed 24/7 at every campus, with a 15-minute response commitment on a P1. Reboots, media swaps and cabling are included; anything longer than an hour is quoted before it starts.',
                })}
              </p>
            </div>
            <div className="tile">
              <h3>{t('plat-colo-t3', { defaultValue: 'Cross-connects' })}</h3>
              <p>
                {t('plat-colo-t3-desc', {
                  defaultValue:
                    'A one-time install fee and no monthly rent. Connecting to another tenant in the same building should not be an annuity, and treating it as one is why so much traffic takes a detour through an exchange.',
                })}
              </p>
            </div>
            <div className="tile">
              <h3>{t('plat-colo-t4', { defaultValue: 'Change windows' })}</h3>
              <p>
                {t('plat-colo-t4-desc', {
                  defaultValue:
                    'Published a quarter ahead, because we schedule our own platform migrations against the same calendar. Emergency work is announced within 30 minutes of the decision, not after it.',
                })}
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      <section className="sec" id="bare-metal">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">PL-02</div>
            <div className="sechead-body">
              <span className="kicker">
                {t('plat-metal-kicker', { defaultValue: 'Bare metal' })}
              </span>
              <h2>
                {t('plat-metal-heading', {
                  defaultValue: 'A whole machine, provisioned in minutes',
                })}
              </h2>
              <p className="lede">
                {t('plat-metal-lede', {
                  defaultValue:
                    'Single-tenant servers with no hypervisor between your workload and the silicon: no noisy neighbour, no steal time, and a NUMA topology that is the one on the datasheet.',
                })}
              </p>
            </div>
          </div>
          <div className="cards c3 reveal d1">
            <div className="card">
              <div className="card-idx">GP</div>
              <h3>{t('plat-metal-gp', { defaultValue: 'General purpose' })}</h3>
              <p>
                {t('plat-metal-gp-desc', {
                  defaultValue:
                    '32–192 cores, 256 GB–3 TB, dual 25G. The default for application and database tiers.',
                })}
              </p>
              <div className="card-tags">
                <span className="chip on">
                  {t('chip-minutes', { defaultValue: 'Ready in ~7 min' })}
                </span>
              </div>
            </div>
            <div className="card">
              <div className="card-idx">ST</div>
              <h3>{t('plat-metal-st', { defaultValue: 'Storage dense' })}</h3>
              <p>
                {t('plat-metal-st-desc', {
                  defaultValue:
                    'Up to 1.2 PB raw per chassis on spinning disk, or 240 TB of NVMe for hot sets.',
                })}
              </p>
              <div className="card-tags">
                <span className="chip">{t('chip-raid', { defaultValue: 'Hardware or ZFS' })}</span>
              </div>
            </div>
            <div className="card">
              <div className="card-idx">MEM</div>
              <h3>{t('plat-metal-mem', { defaultValue: 'Memory optimised' })}</h3>
              <p>
                {t('plat-metal-mem-desc', {
                  defaultValue:
                    'Up to 12 TB of RAM for in-memory databases and analytics that refuse to shard.',
                })}
              </p>
              <div className="card-tags">
                <span className="chip">{t('chip-numa', { defaultValue: 'Pinned NUMA' })}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      <section className="sec" id="accelerated">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">PL-03</div>
            <div className="sechead-body">
              <span className="kicker">
                {t('plat-gpu-kicker', { defaultValue: 'Accelerated compute' })}
              </span>
              <h2>{t('plat-gpu-heading', { defaultValue: 'Halls built for 40 kW racks' })}</h2>
              <p className="lede">
                {t('plat-gpu-lede', {
                  defaultValue:
                    'A training run does not fail because the GPUs are slow; it fails because the rack cannot dissipate them. These halls are direct-to-chip liquid cooled from the slab up, with a coolant distribution unit per row and a dry cooler loop that never touches the building chillers.',
                })}
              </p>
            </div>
          </div>
          <div className="tiles reveal d1">
            <div className="tile">
              <h3>{t('plat-gpu-t1', { defaultValue: 'By the node' })}</h3>
              <p>
                {t('plat-gpu-t1-desc', {
                  defaultValue:
                    'Eight accelerators, NVLink inside the chassis, 400G to the fabric. Hourly, or reserved for a year at roughly a third of that.',
                })}
              </p>
            </div>
            <div className="tile">
              <h3>{t('plat-gpu-t2', { defaultValue: 'By the pod' })}</h3>
              <p>
                {t('plat-gpu-t2-desc', {
                  defaultValue:
                    'Thirty-two nodes on a non-blocking rail-optimised fabric, delivered as one scheduler domain with a shared parallel filesystem.',
                })}
              </p>
            </div>
            <div className="tile">
              <h3>{t('plat-gpu-t3', { defaultValue: 'Bring your own' })}</h3>
              <p>
                {t('plat-gpu-t3-desc', {
                  defaultValue:
                    'If you already own the accelerators, we will cool them. Liquid-ready cabinets are available in Ashburn, Singapore and Frankfurt with manifolds pre-plumbed.',
                })}
              </p>
            </div>
            <div className="tile">
              <h3>{t('plat-gpu-t4', { defaultValue: 'What we will tell you first' })}</h3>
              <p>
                {t('plat-gpu-t4-desc', {
                  defaultValue:
                    'Lead time, honestly. Accelerator supply moves, and a delivery date we cannot hold is worth less to you than a slot two months out that we can.',
                })}
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      <section className="sec" id="storage">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">PL-04</div>
            <div className="sechead-body">
              <span className="kicker">{t('plat-store-kicker', { defaultValue: 'Storage' })}</span>
              <h2>
                {t('plat-store-heading', { defaultValue: 'In the same building as the compute' })}
              </h2>
              <p className="lede">
                {t('plat-store-lede', {
                  defaultValue:
                    'Block, object and archive tiers on the same floor as your servers, reachable over a cross-connect rather than the internet — which is the difference between a restore that is a scheduling problem and one that is a budget problem.',
                })}
              </p>
            </div>
          </div>
          <dl className="spec reveal d1">
            <div className="spec-row">
              <dt>{t('plat-store-block', { defaultValue: 'Block' })}</dt>
              <dd>
                {t('plat-store-block-desc', {
                  defaultValue:
                    'Triple-replicated NVMe, single-digit millisecond p99, snapshots that do not stall the writer. Attaches to bare metal and to colocated hosts alike.',
                })}
              </dd>
            </div>
            <div className="spec-row">
              <dt>{t('plat-store-object', { defaultValue: 'Object' })}</dt>
              <dd>
                {t('plat-store-object-desc', {
                  defaultValue:
                    'S3-compatible, erasure coded across three halls in a region, versioned and object-locked where a retention rule says so. No egress charge within our own network.',
                })}
              </dd>
            </div>
            <div className="spec-row">
              <dt>{t('plat-store-archive', { defaultValue: 'Archive' })}</dt>
              <dd>
                {t('plat-store-archive-desc', {
                  defaultValue:
                    'LTO in a robot library, two copies in two campuses, retrieval measured in hours and quoted before you commit. Written, verified and periodically re-read rather than assumed.',
                })}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <hr className="rule" />

      <section className="sec" id="resilience">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">PL-05</div>
            <div className="sechead-body">
              <span className="kicker">{t('plat-dr-kicker', { defaultValue: 'Resilience' })}</span>
              <h2>
                {t('plat-dr-heading', {
                  defaultValue: 'A second site, and a rehearsal you cannot skip',
                })}
              </h2>
              <p className="lede">
                {t('plat-dr-lede', {
                  defaultValue:
                    'A warm standby on a different grid interconnection and a different fibre path, replicated over the backbone at no egress cost. The contract requires two rehearsed failovers a year, because an untested plan is a document rather than a recovery.',
                })}
              </p>
            </div>
          </div>
          <div className="cards c3 reveal d1">
            <div className="card">
              <div className="card-idx">RPO</div>
              <h3>{t('plat-dr-rpo', { defaultValue: 'Down to 30 seconds' })}</h3>
              <p>
                {t('plat-dr-rpo-desc', {
                  defaultValue:
                    'Continuous block replication between campuses in the same region, or asynchronous across regions.',
                })}
              </p>
            </div>
            <div className="card">
              <div className="card-idx">RTO</div>
              <h3>{t('plat-dr-rto', { defaultValue: 'Under 15 minutes' })}</h3>
              <p>
                {t('plat-dr-rto-desc', {
                  defaultValue:
                    'Measured at the last rehearsal, not at the design review — and the report is yours.',
                })}
              </p>
            </div>
            <div className="card">
              <div className="card-idx">TEST</div>
              <h3>{t('plat-dr-test', { defaultValue: 'Twice a year' })}</h3>
              <p>
                {t('plat-dr-test-desc', {
                  defaultValue:
                    'Scheduled with you, run against production data, and written up whether or not it went well.',
                })}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="container">
          <div className="callout reveal">
            <div className="callout-body">
              <span className="kicker">{t('plat-cta-kicker', { defaultValue: 'Quoting' })}</span>
              <h2>{t('plat-cta-heading', { defaultValue: 'Send a load, get a hall' })}</h2>
              <p>
                {t('plat-cta-body', {
                  defaultValue:
                    'Kilowatts, cabinets, regions and compliance obligations. A quote comes back within two working days, with the campuses that do not fit named as well as the ones that do.',
                })}
              </p>
            </div>
            <Link className="btn btn-signal" to="/rmh-datacenter/contact">
              {t('request-capacity', { defaultValue: 'Request capacity' })}{' '}
              <span className="arw">→</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
