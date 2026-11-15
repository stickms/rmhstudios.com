import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowIcon, PageHead, Plate } from './shared';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'markets', label: 'Markets' },
  { id: 'investment-banking', label: 'Investment Banking' },
  { id: 'venture-capital', label: 'Venture Capital' },
  { id: 'private-equity', label: 'Private Equity' },
  { id: 'technology', label: 'Technology' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'risk', label: 'Risk & Regulation' },
] as const;

type Article = { cat: string; meta: string; read: string; title: string; blurb: string };

const ARTICLES: Article[] = [
  {
    cat: 'investment-banking',
    meta: 'Investment Banking',
    read: '6 min',
    title: 'Why founder-led targets are reshaping M&A',
    blurb:
      'The fastest-growing acquisition targets are run by their founders. That changes who wins the mandate, and why.',
  },
  {
    cat: 'technology',
    meta: 'Technology',
    read: '5 min',
    title: 'Building a single client view across six businesses',
    blurb:
      "The engineering behind one shared record — and why it's the platform's quietest advantage.",
  },
  {
    cat: 'strategy',
    meta: 'Strategy',
    read: '7 min',
    title: 'The integrated platform: an old idea, finally workable',
    blurb:
      'Why convergence in capital, technology, and client expectations makes the full-arc firm possible now.',
  },
  {
    cat: 'markets',
    meta: 'Markets',
    read: '5 min',
    title: 'Liquidity for the mid-market: an underserved opportunity',
    blurb:
      "The clients below the bulge-bracket threshold are overlooked. We think that's a mistake.",
  },
  {
    cat: 'venture-capital',
    meta: 'Venture Capital',
    read: '9 min',
    title: 'From accelerator to IPO: anatomy of a ten-year relationship',
    blurb:
      'How an early bet compounds into advisory, banking, and capital-markets value over a decade.',
  },
  {
    cat: 'private-equity',
    meta: 'Private Equity',
    read: '6 min',
    title: 'Underwriting affordable housing through the cycle',
    blurb: 'What LIHTC and HUD structures look like when you hold them for the long term.',
  },
  {
    cat: 'risk',
    meta: 'Risk & Regulation',
    read: '8 min',
    title: 'Volcker, Basel, and the art of staying nimble',
    blurb:
      'Compliance as a capability, not a cost — how disciplined firms turn rules into an edge.',
  },
  {
    cat: 'technology',
    meta: 'Technology',
    read: '4 min',
    title: 'What real-time risk infrastructure changes',
    blurb:
      'When the firm can see exposure as it forms, risk discipline stops being a quarterly exercise.',
  },
  {
    cat: 'investment-banking',
    meta: 'Investment Banking',
    read: '5 min',
    title: 'Equity markets reopen: a window, not a wave',
    blurb:
      'Issuers that prepared during the quiet are the ones moving first. Readiness is the strategy.',
  },
  {
    cat: 'strategy',
    meta: 'Strategy',
    read: '6 min',
    title: 'How we measure a relationship, not a transaction',
    blurb: "Lifetime client value sounds like a slogan. Here's how it actually changes incentives.",
  },
  {
    cat: 'markets',
    meta: 'Markets',
    read: '7 min',
    title: 'Credit spreads and the patience premium',
    blurb: 'Why the best entry points in credit reward the investors willing to wait for them.',
  },
  {
    cat: 'venture-capital',
    meta: 'Venture Capital',
    read: '5 min',
    title: "The case for being a founder's first call",
    blurb:
      'Pre-institutional relationships are the most exclusive — and the most durable — in finance.',
  },
];

export default function InsightsPage() {
  const { t } = useTranslation('c-rmh-capital');
  const [active, setActive] = useState<string>('all');
  const shown = ARTICLES.filter((a) => active === 'all' || a.cat === active);

  return (
    <>
      <PageHead
        title={t('insights-heading', { defaultValue: 'Intelligence from across the platform.' })}
        lede={t('insights-lede', {
          defaultValue:
            'Research and commentary from the teams advising on the deals, markets, and companies shaping the year ahead — written for the people who have to act on it.',
        })}
      />

      <section className="sec">
        <div className="wrap">
          <div className="offset">
            <div className="o-full rv">
              <p className="meta ins-meta">
                <span>{t('featured-main-metaline', { defaultValue: 'Markets' })}</span>
                <span>{t('featured-main-read', { defaultValue: '8 min read' })}</span>
              </p>
            </div>
            <h2 className="h2 o-head rv">
              {t('featured-main-title', {
                defaultValue: 'The 2026 capital cycle: where conviction meets discipline',
              })}
            </h2>
            <p className="o-wide rv d1">
              {t('featured-main-blurb', {
                defaultValue:
                  "Our markets and investment-banking teams on the conditions reshaping issuance, M&A, and private capital — and how the firm's clients are positioning for what comes next.",
              })}
            </p>
            <div className="o-full">
              <div className="rv-wipe">
                <Plate kind="louvres" className="plate--wide" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap">
        <hr className="rule rv-rule" />
      </div>

      <section className="sec">
        <div className="wrap">
          <div
            className="chips rv"
            role="group"
            aria-label={t('filters-aria-label', { defaultValue: 'Filter insights by category' })}
          >
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className="chip"
                aria-pressed={active === c.id}
                onClick={() => setActive(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="rows ins-rows rv">
            {shown.map((a) => (
              <article key={a.title} className="row">
                <div>
                  <p className="meta ins-meta">
                    <span>{a.meta}</span>
                    <span>{a.read}</span>
                  </p>
                  <h3 className="row-title">{a.title}</h3>
                </div>
                <p className="row-text">{a.blurb}</p>
              </article>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="ins-empty">
              {t('insights-no-match', { defaultValue: 'No insights match this category yet.' })}
            </p>
          ) : null}
        </div>
      </section>

      <div className="wrap">
        <hr className="rule rv-rule" />
      </div>

      <section className="sec">
        <div className="wrap">
          <div className="offset">
            <h2 className="h2 o-head rv">
              {t('cta-heading', { defaultValue: 'Get our perspectives in your inbox.' })}
            </h2>
            <div className="o-body rv d1 stack">
              <p>
                {t('cta-body', {
                  defaultValue:
                    "Subscribe for research and commentary from across the platform. We send what's worth reading, and nothing else.",
                })}
              </p>
              <Link className="cta" to="/rmh-capital/contact" search={{ type: 'General Inquiry' }}>
                {t('cta-subscribe', { defaultValue: 'Subscribe' })} <ArrowIcon />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
