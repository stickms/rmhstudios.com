/**
 * /rmh-datacenter/facilities — the estate, campus by campus.
 *
 * Each campus is an anchored section so the home page's cards and the footer
 * can link straight to one. The build data is a plain array rather than six
 * hand-written blocks, because six near-identical blocks is how one of them
 * ends up missing its certification row.
 */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Meter } from './shared';

interface Campus {
  id: string;
  code: string;
  name: string;
  region: string;
  halls: string;
  power: string;
  tier: string;
  pue: string;
  cooling: string;
  certs: string;
  /** Lit units out of 24 in the capacity meter, and where the meter turns hot. */
  sold: number;
  hotFrom?: number;
  soldLabel: string;
  desc: string;
}

export default function FacilitiesPage() {
  const { t } = useTranslation('c-rmh-datacenter');

  const campuses: Campus[] = [
    {
      id: 'ash-01',
      code: 'ASH-01',
      name: t('fac-ash-name', { defaultValue: 'Ashburn, Virginia' }),
      region: 'us-east',
      halls: '4',
      power: '62 MW',
      tier: 'Tier IV',
      pue: '1.09',
      cooling: t('fac-ash-cooling', { defaultValue: 'Rear-door heat exchangers, N+2 chillers' }),
      certs: 'SOC 2 Type II · ISO 27001 · PCI DSS · HIPAA',
      sold: 21,
      hotFrom: 19,
      soldLabel: '87% committed',
      desc: t('fac-ash-desc', {
        defaultValue:
          'The anchor campus, and the one the rest of the estate is measured against. Four halls on a 62 MW utility feed, two substations on separate transmission paths, and the densest peering fabric we touch anywhere — fourteen carriers enter the building through two diverse conduits.',
      }),
    },
    {
      id: 'dub-02',
      code: 'DUB-02',
      name: t('fac-dub-name', { defaultValue: 'Dublin, Ireland' }),
      region: 'eu-west',
      halls: '3',
      power: '28 MW',
      tier: 'Tier III+',
      pue: '1.06',
      cooling: t('fac-dub-cooling', { defaultValue: 'Indirect free cooling, 8,400 h/year' }),
      certs: 'SOC 2 Type II · ISO 27001 · ISO 50001 · GDPR',
      sold: 17,
      soldLabel: '71% committed',
      desc: t('fac-dub-desc', {
        defaultValue:
          'The European landing point and the most efficient hall we run: Irish ambient means indirect free cooling for all but a few hundred hours a year, and the supply is 100% renewable on a fifteen-year wind PPA. Data stays in the EU by contract as well as by geography.',
      }),
    },
    {
      id: 'sin-01',
      code: 'SIN-01',
      name: t('fac-sin-name', { defaultValue: 'Singapore' }),
      region: 'ap-southeast',
      halls: '2',
      power: '18 MW',
      tier: 'Tier III+',
      pue: '1.28',
      cooling: t('fac-sin-cooling', { defaultValue: 'Direct-to-chip liquid, 40 kW racks' }),
      certs: 'SOC 2 Type II · ISO 27001 · MTCS Level 3',
      sold: 20,
      hotFrom: 18,
      soldLabel: '84% committed',
      desc: t('fac-sin-desc', {
        defaultValue:
          'The APAC hall, liquid cooled end to end because at 30 °C ambient with 80% humidity air is the expensive coolant. It carries the worst PUE in the estate and the best watts-per-rack, which is the trade tropical density actually makes.',
      }),
    },
    {
      id: 'fra-03',
      code: 'FRA-03',
      name: t('fac-fra-name', { defaultValue: 'Frankfurt, Germany' }),
      region: 'eu-central',
      halls: '3',
      power: '22 MW',
      tier: 'Tier III+',
      pue: '1.11',
      cooling: t('fac-fra-cooling', { defaultValue: 'Adiabatic, with district heat export' }),
      certs: 'SOC 2 Type II · ISO 27001 · C5 · GDPR',
      sold: 14,
      soldLabel: '58% committed',
      desc: t('fac-fra-desc', {
        defaultValue:
          'Continental Europe’s interconnection point, and the campus that exports its waste heat: recovered water leaves the building at 42 °C into a district heating loop that serves about 1,300 homes over a winter.',
      }),
    },
    {
      id: 'pdx-01',
      code: 'PDX-01',
      name: t('fac-pdx-name', { defaultValue: 'Hillsboro, Oregon' }),
      region: 'us-west',
      halls: '2',
      power: '10 MW',
      tier: 'Tier III',
      pue: '1.10',
      cooling: t('fac-pdx-cooling', { defaultValue: 'Evaporative, WUE 0.21 L/kWh' }),
      certs: 'SOC 2 Type II · ISO 27001',
      sold: 11,
      soldLabel: '46% committed',
      desc: t('fac-pdx-desc', {
        defaultValue:
          'The west-coast site, on hydro supply and the transpacific cable landings. Smaller than the others on purpose: it exists so a US customer can hold a second copy of their estate on a different grid interconnection without leaving the country.',
      }),
    },
    {
      id: 'gru-01',
      code: 'GRU-01',
      name: t('fac-gru-name', { defaultValue: 'São Paulo, Brazil' }),
      region: 'sa-east',
      halls: '2',
      power: '8 MW',
      tier: 'Tier III',
      pue: '1.19',
      cooling: t('fac-gru-cooling', { defaultValue: 'Chilled water, N+1' }),
      certs: 'SOC 2 Type II · ISO 27001 · LGPD',
      sold: 9,
      soldLabel: '38% committed',
      desc: t('fac-gru-desc', {
        defaultValue:
          'The newest campus, opened to serve South American latency rather than to chase capacity. Two halls, room on the land for four more, and the only site in the estate where we still buy grid power on a spot contract.',
      }),
    },
  ];

  return (
    <>
      <section className="pagehead">
        <div className="container pagehead-inner">
          <span className="kicker">{t('fac-kicker', { defaultValue: 'The estate' })}</span>
          <h1>{t('fac-title', { defaultValue: 'Six campuses we own' })}</h1>
          <p className="lede">
            {t('fac-lede', {
              defaultValue:
                'Not leased suites inside somebody else’s building. We hold the freehold, the generators and the fibre entering the site, which is why a maintenance window here is one we schedule rather than one we are notified about.',
            })}
          </p>
        </div>
      </section>

      <section className="sec tight">
        <div className="container">
          <div className="telemetry reveal">
            <div className="cell">
              <div className="l">{t('fac-stat-sites', { defaultValue: 'Campuses' })}</div>
              <div className="v">6</div>
              <div className="k">
                {t('fac-stat-sites-desc', { defaultValue: 'Across three continents' })}
              </div>
            </div>
            <div className="cell">
              <div className="l">{t('fac-stat-halls', { defaultValue: 'Halls' })}</div>
              <div className="v">16</div>
              <div className="k">
                {t('fac-stat-halls-desc', { defaultValue: 'Independently powered and cooled' })}
              </div>
            </div>
            <div className="cell">
              <div className="l">{t('fac-stat-power', { defaultValue: 'Contracted' })}</div>
              <div className="v load">148 MW</div>
              <div className="k">
                {t('fac-stat-power-desc', { defaultValue: 'Utility capacity across the estate' })}
              </div>
            </div>
            <div className="cell">
              <div className="l">{t('fac-stat-expansion', { defaultValue: 'Land banked' })}</div>
              <div className="v">210 MW</div>
              <div className="k">
                {t('fac-stat-expansion-desc', { defaultValue: 'Permitted and awaiting build' })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {campuses.map((c, i) => (
        <section className="sec" id={c.id} key={c.id}>
          <div className="container">
            <div className="sechead reveal">
              <div className="secref">§{String(i + 1).padStart(2, '0')}</div>
              <div className="sechead-body">
                <span className="kicker">
                  {c.code} · {c.region}
                </span>
                <h2>{c.name}</h2>
                <p className="lede">{c.desc}</p>
              </div>
            </div>

            <div className="tiles reveal d1">
              <div className="tile">
                <dl className="spec">
                  <div className="spec-row">
                    <dt>{t('spec-halls', { defaultValue: 'Halls' })}</dt>
                    <dd>{c.halls}</dd>
                  </div>
                  <div className="spec-row">
                    <dt>{t('spec-power', { defaultValue: 'Contracted power' })}</dt>
                    <dd>{c.power}</dd>
                  </div>
                  <div className="spec-row">
                    <dt>{t('spec-tier', { defaultValue: 'Design standard' })}</dt>
                    <dd>{c.tier}</dd>
                  </div>
                  <div className="spec-row">
                    <dt>{t('spec-pue', { defaultValue: 'PUE (TTM)' })}</dt>
                    <dd>{c.pue}</dd>
                  </div>
                </dl>
              </div>
              <div className="tile">
                <dl className="spec">
                  <div className="spec-row">
                    <dt>{t('spec-cooling', { defaultValue: 'Cooling' })}</dt>
                    <dd>{c.cooling}</dd>
                  </div>
                  <div className="spec-row">
                    <dt>{t('spec-certs', { defaultValue: 'Attestations' })}</dt>
                    <dd>{c.certs}</dd>
                  </div>
                  <div className="spec-row">
                    <dt>{t('spec-access', { defaultValue: 'Access' })}</dt>
                    <dd>
                      {t('spec-access-value', {
                        defaultValue:
                          'Five layers, mantrap, biometric at the cage, escorted remote hands 24/7',
                      })}
                    </dd>
                  </div>
                </dl>
                <div style={{ marginTop: 8 }}>
                  <Meter
                    label={t('spec-capacity', { defaultValue: 'Committed capacity' })}
                    value={c.soldLabel}
                    filled={c.sold}
                    hotFrom={c.hotFrom}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      ))}

      <hr className="rule" />

      <section className="sec">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">§07</div>
            <div className="sechead-body">
              <span className="kicker">{t('fac-sec-kicker', { defaultValue: 'Getting in' })}</span>
              <h2>
                {t('fac-sec-heading', {
                  defaultValue: 'Five layers between the road and your cage',
                })}
              </h2>
              <p className="lede">
                {t('fac-sec-lede', {
                  defaultValue:
                    'Physical security is the part of a datacenter tour people photograph, so it is worth stating plainly what the layers actually are rather than counting cameras.',
                })}
              </p>
            </div>
          </div>
          <div className="cards c3 reveal d1">
            <div className="card">
              <div className="card-idx">L1 · L2</div>
              <h3>{t('sec-perimeter-name', { defaultValue: 'Perimeter and lobby' })}</h3>
              <p>
                {t('sec-perimeter-desc', {
                  defaultValue:
                    'Anti-ram fencing, vehicle traps and a staffed lobby where every visit is against a named ticket raised at least 24 hours ahead.',
                })}
              </p>
            </div>
            <div className="card">
              <div className="card-idx">L3</div>
              <h3>{t('sec-mantrap-name', { defaultValue: 'Mantrap' })}</h3>
              <p>
                {t('sec-mantrap-desc', {
                  defaultValue:
                    'A single-occupancy interlock with weight and badge agreement — the door behind you closes before the one in front opens, and tailgating is a physical impossibility rather than a policy.',
                })}
              </p>
            </div>
            <div className="card">
              <div className="card-idx">L4 · L5</div>
              <h3>{t('sec-cage-name', { defaultValue: 'Hall and cage' })}</h3>
              <p>
                {t('sec-cage-desc', {
                  defaultValue:
                    'Biometric at the hall door and again at your cage, with a 90-day retained camera record covering every aisle and a per-cabinet electronic lock log you can export.',
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
              <span className="kicker">{t('fac-cta-kicker', { defaultValue: 'Site tour' })}</span>
              <h2>
                {t('fac-cta-heading', { defaultValue: 'Walk the hall before you sign for it' })}
              </h2>
              <p>
                {t('fac-cta-body', {
                  defaultValue:
                    'Tours run on weekday mornings at every campus, escorted by the engineer who runs that floor rather than by a salesperson.',
                })}
              </p>
            </div>
            <Link
              className="btn btn-signal"
              to="/rmh-datacenter/contact"
              search={{ intent: 'Site tour' }}
            >
              {t('book-a-tour', { defaultValue: 'Book a tour' })} <span className="arw">→</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
