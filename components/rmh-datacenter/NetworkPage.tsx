/**
 * /rmh-datacenter/network — the backbone, the peering, and the latency matrix.
 *
 * The matrix is a real `<table>` with `<caption>`, a header row and row headers,
 * rather than a grid of divs: it is tabular data, a screen reader announcing
 * "ASH-01 to DUB-02, 68 ms" is the entire point of it, and the horizontal
 * overflow is handled by the wrapper so the page body never scrolls sideways.
 */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

const SITES = ['ASH-01', 'PDX-01', 'DUB-02', 'FRA-03', 'SIN-01', 'GRU-01'] as const;

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

  return (
    <>
      <section className="pagehead">
        <div className="container pagehead-inner">
          <span className="kicker">{t('net-kicker', { defaultValue: 'Network' })}</span>
          <h1>{t('net-title', { defaultValue: 'One AS, six buildings' })}</h1>
          <p className="lede">
            {t('net-lede', {
              defaultValue:
                'The campuses are not six unrelated facilities that happen to share a logo. They sit on one autonomous system with lit fibre between them, so traffic between two RMH halls never touches the public internet and is never billed as egress.',
            })}
          </p>
        </div>
      </section>

      <section className="sec tight">
        <div className="container">
          <div className="telemetry reveal">
            <div className="cell">
              <div className="l">{t('net-stat-backbone', { defaultValue: 'Backbone' })}</div>
              <div className="v">400G</div>
              <div className="k">
                {t('net-stat-backbone-desc', {
                  defaultValue: 'Between campuses, on diverse paths',
                })}
              </div>
            </div>
            <div className="cell">
              <div className="l">{t('net-stat-peers', { defaultValue: 'Peers' })}</div>
              <div className="v">640+</div>
              <div className="k">
                {t('net-stat-peers-desc', {
                  defaultValue: 'Settlement-free, across nine exchanges',
                })}
              </div>
            </div>
            <div className="cell">
              <div className="l">{t('net-stat-transit', { defaultValue: 'Transit' })}</div>
              <div className="v">4</div>
              <div className="k">
                {t('net-stat-transit-desc', {
                  defaultValue: 'Providers, so no single one holds a route',
                })}
              </div>
            </div>
            <div className="cell">
              <div className="l">{t('net-stat-scrub', { defaultValue: 'Scrubbing' })}</div>
              <div className="v load">18 Tbps</div>
              <div className="k">
                {t('net-stat-scrub-desc', { defaultValue: 'Mitigation capacity, always on' })}
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
              <span className="kicker">{t('net-s1-kicker', { defaultValue: 'Latency' })}</span>
              <h2>
                {t('net-s1-heading', { defaultValue: 'The matrix, measured rather than modelled' })}
              </h2>
              <p className="lede">
                {t('net-s1-lede', {
                  defaultValue:
                    'Median round trip between campuses over the backbone, sampled every minute for the last ninety days. These are the numbers a replication design should be built against — not great-circle distance divided by the speed of light in glass.',
                })}
              </p>
            </div>
          </div>
          <div className="matrix-scroll reveal d1">
            <table className="matrix">
              <caption>
                {t('net-matrix-caption', {
                  defaultValue: 'Median round-trip time, milliseconds · 90-day sample',
                })}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t('net-matrix-from', { defaultValue: 'From' })}</th>
                  {SITES.map((s) => (
                    <th scope="col" key={s}>
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SITES.map((from) => (
                  <tr key={from}>
                    <th scope="row">{from}</th>
                    {SITES.map((to) => {
                      const ms = rtt(from, to);
                      return (
                        <td key={to} className={ms === null ? 'self' : undefined}>
                          {ms === null ? '—' : `${ms}`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <hr className="rule" />

      <section className="sec">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">§02</div>
            <div className="sechead-body">
              <span className="kicker">{t('net-s2-kicker', { defaultValue: 'Connectivity' })}</span>
              <h2>
                {t('net-s2-heading', { defaultValue: 'How traffic actually leaves the building' })}
              </h2>
              <p className="lede">
                {t('net-s2-lede', {
                  defaultValue:
                    'Four ways out, chosen per prefix. You can take all of them, or bring your own AS and use us purely as floor space and fibre.',
                })}
              </p>
            </div>
          </div>
          <div className="cards c2 reveal d1">
            <div className="card">
              <div className="card-idx">NT-01</div>
              <h3>{t('net-c1-name', { defaultValue: 'Blended IP transit' })}</h3>
              <p>
                {t('net-c1-desc', {
                  defaultValue:
                    'Four upstreams and 640+ settlement-free peers, blended by a route optimiser that prefers the shortest measured path rather than the cheapest one. Commit by the gigabit, burst to 95th percentile.',
                })}
              </p>
            </div>
            <div className="card">
              <div className="card-idx">NT-02</div>
              <h3>{t('net-c2-name', { defaultValue: 'Cloud on-ramps' })}</h3>
              <p>
                {t('net-c2-desc', {
                  defaultValue:
                    'Direct private circuits into the major public clouds from every campus, provisioned in a day, so a hybrid estate is a VLAN rather than a VPN over the open internet.',
                })}
              </p>
            </div>
            <div className="card">
              <div className="card-idx">NT-03</div>
              <h3>{t('net-c3-name', { defaultValue: 'Cross-connects' })}</h3>
              <p>
                {t('net-c3-desc', {
                  defaultValue:
                    'Single-mode fibre to any other tenant or carrier in the building for a one-time install fee. No recurring rent, and the patch is documented in your portal with both ends named.',
                })}
              </p>
            </div>
            <div className="card">
              <div className="card-idx">NT-04</div>
              <h3>{t('net-c4-name', { defaultValue: 'Bring your own AS' })}</h3>
              <p>
                {t('net-c4-desc', {
                  defaultValue:
                    'Announce your own prefixes over our ports, or land your own carriers in your own cage. Buying space here does not oblige you to buy bandwidth here.',
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
            <div className="secref">§03</div>
            <div className="sechead-body">
              <span className="kicker">{t('net-s3-kicker', { defaultValue: 'Under attack' })}</span>
              <h2>
                {t('net-s3-heading', {
                  defaultValue: 'Mitigation that is on before the page loads',
                })}
              </h2>
              <p className="lede">
                {t('net-s3-lede', {
                  defaultValue:
                    'Volumetric scrubbing is always in path rather than triggered by a support ticket, because a mitigation that starts after a human notices has already missed the first four minutes.',
                })}
              </p>
            </div>
          </div>
          <dl className="spec reveal d1">
            <div className="spec-row">
              <dt>{t('net-ddos-capacity', { defaultValue: 'Capacity' })}</dt>
              <dd>
                {t('net-ddos-capacity-desc', {
                  defaultValue:
                    '18 Tbps of scrubbing across six centres, sized against the largest attack seen on the internet rather than the largest we have taken.',
                })}
              </dd>
            </div>
            <div className="spec-row">
              <dt>{t('net-ddos-detect', { defaultValue: 'Detection' })}</dt>
              <dd>
                {t('net-ddos-detect-desc', {
                  defaultValue:
                    'Flow telemetry sampled at every border, with automatic diversion inside 10 seconds of a signature crossing threshold.',
                })}
              </dd>
            </div>
            <div className="spec-row">
              <dt>{t('net-ddos-l7', { defaultValue: 'Application layer' })}</dt>
              <dd>
                {t('net-ddos-l7-desc', {
                  defaultValue:
                    'Optional reverse proxy with rate limiting and bot scoring, for the attacks that arrive as valid requests at a plausible rate.',
                })}
              </dd>
            </div>
            <div className="spec-row">
              <dt>{t('net-ddos-report', { defaultValue: 'Afterwards' })}</dt>
              <dd>
                {t('net-ddos-report-desc', {
                  defaultValue:
                    'A written incident report within one working day, including what got through, not only what was stopped.',
                })}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="sec">
        <div className="container">
          <div className="callout reveal">
            <div className="callout-body">
              <span className="kicker">{t('net-cta-kicker', { defaultValue: 'Peering' })}</span>
              <h2>{t('net-cta-heading', { defaultValue: 'Open peering policy' })}</h2>
              <p>
                {t('net-cta-body', {
                  defaultValue:
                    'We peer with anyone at any exchange we are on, with no ratio requirement and no minimum traffic. Send a note and a PeeringDB entry and it will be up within a week.',
                })}
              </p>
            </div>
            <Link
              className="btn btn-signal"
              to="/rmh-datacenter/contact"
              search={{ intent: 'Peering' }}
            >
              {t('net-cta-button', { defaultValue: 'Ask about peering' })}{' '}
              <span className="arw">→</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
