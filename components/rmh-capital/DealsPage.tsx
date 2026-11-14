/**
 * RMH Capital — Deals. The two announced transactions: the tombstones, then
 * the NvidiAMD combination (figures, ownership bar, terms on rules, the
 * timetable as a sequence, each business's role) and the Senior Secured
 * Enlightenment Facility (a disc plate beside the headline, terms in a grid,
 * the closing line as a quote). Motion is CSS only: this file applies the
 * classes (see the MOTION block in rmh-capital.css; page rules in css/deals.css).
 */

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowIcon, Count, DealTombstones, PageHead, Plate, SatireNotice, cssVars } from './shared';

export default function DealsPage() {
  const { t } = useTranslation('c-rmh-capital');

  return (
    <>
      <PageHead
        title={t('deals-title', { defaultValue: 'Transactions' })}
        lede={t('deals-lede', {
          defaultValue:
            'The transactions RMH Capital has announced, and the part each of its businesses played in them.',
        })}
      />

      <section className="sec">
        <div className="wrap">
          <DealTombstones />
        </div>
      </section>

      <section className="sec" id="nvidiamd" aria-labelledby="deals-nv-heading">
        <div className="wrap">
          <div className="offset">
            <div className="o-head stack rv">
              <p className="meta">
                {t('deals-nv-date', { defaultValue: 'Announced November 13, 2026' })}
              </p>
              <h2 className="h2" id="deals-nv-heading">
                {t('deals-nv-heading', {
                  defaultValue: 'AMD and Nvidia agree to combine as NvidiAMD',
                })}
              </h2>
            </div>
            <div className="o-wide stack">
              <p className="lede rv">
                {t('deals-nv-lede', {
                  defaultValue:
                    'An all-stock transaction that values the combined company at approximately $6.4 trillion. AMD shareholders will receive consideration valued at approximately $955 billion, a premium of 20%.',
                })}
              </p>
              <p className="body rv d1">
                {t('deals-nv-body-1', {
                  defaultValue:
                    'RMHan Stanley, the investment banking business of RMH Capital, is acting as lead financial advisor on the agreement by Advanced Micro Devices, Inc. (Nasdaq: AMD) and NVIDIA Corporation (Nasdaq: NVDA) to combine.',
                })}
              </p>
              <p className="body rv d2">
                {t('deals-nv-body-2', {
                  defaultValue:
                    'The agreement follows the departure of Jensen Huang as Chief Executive Officer of Nvidia. Lisa Su, Chair and Chief Executive Officer of AMD, will serve as Chair and Chief Executive Officer of the combined company.',
                })}
              </p>
            </div>

            <div className="o-full figs" style={cssVars({ '--n': 3 })}>
              <div className="fig rv">
                <Count className="fig-n steel" to={955} pre="$" suf="B" />
                <span className="fig-k">
                  {t('deals-nv-fig-consideration', {
                    defaultValue: 'Consideration to AMD shareholders, approximately',
                  })}
                </span>
              </div>
              <div className="fig rv d1">
                <Count className="fig-n steel" to={6} pre="$" suf=".4T" />
                <span className="fig-k">
                  {t('deals-nv-fig-value', {
                    defaultValue: 'Equity value of the combined company, approximately',
                  })}
                </span>
              </div>
              <div className="fig rv d2">
                <Count className="fig-n steel" to={20} suf="%" />
                <span className="fig-k">
                  {t('deals-nv-fig-premium', {
                    defaultValue: "Premium to AMD's market value before the announcement",
                  })}
                </span>
              </div>
            </div>

            <div className="o-lead stack rv">
              <h3 className="h3">
                {t('deals-nv-own-heading', { defaultValue: 'Ownership on completion' })}
              </h3>
              <p className="body">
                {t('deals-nv-own-text', {
                  defaultValue:
                    'Nvidia shareholders will own approximately 85% of NvidiAMD and AMD shareholders approximately 15%.',
                })}
              </p>
            </div>
            <div className="o-wide">
              <div className="rv-wipe">
                <div className="deal-own" aria-hidden="true">
                  <span className="deal-own-a chrome chrome-ingot" data-chrome-live="" />
                  <span className="deal-own-b" />
                </div>
              </div>
              <div className="deal-own-key rv d1">
                <p>
                  <span className="deal-own-pct">85%</span>
                  <span className="deal-own-who">
                    {t('deals-nv-own-nvidia', { defaultValue: 'Nvidia shareholders' })}
                  </span>
                </p>
                <p>
                  <span className="deal-own-pct">15%</span>
                  <span className="deal-own-who">
                    {t('deals-nv-own-amd', { defaultValue: 'AMD shareholders' })}
                  </span>
                </p>
              </div>
            </div>

            <h3 className="o-lead h3 rv">
              {t('deals-nv-terms-heading', { defaultValue: 'Transaction details' })}
            </h3>
            <dl className="o-wide deal-dl">
              <div className="rv">
                <dt>{t('deals-nv-term-consideration', { defaultValue: 'Consideration' })}</dt>
                <dd>
                  {t('deals-nv-term-consideration-v', {
                    defaultValue:
                      "AMD shareholders will receive consideration valued at approximately $955 billion, a premium of 20% to AMD's market value prior to the announcement.",
                  })}
                </dd>
              </div>
              <div className="rv">
                <dt>{t('deals-nv-term-ownership', { defaultValue: 'Ownership' })}</dt>
                <dd>
                  {t('deals-nv-term-ownership-v', {
                    defaultValue:
                      'Nvidia shareholders approximately 85%, AMD shareholders approximately 15%.',
                  })}
                </dd>
              </div>
              <div className="rv">
                <dt>{t('deals-nv-term-valuation', { defaultValue: 'Valuation' })}</dt>
                <dd>
                  {t('deals-nv-term-valuation-v', {
                    defaultValue:
                      'An equity value of approximately $6.4 trillion. The transaction is the largest corporate transaction on record.',
                  })}
                </dd>
              </div>
              <div className="rv">
                <dt>{t('deals-nv-term-listing', { defaultValue: 'Listing and headquarters' })}</dt>
                <dd>
                  {t('deals-nv-term-listing-v', {
                    defaultValue:
                      'Nasdaq, under the ticker symbol NVMD. Headquartered in Santa Clara, California.',
                  })}
                </dd>
              </div>
              <div className="rv">
                <dt>{t('deals-nv-term-regulatory', { defaultValue: 'Regulatory' })}</dt>
                <dd>
                  {t('deals-nv-term-regulatory-v', {
                    defaultValue:
                      'The companies have agreed in advance to divest a discrete graphics business to address anticipated competition concerns.',
                  })}
                </dd>
              </div>
              <div className="rv">
                <dt>{t('deals-nv-term-timing', { defaultValue: 'Timing' })}</dt>
                <dd>
                  {t('deals-nv-term-timing-v', {
                    defaultValue:
                      'Shareholder votes in the first quarter of 2027; closing in the second half of 2027. Until closing, AMD and Nvidia will continue to operate as separate, independent companies.',
                  })}
                </dd>
              </div>
            </dl>

            <h3 className="o-full h3 rv">
              {t('deals-nv-steps-heading', { defaultValue: 'From announcement to closing' })}
            </h3>
            <ol className="o-full deal-steps">
              <li className="deal-step rv">
                <span className="deal-step-n meta" aria-hidden="true" />
                <p className="meta">
                  {t('deals-nv-step-1-when', { defaultValue: 'November 13, 2026' })}
                </p>
                <p className="deal-step-what">
                  {t('deals-nv-step-1-what', { defaultValue: 'Agreement announced' })}
                </p>
                <p className="deal-step-text">
                  {t('deals-nv-step-1-text', {
                    defaultValue:
                      'The two companies agree to combine in an all-stock transaction, with RMHan Stanley as lead financial advisor.',
                  })}
                </p>
              </li>
              <li className="deal-step deal-step--due rv d1">
                <span className="deal-step-n meta" aria-hidden="true" />
                <p className="meta">
                  {t('deals-nv-step-2-when', { defaultValue: 'First quarter of 2027' })}
                </p>
                <p className="deal-step-what">
                  {t('deals-nv-step-2-what', { defaultValue: 'Shareholder votes' })}
                </p>
                <p className="deal-step-text">
                  {t('deals-nv-step-2-text', {
                    defaultValue: 'Shareholders of both companies are expected to vote.',
                  })}
                </p>
              </li>
              <li className="deal-step deal-step--due rv d2">
                <span className="deal-step-n meta" aria-hidden="true" />
                <p className="meta">
                  {t('deals-nv-step-3-when', { defaultValue: 'Second half of 2027' })}
                </p>
                <p className="deal-step-what">
                  {t('deals-nv-step-3-what', { defaultValue: 'Expected closing' })}
                </p>
                <p className="deal-step-text">
                  {t('deals-nv-step-3-text', {
                    defaultValue:
                      'Subject to shareholder approvals, regulatory approvals and other customary closing conditions.',
                  })}
                </p>
              </li>
            </ol>

            <div className="o-lead stack rv">
              <h3 className="h3">
                {t('deals-nv-role-heading', { defaultValue: "RMH Capital's role" })}
              </h3>
              <p className="body">
                {t('deals-nv-role-intro', {
                  defaultValue:
                    'The first transaction on which RMHan Stanley, RMH Street, RMHcKinsey and RMHstone have each acted on a single mandate, from advice and execution through integration to ownership.',
                })}
              </p>
            </div>
            <div className="o-wide rows">
              <div className="row rv">
                <p className="row-title">
                  RMHan Stanley
                  <span className="deal-alias meta">
                    {t('deals-nv-role-ib', { defaultValue: 'Investment Banking' })}
                  </span>
                </p>
                <div className="row-text">
                  <p>
                    {t('deals-nv-role-ib-text', {
                      defaultValue:
                        'Lead financial advisor to the joint transaction committee of the two boards. Delivered a fairness opinion to each board.',
                    })}
                  </p>
                  <ul className="deal-desks">
                    <li>
                      <b>{t('deals-nv-desk-ma', { defaultValue: 'Mergers & Acquisitions' })}</b>
                      {t('deals-nv-desk-ma-text', {
                        defaultValue:
                          'Structured the transaction, the exchange ratio and the governance of the combined board.',
                      })}
                    </li>
                    <li>
                      <b>{t('deals-nv-desk-ecm', { defaultValue: 'Equity Capital Markets' })}</b>
                      {t('deals-nv-desk-ecm-text', {
                        defaultValue: 'Designed the share exchange and the new listing.',
                      })}
                    </li>
                    <li>
                      <b>{t('deals-nv-desk-lf', { defaultValue: 'Leveraged Finance' })}</b>
                      {t('deals-nv-desk-lf-text', {
                        defaultValue:
                          'Arranged a 364-day bridge facility to refinance debt that becomes callable on a change of control.',
                      })}
                    </li>
                    <li>
                      <b>{t('deals-nv-desk-dcm', { defaultValue: 'Debt Capital Markets' })}</b>
                      {t('deals-nv-desk-dcm-text', {
                        defaultValue:
                          'Will lead the investment-grade bond offering that refinances the bridge facility after closing.',
                      })}
                    </li>
                  </ul>
                </div>
              </div>
              <div className="row rv">
                <p className="row-title">
                  RMH Street
                  <span className="deal-alias meta">
                    {t('deals-nv-role-markets', { defaultValue: 'Markets' })}
                  </span>
                </p>
                <p className="row-text">
                  {t('deals-nv-role-markets-text', {
                    defaultValue:
                      'Providing liquidity to index funds that are required to rebalance as a result of the transaction. Has hedged the interest-rate exposure on the planned bond offering and the currency exposure of the combined company. RMH Street Research has been restricted on both companies since the mandate was signed.',
                  })}
                </p>
              </div>
              <div className="row rv">
                <p className="row-title">
                  RMHcKinsey
                  <span className="deal-alias meta">
                    {t('deals-nv-role-consulting', { defaultValue: 'Management Consulting' })}
                  </span>
                </p>
                <p className="row-text">
                  {t('deals-nv-role-consulting-text', {
                    defaultValue:
                      'Has led integration planning since the first board discussion and will remain engaged through the first year after closing: a single product roadmap, a single software stack, the leadership structure reporting to Lisa Su and the naming of the combined company.',
                  })}
                </p>
              </div>
              <div className="row rv">
                <p className="row-title">
                  RMHstone
                  <span className="deal-alias meta">
                    {t('deals-nv-role-pe', { defaultValue: 'Private Equity' })}
                  </span>
                </p>
                <p className="row-text">
                  {t('deals-nv-role-pe-text', {
                    defaultValue:
                      "Has agreed to acquire a majority interest in the divested graphics business, alongside that business's management team, through its growth-equity strategy.",
                  })}
                </p>
              </div>
            </div>

            <p className="o-wide meta rv">
              <span className="ink">
                {t('deals-nv-fls-heading', { defaultValue: 'Forward-looking statements.' })}
              </span>{' '}
              {t('deals-nv-fls-text', {
                defaultValue:
                  'This page contains forward-looking statements, including statements about the expected timing, completion and effects of the transaction. These statements are subject to risks and uncertainties, including the receipt of shareholder and regulatory approvals. Actual results may differ materially. RMH Capital undertakes no obligation to update these statements.',
              })}
            </p>
          </div>
        </div>
      </section>

      <div className="wrap">
        <hr className="rule rv-rule" />
      </div>

      <section className="sec" id="tibetan-buddhism" aria-labelledby="deals-tb-heading">
        <div className="wrap">
          <div className="offset">
            <div className="o-lead">
              <div className="rv-wipe deal-plate">
                <Plate kind="disc" className="plate--sq" />
              </div>
            </div>
            <div className="o-wide stack">
              <p className="meta rv">
                {t('deals-tb-date', { defaultValue: 'Announced November 7, 2026' })}
              </p>
              <h2 className="h2 rv" id="deals-tb-heading">
                {t('deals-tb-heading', {
                  defaultValue:
                    "A $35 million Senior Secured Enlightenment Facility for Bain Capital's acquisition of Tibetan Buddhism",
                })}
              </h2>
              <p className="lede rv d1">
                {t('deals-tb-lede', {
                  defaultValue:
                    "The transaction brings together one of the world's most established contemplative traditions and a sponsor with a long record of finding growth in mature assets.",
                })}
              </p>
              <p className="body rv d2">
                {t('deals-tb-body', {
                  defaultValue:
                    'RMH Capital served as Lead Left Bookrunner on the facility. It was oversubscribed within one kalpa, which let us tighten pricing to the Middle Way and remove all attachment covenants.',
                })}
              </p>
            </div>

            <div className="o-full figs" style={cssVars({ '--n': 3 })}>
              <div className="fig rv">
                <Count className="fig-n ink" to={35} pre="$" suf="M" />
                <span className="fig-k">
                  {t('deals-tb-fig-size', {
                    defaultValue: 'Senior Secured Enlightenment Facility',
                  })}
                </span>
              </div>
              <div className="fig rv d1">
                <span className="fig-n deal-fig-term ink">
                  {t('deals-tb-fig-role', { defaultValue: 'Lead left' })}
                </span>
                <span className="fig-k">
                  {t('deals-tb-fig-role-k', { defaultValue: 'Bookrunner: RMH Capital' })}
                </span>
              </div>
              <div className="fig rv d2">
                <span className="fig-n deal-fig-term ink">
                  {t('deals-tb-fig-kalpa', { defaultValue: 'One kalpa' })}
                </span>
                <span className="fig-k">
                  {t('deals-tb-fig-kalpa-k', { defaultValue: 'Time to oversubscription' })}
                </span>
              </div>
            </div>

            <dl className="o-full deal-terms">
              <div className="rv">
                <dt>{t('deals-tb-term-facility', { defaultValue: 'Facility' })}</dt>
                <dd>
                  {t('deals-tb-term-facility-v', {
                    defaultValue: '$35 million Senior Secured Enlightenment Facility',
                  })}
                </dd>
              </div>
              <div className="rv d1">
                <dt>{t('deals-tb-term-sponsor', { defaultValue: 'Sponsor' })}</dt>
                <dd>
                  {t('deals-tb-term-sponsor-v', {
                    defaultValue: 'Bain Capital, for its acquisition of Tibetan Buddhism',
                  })}
                </dd>
              </div>
              <div className="rv d2">
                <dt>{t('deals-tb-term-pricing', { defaultValue: 'Pricing' })}</dt>
                <dd>
                  {t('deals-tb-term-pricing-v', { defaultValue: 'Tightened to the Middle Way' })}
                </dd>
              </div>
              <div className="rv">
                <dt>{t('deals-tb-term-covenants', { defaultValue: 'Covenants' })}</dt>
                <dd>
                  {t('deals-tb-term-covenants-v', {
                    defaultValue: 'All attachment covenants removed',
                  })}
                </dd>
              </div>
              <div className="rv d1">
                <dt>{t('deals-tb-term-governance', { defaultValue: 'Governance' })}</dt>
                <dd>
                  {t('deals-tb-term-governance-v', {
                    defaultValue: 'John P. Connaughton appointed Chairman and Dalai Lama',
                  })}
                </dd>
              </div>
              <div className="rv d2">
                <dt>{t('deals-tb-term-proceeds', { defaultValue: 'Use of proceeds' })}</dt>
                <dd>
                  {t('deals-tb-term-proceeds-v', {
                    defaultValue: 'Targeted investment across the monastery portfolio',
                  })}
                </dd>
              </div>
              <div className="rv">
                <dt>{t('deals-tb-term-teams', { defaultValue: 'Teams' })}</dt>
                <dd>
                  {t('deals-tb-term-teams-v', {
                    defaultValue: 'RMH Capital Leveraged Finance and Sacred Assets',
                  })}
                </dd>
              </div>
            </dl>

            <figure className="o-wide">
              <blockquote className="quote rv">
                {t('deals-tb-quote', {
                  defaultValue: 'Impermanence is the only constant. Fees are not.',
                })}
              </blockquote>
              <figcaption className="quote-by rv d1">
                {t('deals-tb-quote-by', {
                  defaultValue:
                    'RMH Capital, thanking its clients for their trust and its Leveraged Finance and Sacred Assets teams for their tireless work',
                })}
              </figcaption>
            </figure>

            <p className="o-wide meta rv">
              {t('deals-tb-record', {
                defaultValue: 'This announcement appears as a matter of karma only.',
              })}
            </p>
          </div>
        </div>
      </section>

      <section className="sec sec--tight">
        <div className="wrap stack">
          <SatireNotice />
          <div className="actions">
            <Link className="cta" to="/rmh-capital/contact">
              {t('deals-cta', { defaultValue: 'Discuss a transaction' })}
              <ArrowIcon />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
