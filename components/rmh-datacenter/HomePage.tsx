/**
 * RMH Datacenter — the front page.
 *
 * Structure follows the order a buyer actually asks in: where is it, what can I
 * put in it, what is it plugged into, what powers it, and who do I talk to.
 * Every figure on the page is repeated as real text somewhere below the
 * decorative object that shows it, so nothing is only available as a picture.
 */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { FloorLine, Meter, RackElevation } from './shared';

export default function HomePage() {
  const { t } = useTranslation('c-rmh-datacenter');

  const platform = [
    {
      code: 'PL-01',
      sub: 'Cage · rack · half rack',
      hash: 'colocation',
      name: t('home-pl-colo-name', { defaultValue: 'Colocation' }),
      desc: t('home-pl-colo-desc', {
        defaultValue:
          'Locked cages, full racks and half racks on a raised floor, with A+B feeds, metered PDUs and your own hands on your own hardware.',
      }),
    },
    {
      code: 'PL-02',
      sub: 'Single tenant · no hypervisor',
      hash: 'bare-metal',
      name: t('home-pl-metal-name', { defaultValue: 'Bare metal' }),
      desc: t('home-pl-metal-desc', {
        defaultValue:
          'Dedicated servers provisioned in minutes, with no hypervisor between your workload and the silicon it was sized for.',
      }),
    },
    {
      code: 'PL-03',
      sub: 'Liquid cooled · 40 kW racks',
      hash: 'accelerated',
      name: t('home-pl-gpu-name', { defaultValue: 'Accelerated compute' }),
      desc: t('home-pl-gpu-desc', {
        defaultValue:
          'Direct-to-chip liquid cooled GPU halls built for training runs that would trip a 6 kW rack, sold by the node or by the pod.',
      }),
    },
    {
      code: 'PL-04',
      sub: 'Block · object · archive',
      hash: 'storage',
      name: t('home-pl-storage-name', { defaultValue: 'Storage' }),
      desc: t('home-pl-storage-desc', {
        defaultValue:
          'NVMe block, S3-compatible object and tape archive in the same building as your compute, so a restore is a cross-connect rather than an egress bill.',
      }),
    },
    {
      code: 'PL-05',
      sub: 'Second site · tested failover',
      hash: 'resilience',
      name: t('home-pl-dr-name', { defaultValue: 'Resilience' }),
      desc: t('home-pl-dr-desc', {
        defaultValue:
          'A warm second site on another grid and another fibre path, with a failover you are contractually required to rehearse twice a year.',
      }),
    },
  ];

  const campuses = [
    {
      code: 'ASH-01',
      name: t('home-campus-ash-name', { defaultValue: 'Ashburn, Virginia' }),
      desc: t('home-campus-ash-desc', {
        defaultValue:
          'The anchor campus. Four halls, 62 MW contracted, and the densest peering of the six.',
      }),
      tags: ['62 MW', 'Tier IV', 'PUE 1.09'],
    },
    {
      code: 'DUB-02',
      name: t('home-campus-dub-name', { defaultValue: 'Dublin, Ireland' }),
      desc: t('home-campus-dub-desc', {
        defaultValue:
          'The European landing point, free-cooled for most of the year and on a fully renewable supply.',
      }),
      tags: ['28 MW', 'Tier III+', '100% renewable'],
    },
    {
      code: 'SIN-01',
      name: t('home-campus-sin-name', { defaultValue: 'Singapore' }),
      desc: t('home-campus-sin-desc', {
        defaultValue:
          'The APAC hall: liquid cooled throughout, because tropical ambient makes air the expensive option.',
      }),
      tags: ['18 MW', 'Tier III+', 'Liquid cooled'],
    },
  ];

  return (
    <>
      <section className="hero">
        <RackElevation />
        <div className="container hero-content">
          <div className="hero-meta reveal">
            <span className="field">
              <b>Sites</b> · <span className="v">6</span>
            </span>
            <span className="field">
              <b>Contracted</b> · <span className="v">148 MW</span>
            </span>
            <span className="field">
              <b>Status</b> · <span className="v">All halls nominal</span>
            </span>
          </div>
          <h1>
            {t('hero-line1', { defaultValue: 'Floor space, power' })}
            <br />
            {t('hero-line2', { defaultValue: 'and a network that is' })}
            <br />
            <span className="lift">{t('hero-line3', { defaultValue: 'already there.' })}</span>
          </h1>
          <p className="lede reveal d2">
            {t('hero-lede', {
              defaultValue:
                'RMH Datacenter is the infrastructure arm of RMH Studios. We build and run the halls the rest of the group sits in — six campuses, 148 MW contracted, a private backbone between all of them — and we sell the space, the power and the cooling we did not use.',
            })}
          </p>
          <div className="hero-actions reveal d3">
            <Link className="btn btn-signal" to="/rmh-datacenter/platform">
              {t('see-the-platform', { defaultValue: 'See the platform' })}{' '}
              <span className="arw">→</span>
            </Link>
            <Link className="btn btn-outline" to="/rmh-datacenter/contact">
              {t('request-capacity', { defaultValue: 'Request capacity' })}{' '}
              <span className="arw">→</span>
            </Link>
          </div>
        </div>
      </section>

      <FloorLine />

      <section className="sec tight">
        <div className="container">
          <div className="telemetry reveal">
            <div className="cell">
              <div className="l">{t('stat-sites-label', { defaultValue: 'Campuses' })}</div>
              <div className="v">6</div>
              <div className="k">
                {t('stat-sites-desc', {
                  defaultValue: 'Owned and operated across three continents',
                })}
              </div>
            </div>
            <div className="cell">
              <div className="l">{t('stat-power-label', { defaultValue: 'Contracted' })}</div>
              <div className="v load">148 MW</div>
              <div className="k">
                {t('stat-power-desc', { defaultValue: 'Utility capacity across the estate' })}
              </div>
            </div>
            <div className="cell">
              <div className="l">{t('stat-pue-label', { defaultValue: 'Fleet PUE' })}</div>
              <div className="v">1.14</div>
              <div className="k">
                {t('stat-pue-desc', {
                  defaultValue: 'Trailing twelve months, every hall included',
                })}
              </div>
            </div>
            <div className="cell">
              <div className="l">{t('stat-uptime-label', { defaultValue: 'Committed' })}</div>
              <div className="v">99.999%</div>
              <div className="k">
                {t('stat-uptime-desc', { defaultValue: 'Power and cooling availability SLA' })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">§01</div>
            <div className="sechead-body">
              <span className="kicker">{t('s01-kicker', { defaultValue: 'The floor' })}</span>
              <h2>
                {t('s01-heading', {
                  defaultValue: 'We were the first tenant, so the hall is built like one',
                })}
              </h2>
              <p className="lede">
                {t('s01-lede', {
                  defaultValue:
                    'Most colocation is a landlord business: someone builds the shell, and the people running workloads inside it are somebody else. Every RMH hall was specified by the team that had to run a platform in it — which is why the power density, the cross-connect fees and the change-window policy all look like they were written by a tenant.',
                })}
              </p>
            </div>
          </div>
          <div className="reveal d1" style={{ maxWidth: '70ch' }}>
            <p>
              {t('s01-body', {
                defaultValue:
                  'The practical version: racks are sold at the density they can actually draw rather than a headline number, a cross-connect between two customers in the same building is a one-time fee and not a monthly rent, and maintenance windows are published a quarter ahead because we schedule our own migrations against the same calendar.',
              })}
            </p>
            <p style={{ marginTop: 24 }}>
              <Link className="btn-text" to="/rmh-datacenter/facilities">
                {t('tour-the-campuses', { defaultValue: 'Tour the campuses' })}{' '}
                <span className="arw">→</span>
              </Link>
            </p>
          </div>
        </div>
      </section>

      <hr className="rule" />

      <section className="sec">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">§02</div>
            <div className="sechead-body">
              <span className="kicker">{t('s02-kicker', { defaultValue: 'Platform' })}</span>
              <h2>
                {t('s02-heading', {
                  defaultValue: 'Five ways to take delivery of the same building',
                })}
              </h2>
              <p className="lede">
                {t('s02-lede', {
                  defaultValue:
                    'From an empty cage you rack yourself to a pod of liquid-cooled accelerators we operate for you — the same floor, the same power train, the same network, sold at whichever layer you want to stop caring at.',
                })}
              </p>
            </div>
          </div>
          <div className="reveal">
            {platform.map((p, i) => (
              <Link className="entry" to="/rmh-datacenter/platform" hash={p.hash} key={p.hash}>
                <div className="entry-key">
                  <div className="entry-code">{p.code}</div>
                  <div className="entry-sub">{p.sub}</div>
                </div>
                <div className="entry-body">
                  <h3>{p.name}</h3>
                  <p>{p.desc}</p>
                </div>
                <div className="entry-go">{String(i + 1).padStart(2, '0')} →</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <hr className="rule" />

      <section className="sec">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">§03</div>
            <div className="sechead-body">
              <span className="kicker">{t('s03-kicker', { defaultValue: 'Campuses' })}</span>
              <h2>
                {t('s03-heading', { defaultValue: 'Six sites, and none of them a leased suite' })}
              </h2>
              <p className="lede">
                {t('s03-lede', {
                  defaultValue:
                    'We own the buildings, the generators and the fibre entering them. That is the difference between a maintenance window we schedule and one we are told about.',
                })}
              </p>
            </div>
          </div>
          <div className="cards c3 reveal d1">
            {campuses.map((c) => (
              <Link
                className="card"
                to="/rmh-datacenter/facilities"
                hash={c.code.toLowerCase()}
                key={c.code}
              >
                <div className="card-idx">{c.code}</div>
                <h3>{c.name}</h3>
                <p>{c.desc}</p>
                <div className="card-tags">
                  {c.tags.map((tag) => (
                    <span className="chip" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
          <p className="reveal d2" style={{ marginTop: 28 }}>
            <Link className="btn-text" to="/rmh-datacenter/facilities">
              {t('all-six-campuses', { defaultValue: 'All six campuses' })}{' '}
              <span className="arw">→</span>
            </Link>
          </p>
        </div>
      </section>

      <hr className="rule" />

      <section className="sec">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">§04</div>
            <div className="sechead-body">
              <span className="kicker">{t('s04-kicker', { defaultValue: 'Power and heat' })}</span>
              <h2>
                {t('s04-heading', {
                  defaultValue: 'The efficiency numbers, before you ask for them',
                })}
              </h2>
              <p className="lede">
                {t('s04-lede', {
                  defaultValue:
                    'Published as trailing twelve-month figures per campus rather than a best-quarter headline, because the only PUE that means anything is the one that includes a heat wave.',
                })}
              </p>
            </div>
          </div>
          <div className="tiles reveal d1">
            <div className="tile">
              <Meter
                label={t('meter-pue-label', { defaultValue: 'Fleet PUE · target 1.10' })}
                value="1.14"
                filled={20}
                total={24}
                hotFrom={18}
              />
              <p>
                {t('meter-pue-desc', {
                  defaultValue:
                    'Total facility power divided by IT power, measured at the utility meter. Dublin runs 1.06 on free cooling; Singapore carries the fleet average up, which is what a tropical ambient costs.',
                })}
              </p>
            </div>
            <div className="tile">
              <Meter
                label={t('meter-renew-label', { defaultValue: 'Renewable supply' })}
                value="91%"
                filled={22}
                total={24}
              />
              <p>
                {t('meter-renew-desc', {
                  defaultValue:
                    'Contracted renewable energy across the estate, on power purchase agreements rather than unbundled certificates. Four of six campuses are already at 100%.',
                })}
              </p>
            </div>
          </div>
          <p className="reveal d2" style={{ marginTop: 28 }}>
            <Link className="btn-text" to="/rmh-datacenter/power">
              {t('read-the-power-file', { defaultValue: 'How the power train is built' })}{' '}
              <span className="arw">→</span>
            </Link>
          </p>
        </div>
      </section>

      <hr className="rule" />

      <section className="sec">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">§05</div>
            <div className="sechead-body">
              <span className="kicker">{t('s05-kicker', { defaultValue: 'Network' })}</span>
              <h2>
                {t('s05-heading', {
                  defaultValue: 'A private backbone, not six unrelated buildings',
                })}
              </h2>
              <p className="lede">
                {t('s05-lede', {
                  defaultValue:
                    'Every campus is on the same AS with lit fibre between them, so replication between two of our halls never touches the public internet and is not billed as egress.',
                })}
              </p>
            </div>
          </div>
          <div className="tiles reveal d1">
            <div className="tile">
              <h3>{t('net-t1-heading', { defaultValue: '400G between campuses' })}</h3>
              <p>
                {t('net-t1-desc', {
                  defaultValue:
                    'Diverse lit fibre on separate physical paths, with enough spare capacity that a cut is a latency change rather than an outage.',
                })}
              </p>
            </div>
            <div className="tile">
              <h3>{t('net-t2-heading', { defaultValue: '640+ peers' })}</h3>
              <p>
                {t('net-t2-desc', {
                  defaultValue:
                    'Settlement-free peering at the exchanges in every metro we occupy, plus four transit providers so no single one can hold a route hostage.',
                })}
              </p>
            </div>
          </div>
          <p className="reveal d2" style={{ marginTop: 28 }}>
            <Link className="btn-text" to="/rmh-datacenter/network">
              {t('see-the-latency-matrix', { defaultValue: 'See the latency matrix' })}{' '}
              <span className="arw">→</span>
            </Link>
          </p>
        </div>
      </section>

      <section className="sec">
        <div className="container">
          <div className="callout reveal">
            <div className="callout-body">
              <span className="kicker">{t('cta-kicker', { defaultValue: 'Next step' })}</span>
              <h2>
                {t('cta-heading', { defaultValue: 'Tell us the load, not the product name' })}
              </h2>
              <p>
                {t('cta-body', {
                  defaultValue:
                    'Kilowatts, cabinets, where your users are and what you have to be compliant with. We will come back with the halls that fit and the ones that do not.',
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
