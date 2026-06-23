import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from "react-i18next";

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
  { cat: 'investment-banking', meta: 'Investment Banking', read: '6 min', title: 'Why founder-led targets are reshaping M&A', blurb: 'The fastest-growing acquisition targets are run by their founders. That changes who wins the mandate, and why.' },
  { cat: 'technology', meta: 'Technology', read: '5 min', title: 'Building a single client view across six businesses', blurb: "The engineering behind one shared record — and why it's the platform's quietest advantage." },
  { cat: 'strategy', meta: 'Strategy', read: '7 min', title: 'The integrated platform: an old idea, finally workable', blurb: 'Why convergence in capital, technology, and client expectations makes the full-arc firm possible now.' },
  { cat: 'markets', meta: 'Markets', read: '5 min', title: 'Liquidity for the mid-market: an underserved opportunity', blurb: "The clients below the bulge-bracket threshold are overlooked. We think that's a mistake." },
  { cat: 'venture-capital', meta: 'Venture Capital', read: '9 min', title: 'From accelerator to IPO: anatomy of a ten-year relationship', blurb: 'How an early bet compounds into advisory, banking, and capital-markets value over a decade.' },
  { cat: 'private-equity', meta: 'Private Equity', read: '6 min', title: 'Underwriting affordable housing through the cycle', blurb: 'What LIHTC and HUD structures look like when you hold them for the long term.' },
  { cat: 'risk', meta: 'Risk & Regulation', read: '8 min', title: 'Volcker, Basel, and the art of staying nimble', blurb: 'Compliance as a capability, not a cost — how disciplined firms turn rules into an edge.' },
  { cat: 'technology', meta: 'Technology', read: '4 min', title: 'What real-time risk infrastructure changes', blurb: 'When the firm can see exposure as it forms, risk discipline stops being a quarterly exercise.' },
  { cat: 'investment-banking', meta: 'Investment Banking', read: '5 min', title: 'Equity markets reopen: a window, not a wave', blurb: 'Issuers that prepared during the quiet are the ones moving first. Readiness is the strategy.' },
  { cat: 'strategy', meta: 'Strategy', read: '6 min', title: 'How we measure a relationship, not a transaction', blurb: "Lifetime client value sounds like a slogan. Here's how it actually changes incentives." },
  { cat: 'markets', meta: 'Markets', read: '7 min', title: 'Credit spreads and the patience premium', blurb: 'Why the best entry points in credit reward the investors willing to wait for them.' },
  { cat: 'venture-capital', meta: 'Venture Capital', read: '5 min', title: "The case for being a founder's first call", blurb: 'Pre-institutional relationships are the most exclusive — and the most durable — in finance.' },
];

export default function InsightsPage() {
  const { t } = useTranslation("c-rmh-capital");
  const [active, setActive] = useState<string>('all');

  return (
    <>
      <section className="pagehead">
        <div className="container pagehead-inner">
          <span className="eyebrow reveal">{t("insights-eyebrow", { defaultValue: "Insights" })}</span>
          <h1 className="serif reveal d1">{t("insights-heading", { defaultValue: "Intelligence from across the platform." })}</h1>
          <p className="lede reveal d2">
            {t("insights-lede", { defaultValue: "Research and commentary from the teams advising on the deals, markets, and companies shaping the year ahead — written for the people who have to act on it." })}
          </p>
        </div>
      </section>

      <section className="section tight">
        <div className="container">
          {/* FEATURED */}
          <div className="featured reveal">
            <a className="featured-main" href="#">
              <span className="metaline">{t("featured-main-metaline", { defaultValue: "Markets" })} <span className="dot" /> <span className="t">{t("featured-main-read", { defaultValue: "8 min read" })}</span></span>
              <h3>{t("featured-main-title", { defaultValue: "The 2026 capital cycle: where conviction meets discipline" })}</h3>
              <p>
                {t("featured-main-blurb", { defaultValue: "Our markets and investment-banking teams on the conditions reshaping issuance, M&A, and private capital — and how the firm's clients are positioning for what comes next." })}
              </p>
            </a>
            <div className="featured-side">
              <a className="fside-item" href="#">
                <span className="metaline">{t("fside-1-metaline", { defaultValue: "Venture Capital" })}</span>
                <h4>{t("fside-1-title", { defaultValue: "What the strongest founders get right before their first round" })}</h4>
                <p>{t("fside-1-blurb", { defaultValue: "Patterns from across our accelerator cohorts." })}</p>
              </a>
              <a className="fside-item" href="#">
                <span className="metaline">{t("fside-2-metaline", { defaultValue: "Risk & Regulation" })}</span>
                <h4>{t("fside-2-title", { defaultValue: "Reading the new capital rules without overreacting to them" })}</h4>
                <p>{t("fside-2-blurb", { defaultValue: "A practical view on the Basel III endgame." })}</p>
              </a>
              <a className="fside-item" href="#">
                <span className="metaline">{t("fside-3-metaline", { defaultValue: "Private Equity" })}</span>
                <h4>{t("fside-3-title", { defaultValue: "Impact housing as an institutional asset class" })}</h4>
                <p>{t("fside-3-blurb", { defaultValue: "Returns and resilience in affordable housing." })}</p>
              </a>
            </div>
          </div>

          {/* FILTERS */}
          <div className="filters reveal" role="group" aria-label={t("filters-aria-label", { defaultValue: "Filter insights by category" })}>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                className="chip"
                aria-pressed={active === c.id}
                onClick={() => setActive(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* GRID */}
          <div className="articlegrid reveal">
            {ARTICLES.map((a, i) => {
              const hidden = active !== 'all' && a.cat !== active;
              return (
                <a key={i} className={`article${hidden ? ' hide' : ''}`} href="#">
                  <span className="metaline">{a.meta} <span className="dot" /> <span className="t">{a.read}</span></span>
                  <h3>{a.title}</h3>
                  <p>{a.blurb}</p>
                  <span className="rd">{t("read-link", { defaultValue: "Read →" })}</span>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section tight">
        <div className="container">
          <div className="cta-band reveal">
            <span className="eyebrow center">{t("cta-eyebrow", { defaultValue: "Stay Informed" })}</span>
            <h2 style={{ marginTop: 18 }}>{t("cta-heading", { defaultValue: "Get our perspectives in your inbox." })}</h2>
            <p>{t("cta-body", { defaultValue: "Subscribe for research and commentary from across the platform. We send what's worth reading, and nothing else." })}</p>
            <Link className="btn btn-gold" to="/rmh-capital/contact" search={{ type: 'General Inquiry' }}>
              {t("cta-subscribe", { defaultValue: "Subscribe" })} <span className="arw">&rarr;</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
