/**
 * RMH Capital — home. A satin slab with the headline and the colonnade stepped
 * under it, then the firm, the figures, the six businesses, the two announced
 * transactions, insights, the global platform and careers. Motion is CSS only:
 * this file applies the classes (see the MOTION block in rmh-capital.css).
 */

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowIcon,
  CornerArrow,
  Count,
  DealTombstones,
  Plate,
  SatireNotice,
  Words,
  cssVars,
} from './shared';

export default function HomePage() {
  const { t } = useTranslation('c-rmh-capital');
  return (
    <>
      <section className="hero">
        <div className="hero-slab chrome chrome-satin" data-chrome-live="">
          <div className="hero-copy">
            <h1 className="display">
              <Words
                text={t('hero-heading', {
                  defaultValue: 'Capital, advisory, and intelligence across the full company arc',
                })}
              />
            </h1>
            <p className="lede ld">
              {t('home-hero-lede', {
                defaultValue:
                  'Investment banking, markets, corporate banking, venture, consulting and private equity. One platform for every stage a company moves through.',
              })}
            </p>
            <div className="actions ld" style={cssVars({ '--i': 1 })}>
              <Link className="cta cta--solid" to="/rmh-capital/firm">
                {t('hero-cta-firm', { defaultValue: 'Explore our firm' })}
                <ArrowIcon />
              </Link>
              <Link className="cta" to="/rmh-capital/deals">
                {t('home-hero-cta-deals', { defaultValue: 'Recent transactions' })}
                <ArrowIcon />
              </Link>
            </div>
          </div>
        </div>
        <div className="hero-step">
          <Plate kind="colonnade" className="plate--free" />
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="offset">
            <h2 className="h2 o-head rv">
              {t('firm-heading', {
                defaultValue: 'One firm, organized around the client — not the product.',
              })}
            </h2>
            <p className="body o-body rv d1">
              {t('firm-p1', {
                defaultValue:
                  'Most financial institutions are built as a federation of product lines. RMH Capital is built the other way around: a single platform that follows a client through every stage of their growth, from the first venture round to large-cap M&A, from a revolving credit line to a public listing.',
              })}
            </p>
            <div className="o-body2 stack rv d2">
              <p className="body">
                {t('firm-p2', {
                  defaultValue:
                    'That structure lets us bring the whole firm to a single relationship — advisory, capital, and intelligence — with the judgment and discretion our clients expect.',
                })}
              </p>
              <Link className="cta" to="/rmh-capital/firm">
                {t('firm-cta', { defaultValue: 'Read about our firm' })}
                <ArrowIcon />
              </Link>
            </div>
          </div>
          <div className="plates home-gap">
            <div className="rv-wipe">
              <Plate kind="louvres" />
            </div>
            <div className="rv-wipe">
              <Plate kind="disc" />
            </div>
          </div>
        </div>
      </section>

      <section className="sec sec--flush">
        <div className="wrap">
          <div className="figs" style={cssVars({ '--n': 4 })}>
            <div className="fig rv">
              <Count to={6} className="fig-n steel" />
              <span className="fig-k">
                {t('stat-1', { defaultValue: 'Integrated businesses under one platform' })}
              </span>
            </div>
            <div className="fig rv d1">
              <Count to={20} suf="+" className="fig-n steel" />
              <span className="fig-k">
                {t('stat-3', {
                  defaultValue: 'Markets served across the Americas, Europe, and Asia',
                })}
              </span>
            </div>
            <div className="fig rv d2">
              <Count to={955} pre="$" suf="B" className="fig-n steel" />
              <span className="fig-k">
                {t('home-fig-nvidiamd', {
                  defaultValue: 'AMD and Nvidia, combined to form NvidiAMD',
                })}
              </span>
            </div>
            <div className="fig rv d3">
              <Count to={35} pre="$" suf="M" className="fig-n steel" />
              <span className="fig-k">
                {t('home-fig-acquisition', {
                  defaultValue: "Facility for Bain Capital's acquisition of Tibetan Buddhism",
                })}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="offset">
            <h2 className="h2 o-head rv">
              {t('businesses-heading', {
                defaultValue: 'Six businesses. One continuous relationship.',
              })}
            </h2>
            <p className="lede o-wide rv d1">
              {t('businesses-lede', {
                defaultValue:
                  'Each business is a leader in its discipline. Together, they let a client raise, grow, advise, transact, and own — without ever leaving the platform.',
              })}
            </p>
          </div>
          <div className="trio home-gap">
            <Link className="trio-item rv" to="/rmh-capital/businesses" hash="investment-banking">
              <h3 className="h3">{t('biz-ib-name', { defaultValue: 'Investment Banking' })}</h3>
              <span className="trio-alias">RMHan Stanley</span>
              <p>
                {t('biz-ib-desc', {
                  defaultValue:
                    'M&A advisory, equity and debt capital markets, and leveraged finance for companies at every scale.',
                })}
              </p>
              <CornerArrow />
            </Link>
            <Link className="trio-item rv d1" to="/rmh-capital/businesses" hash="markets">
              <h3 className="h3">{t('biz-markets-name', { defaultValue: 'Markets' })}</h3>
              <span className="trio-alias">RMH Street</span>
              <p>
                {t('biz-markets-desc', {
                  defaultValue:
                    'Sales, trading, research, and liquidity across equities, credit, and rates for institutional clients.',
                })}
              </p>
              <CornerArrow />
            </Link>
            <Link className="trio-item rv d2" to="/rmh-capital/businesses" hash="corporate-banking">
              <h3 className="h3">{t('biz-cb-name', { defaultValue: 'Corporate Banking' })}</h3>
              <p>
                {t('biz-cb-desc', {
                  defaultValue:
                    'Credit facilities, structured lending, and treasury solutions that scale with a growing company.',
                })}
              </p>
              <CornerArrow />
            </Link>
            <Link className="trio-item rv" to="/rmh-capital/businesses" hash="venture-capital">
              <h3 className="h3">{t('biz-vc-name', { defaultValue: 'Venture Capital' })}</h3>
              <span className="trio-alias">RMHCombinator</span>
              <p>
                {t('biz-vc-desc', {
                  defaultValue:
                    'Early-stage capital, an accelerator, and a venture studio backing founders from the very first round.',
                })}
              </p>
              <CornerArrow />
            </Link>
            <Link
              className="trio-item rv d1"
              to="/rmh-capital/businesses"
              hash="management-consulting"
            >
              <h3 className="h3">{t('biz-mc-name', { defaultValue: 'Management Consulting' })}</h3>
              <span className="trio-alias">RMHcKinsey</span>
              <p>
                {t('biz-mc-desc', {
                  defaultValue:
                    "Strategy, operations, and transformation advisory delivered alongside the firm's capital and markets reach.",
                })}
              </p>
              <CornerArrow />
            </Link>
            <Link className="trio-item rv d2" to="/rmh-capital/businesses" hash="private-equity">
              <h3 className="h3">{t('biz-pe-name', { defaultValue: 'Private Equity' })}</h3>
              <span className="trio-alias">RMHstone</span>
              <p>
                {t('biz-pe-desc', {
                  defaultValue:
                    'Growth-equity and impact-housing strategies that let the firm own and build alongside its clients.',
                })}
              </p>
              <CornerArrow />
            </Link>
          </div>
        </div>
      </section>

      <div className="wrap">
        <hr className="rule rv-rule" />
      </div>

      <section className="sec">
        <div className="wrap">
          <div className="offset">
            <h2 className="h2 o-head rv">
              {t('home-deals-heading', { defaultValue: 'Recent transactions.' })}
            </h2>
            <p className="body o-wide rv d1">
              {t('home-deals-line', {
                defaultValue: 'Two announcements in November. One of them is a matter of record.',
              })}
            </p>
          </div>
          <div className="home-gap">
            <DealTombstones />
          </div>
          <div className="home-after">
            <Link className="go" to="/rmh-capital/deals">
              {t('home-deals-all', { defaultValue: 'All transactions' })}{' '}
              <CornerArrow className="" />
            </Link>
          </div>
          <div className="home-after">
            <SatireNotice />
          </div>
        </div>
      </section>

      <div className="wrap">
        <hr className="rule rv-rule" />
      </div>

      <section className="sec">
        <div className="wrap">
          <div className="offset">
            <h2 className="h2 o-head rv">
              {t('insights-heading', { defaultValue: 'Intelligence from across the platform.' })}
            </h2>
            <p className="lede o-wide rv d1">
              {t('insights-lede-home-page', {
                defaultValue:
                  'Research and commentary from the teams advising on the deals, markets, and companies shaping the year ahead.',
              })}
            </p>
          </div>
          <div className="rows home-gap rv">
            <Link className="row" to="/rmh-capital/insights">
              <span className="row-title">
                {t('insight-1-heading', {
                  defaultValue: 'The 2026 capital cycle: where conviction meets discipline',
                })}
              </span>
              <span className="row-text">
                {t('insight-1-desc', {
                  defaultValue:
                    'Our markets and investment-banking teams on the conditions reshaping issuance, M&A, and private capital — and how clients are positioning for them.',
                })}
              </span>
              <span className="row-end">
                <CornerArrow />
              </span>
            </Link>
            <Link className="row" to="/rmh-capital/insights">
              <span className="row-title">
                {t('insight-2-heading', {
                  defaultValue: 'What the strongest founders get right before their first round',
                })}
              </span>
              <span className="row-text">
                {t('insight-2-desc', {
                  defaultValue: 'Lessons from across our accelerator cohorts.',
                })}
              </span>
              <span className="row-end">
                <CornerArrow />
              </span>
            </Link>
            <Link className="row" to="/rmh-capital/insights">
              <span className="row-title">
                {t('insight-3-heading', {
                  defaultValue: 'Reading the new capital rules without overreacting to them',
                })}
              </span>
              <span className="row-text">
                {t('insight-3-desc', { defaultValue: 'A practical view on Basel III endgame.' })}
              </span>
              <span className="row-end">
                <CornerArrow />
              </span>
            </Link>
            <Link className="row" to="/rmh-capital/insights">
              <span className="row-title">
                {t('insight-4-heading', {
                  defaultValue: 'Impact housing as an institutional asset class',
                })}
              </span>
              <span className="row-text">
                {t('insight-4-desc', {
                  defaultValue: 'Returns and resilience in affordable housing.',
                })}
              </span>
              <span className="row-end">
                <CornerArrow />
              </span>
            </Link>
          </div>
          <div className="home-after">
            <Link className="go" to="/rmh-capital/insights">
              {t('all-insights', { defaultValue: 'All insights' })} <CornerArrow className="" />
            </Link>
          </div>
        </div>
      </section>

      <div className="wrap">
        <hr className="rule rv-rule" />
      </div>

      <section className="sec">
        <div className="wrap">
          <div className="offset">
            <h2 className="h2 o-head rv">
              {t('global-heading', { defaultValue: 'Local judgment, global reach.' })}
            </h2>
            <div className="o-lead rv-wipe">
              <Plate kind="orb" className="plate--sq" />
            </div>
            <div className="o-wide stack rv d1">
              <p className="body">
                {t('global-p1', {
                  defaultValue:
                    "Our clients operate across borders, and so do we. RMH Capital connects teams across the Americas, Europe, and Asia, giving every relationship access to the firm's full capabilities wherever opportunity arises.",
                })}
              </p>
              <p className="body">
                {t('global-p2', {
                  defaultValue:
                    'One coordinated platform means a client in any market gets the same standard of advice, the same risk discipline, and the same access to capital.',
                })}
              </p>
              <Link className="go" to="/rmh-capital/firm">
                {t('global-cta', { defaultValue: 'Inside the platform' })}{' '}
                <CornerArrow className="" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap">
        <hr className="rule rv-rule" />
      </div>

      <section className="sec">
        <div className="wrap">
          <div className="offset">
            <h2 className="h2 home-big o-full rv">
              {t('careers-heading', {
                defaultValue: 'Build a career across the whole company arc.',
              })}
            </h2>
            <div className="o-wide stack rv d1">
              <p className="body">
                {t('careers-desc', {
                  defaultValue:
                    'From analyst programs to engineering and senior advisory roles, RMH Capital is a place to do the most interesting work in finance — and to grow with a platform built for the long term.',
                })}
              </p>
              <Link className="cta" to="/rmh-capital/careers">
                {t('careers-cta', { defaultValue: 'Explore careers' })}
                <ArrowIcon />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
