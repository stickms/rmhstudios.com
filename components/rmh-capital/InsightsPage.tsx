import { useState } from 'react';
import { Link } from '@tanstack/react-router';

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
  const [active, setActive] = useState<string>('all');

  return (
    <>
      <section className="pagehead">
        <div className="container pagehead-inner">
          <span className="eyebrow reveal">Insights</span>
          <h1 className="serif reveal d1">Intelligence from across the platform.</h1>
          <p className="lede reveal d2">
            Research and commentary from the teams advising on the deals, markets, and companies shaping the year ahead —
            written for the people who have to act on it.
          </p>
        </div>
      </section>

      <section className="section tight">
        <div className="container">
          {/* FEATURED */}
          <div className="featured reveal">
            <a className="featured-main" href="#">
              <span className="metaline">Markets <span className="dot" /> <span className="t">8 min read</span></span>
              <h3>The 2026 capital cycle: where conviction meets discipline</h3>
              <p>
                Our markets and investment-banking teams on the conditions reshaping issuance, M&amp;A, and private capital
                — and how the firm's clients are positioning for what comes next.
              </p>
            </a>
            <div className="featured-side">
              <a className="fside-item" href="#">
                <span className="metaline">Venture Capital</span>
                <h4>What the strongest founders get right before their first round</h4>
                <p>Patterns from across our accelerator cohorts.</p>
              </a>
              <a className="fside-item" href="#">
                <span className="metaline">Risk &amp; Regulation</span>
                <h4>Reading the new capital rules without overreacting to them</h4>
                <p>A practical view on the Basel III endgame.</p>
              </a>
              <a className="fside-item" href="#">
                <span className="metaline">Private Equity</span>
                <h4>Impact housing as an institutional asset class</h4>
                <p>Returns and resilience in affordable housing.</p>
              </a>
            </div>
          </div>

          {/* FILTERS */}
          <div className="filters reveal" role="group" aria-label="Filter insights by category">
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
                  <span className="rd">Read →</span>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section tight">
        <div className="container">
          <div className="cta-band reveal">
            <span className="eyebrow center">Stay Informed</span>
            <h2 style={{ marginTop: 18 }}>Get our perspectives in your inbox.</h2>
            <p>Subscribe for research and commentary from across the platform. We send what's worth reading, and nothing else.</p>
            <Link className="btn btn-gold" to="/rmh-capital/contact" search={{ type: 'General Inquiry' }}>
              Subscribe <span className="arw">→</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
