/**
 * /rmh-datacenter/power — the power train, the cooling, and what happens to the
 * heat afterwards.
 *
 * The efficiency figures on this page are trailing-twelve-month per campus, and
 * the page says so in the copy rather than only in a footnote: a best-quarter
 * PUE is the number every operator publishes and the one number a buyer cannot
 * use.
 */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Meter } from './shared';

export default function PowerPage() {
  const { t } = useTranslation('c-rmh-datacenter');

  const efficiency = [
    { site: 'DUB-02', pue: '1.06', filled: 23, label: '1.06' },
    { site: 'ASH-01', pue: '1.09', filled: 22, label: '1.09' },
    { site: 'PDX-01', pue: '1.10', filled: 22, label: '1.10' },
    { site: 'FRA-03', pue: '1.11', filled: 21, label: '1.11' },
    { site: 'GRU-01', pue: '1.19', filled: 19, label: '1.19' },
    { site: 'SIN-01', pue: '1.28', filled: 16, label: '1.28', hotFrom: 14 },
  ];

  return (
    <>
      <section className="pagehead">
        <div className="container pagehead-inner">
          <span className="kicker">{t('pow-kicker', { defaultValue: 'Power and cooling' })}</span>
          <h1>{t('pow-title', { defaultValue: 'Where the watts go' })}</h1>
          <p className="lede">
            {t('pow-lede', {
              defaultValue:
                'Two utility feeds, two UPS trains, two generator plants and a cooling loop that is designed to survive losing half of itself. Everything below is a trailing twelve-month figure, which means it includes the heat waves.',
            })}
          </p>
        </div>
      </section>

      <section className="sec tight">
        <div className="container">
          <div className="telemetry reveal">
            <div className="cell">
              <div className="l">{t('pow-stat-pue', { defaultValue: 'Fleet PUE' })}</div>
              <div className="v">1.14</div>
              <div className="k">
                {t('pow-stat-pue-desc', { defaultValue: 'Trailing twelve months, all halls' })}
              </div>
            </div>
            <div className="cell">
              <div className="l">{t('pow-stat-renew', { defaultValue: 'Renewable' })}</div>
              <div className="v">91%</div>
              <div className="k">
                {t('pow-stat-renew-desc', { defaultValue: 'On PPAs, not unbundled certificates' })}
              </div>
            </div>
            <div className="cell">
              <div className="l">{t('pow-stat-wue', { defaultValue: 'Fleet WUE' })}</div>
              <div className="v load">0.31</div>
              <div className="k">
                {t('pow-stat-wue-desc', { defaultValue: 'Litres of water per kWh of IT load' })}
              </div>
            </div>
            <div className="cell">
              <div className="l">{t('pow-stat-heat', { defaultValue: 'Heat exported' })}</div>
              <div className="v">14 GWh</div>
              <div className="k">
                {t('pow-stat-heat-desc', {
                  defaultValue: 'Into district heating, last twelve months',
                })}
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
              <span className="kicker">{t('pow-s1-kicker', { defaultValue: 'The train' })}</span>
              <h2>{t('pow-s1-heading', { defaultValue: 'From the substation to the PDU' })}</h2>
              <p className="lede">
                {t('pow-s1-lede', {
                  defaultValue:
                    'Every hall is fed by two independent paths from the utility to the cabinet, and each path is sized to carry the whole load on its own. Concurrent maintainability is the design goal: any component can be taken out for work with the hall still running on the other side.',
                })}
              </p>
            </div>
          </div>
          <dl className="spec reveal d1">
            <div className="spec-row">
              <dt>{t('pow-utility', { defaultValue: 'Utility' })}</dt>
              <dd>
                {t('pow-utility-desc', {
                  defaultValue:
                    'Two feeds from separate substations on separate transmission paths at the four largest campuses; a single feed with a second ring connection at the two smallest.',
                })}
              </dd>
            </div>
            <div className="spec-row">
              <dt>{t('pow-ups', { defaultValue: 'UPS' })}</dt>
              <dd>
                {t('pow-ups-desc', {
                  defaultValue:
                    'Two independent 2N lithium-ion trains per hall, each holding the full load for eight minutes — long enough for the generators, and short enough that nobody is tempted to treat the battery as a plan.',
                })}
              </dd>
            </div>
            <div className="spec-row">
              <dt>{t('pow-gen', { defaultValue: 'Generation' })}</dt>
              <dd>
                {t('pow-gen-desc', {
                  defaultValue:
                    'N+1 diesel plant with 72 hours of fuel on site and two contracted resupply routes. Started under load monthly and run to full rated output twice a year.',
                })}
              </dd>
            </div>
            <div className="spec-row">
              <dt>{t('pow-dist', { defaultValue: 'Distribution' })}</dt>
              <dd>
                {t('pow-dist-desc', {
                  defaultValue:
                    'A+B busway to every cabinet, metered per outlet, with the readings exposed in the portal and over the API at one-minute resolution.',
                })}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <hr className="rule" />

      <section className="sec">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">§02</div>
            <div className="sechead-body">
              <span className="kicker">{t('pow-s2-kicker', { defaultValue: 'Efficiency' })}</span>
              <h2>{t('pow-s2-heading', { defaultValue: 'PUE per campus, worst included' })}</h2>
              <p className="lede">
                {t('pow-s2-lede', {
                  defaultValue:
                    'Singapore is the outlier and stays on the list. A tropical hall running 40 kW cabinets on liquid will never post a Dublin number, and hiding it behind a fleet average would misrepresent both.',
                })}
              </p>
            </div>
          </div>
          <div className="tiles reveal d1">
            {efficiency.map((e) => (
              <div className="tile" key={e.site}>
                <Meter label={e.site} value={e.label} filled={e.filled} hotFrom={e.hotFrom} />
              </div>
            ))}
          </div>
          <p className="form-note reveal d2" style={{ marginTop: 20 }}>
            {t('pow-s2-note', {
              defaultValue:
                'Meter reads total facility power at the utility intake divided by IT load at the PDU, averaged over the trailing twelve months. A fuller bar is a better ratio.',
            })}
          </p>
        </div>
      </section>

      <hr className="rule" />

      <section className="sec">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">§03</div>
            <div className="sechead-body">
              <span className="kicker">{t('pow-s3-kicker', { defaultValue: 'Cooling' })}</span>
              <h2>{t('pow-s3-heading', { defaultValue: 'Three loops, chosen by climate' })}</h2>
              <p className="lede">
                {t('pow-s3-lede', {
                  defaultValue:
                    'There is no single right cooling design; there is a right one for the ambient outside the wall. Each campus was built for its own climate rather than to a group standard.',
                })}
              </p>
            </div>
          </div>
          <div className="cards c3 reveal d1">
            <div className="card">
              <div className="card-idx">C-01</div>
              <h3>{t('pow-cool-free', { defaultValue: 'Indirect free cooling' })}</h3>
              <p>
                {t('pow-cool-free-desc', {
                  defaultValue:
                    'Dublin and Hillsboro. Outside air cools a sealed internal loop through a heat exchanger, so the hall never breathes what is outside it. 8,400 usable hours a year in Dublin.',
                })}
              </p>
            </div>
            <div className="card">
              <div className="card-idx">C-02</div>
              <h3>{t('pow-cool-rdhx', { defaultValue: 'Rear-door heat exchangers' })}</h3>
              <p>
                {t('pow-cool-rdhx-desc', {
                  defaultValue:
                    'Ashburn and Frankfurt. Water at the back of the cabinet catches the heat where it is made, which keeps the hall itself at a working temperature for the people in it.',
                })}
              </p>
            </div>
            <div className="card">
              <div className="card-idx">C-03</div>
              <h3>{t('pow-cool-dlc', { defaultValue: 'Direct-to-chip liquid' })}</h3>
              <p>
                {t('pow-cool-dlc-desc', {
                  defaultValue:
                    'Singapore throughout, and the accelerator halls everywhere else. Cold plates on the die, a CDU per row, and a dry-cooler loop that never touches the building chillers.',
                })}
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      <section className="sec">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">§04</div>
            <div className="sechead-body">
              <span className="kicker">{t('pow-s4-kicker', { defaultValue: 'Afterwards' })}</span>
              <h2>{t('pow-s4-heading', { defaultValue: 'The heat has somewhere to go' })}</h2>
              <p className="lede">
                {t('pow-s4-lede', {
                  defaultValue:
                    'A datacenter converts almost all of its electricity into low-grade heat. Rejecting that to the sky is the default; selling it into a district loop is better, and at Frankfurt it is what happens.',
                })}
              </p>
            </div>
          </div>
          <div className="tiles reveal d1">
            <div className="tile">
              <h3>{t('pow-heat-fra', { defaultValue: 'Frankfurt · 42 °C out' })}</h3>
              <p>
                {t('pow-heat-fra-desc', {
                  defaultValue:
                    'Recovered water leaves FRA-03 into the municipal heating loop at 42 °C, roughly 14 GWh over the last twelve months — about 1,300 homes through a German winter.',
                })}
              </p>
            </div>
            <div className="tile">
              <h3>{t('pow-heat-water', { defaultValue: 'Water, counted' })}</h3>
              <p>
                {t('pow-heat-water-desc', {
                  defaultValue:
                    'Fleet WUE is 0.31 L/kWh and Hillsboro is 0.21. Evaporative cooling trades water for electricity, so publishing PUE without WUE tells only the flattering half of that trade.',
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
              <span className="kicker">{t('pow-cta-kicker', { defaultValue: 'Reporting' })}</span>
              <h2>
                {t('pow-cta-heading', { defaultValue: 'Your share of all of this, monthly' })}
              </h2>
              <p>
                {t('pow-cta-body', {
                  defaultValue:
                    'Customers get their own energy, water and carbon attribution against measured load rather than a floor-space ratio — the numbers a sustainability report can actually be built from.',
                })}
              </p>
            </div>
            <Link
              className="btn btn-signal"
              to="/rmh-datacenter/contact"
              search={{ intent: 'Sustainability reporting' }}
            >
              {t('pow-cta-button', { defaultValue: 'Ask for a sample report' })}{' '}
              <span className="arw">→</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
