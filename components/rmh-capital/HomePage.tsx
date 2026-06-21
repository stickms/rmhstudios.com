import { Link } from '@tanstack/react-router';
import { MarketsTicker } from './shared';

export default function HomePage() {
  return (
    <>
      {/* ══ HERO — gold great-circle arc signature ══ */}
      <section className="hero">
        <div className="hero-bg" aria-hidden="true">
          <svg className="hero-arc" viewBox="0 0 600 600" fill="none" preserveAspectRatio="xMidYMid meet">
            <g className="spin-slow" stroke="#C8A24A">
              <circle cx="300" cy="300" r="268" strokeOpacity="0.16" />
              <ellipse cx="300" cy="300" rx="268" ry="96" strokeOpacity="0.13" />
              <ellipse cx="300" cy="300" rx="268" ry="184" strokeOpacity="0.10" />
              <ellipse cx="300" cy="300" rx="120" ry="268" strokeOpacity="0.10" />
              <ellipse cx="300" cy="300" rx="210" ry="268" strokeOpacity="0.08" />
              <g strokeOpacity="0.45">
                <line x1="300" y1="32" x2="300" y2="52" /><line x1="300" y1="548" x2="300" y2="568" />
                <line x1="32" y1="300" x2="52" y2="300" /><line x1="548" y1="300" x2="568" y2="300" />
              </g>
            </g>
            <path className="arc-draw" d="M 96 470 A 268 268 0 0 1 470 96" stroke="#E3C277" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="96" cy="470" r="6" fill="#E3C277" />
            <circle cx="470" cy="96" r="6" fill="#E3C277" />
          </svg>
        </div>
        <div className="container hero-content">
          <span className="eyebrow reveal">An integrated financial platform</span>
          <h1 className="serif reveal d1">Capital, advisory, and intelligence across the full company arc</h1>
          <p className="lede reveal d2">
            RMH Capital partners with founders, corporations, and institutions across investment banking, markets,
            corporate banking, venture, consulting, and private equity — one platform for every stage a company moves
            through.
          </p>
          <div className="hero-actions reveal d3">
            <Link className="btn btn-gold" to="/rmh-capital/firm">
              Explore our firm <span className="arw">→</span>
            </Link>
            <Link className="btn btn-outline" to="/rmh-capital/businesses">
              Our businesses <span className="arw">→</span>
            </Link>
          </div>
        </div>
      </section>

      <MarketsTicker />

      {/* ══ STAT BAND ══ */}
      <section className="statband" aria-label="Platform at a glance">
        <div className="stat reveal"><div className="v">6</div><div className="k">Integrated businesses under one platform</div></div>
        <div className="stat reveal d1"><div className="v">1</div><div className="k">Shared client view, from first round to public markets</div></div>
        <div className="stat reveal d2"><div className="v">20+</div><div className="k">Markets served across the Americas, Europe, and Asia</div></div>
        <div className="stat reveal d3"><div className="v">2026</div><div className="k">A platform built for the next generation of companies</div></div>
      </section>

      {/* ══ OUR FIRM ══ */}
      <section className="section">
        <div className="container">
          <div className="feature">
            <div className="feature-copy reveal">
              <span className="eyebrow">Our Firm</span>
              <h3>One firm, organized around the client — not the product.</h3>
              <p>
                Most financial institutions are built as a federation of product lines. RMH Capital is built the other
                way around: a single platform that follows a client through every stage of their growth, from the first
                venture round to large-cap M&amp;A, from a revolving credit line to a public listing.
              </p>
              <p>
                That structure lets us bring the whole firm to a single relationship — advisory, capital, and
                intelligence — with the judgment and discretion our clients expect.
              </p>
              <Link className="btn-text" to="/rmh-capital/firm">
                Read about our firm <span className="arw">→</span>
              </Link>
            </div>
            <div className="feature-media reveal d1" aria-hidden="true">
              <svg viewBox="0 0 400 300" width="78%" fill="none" stroke="#C8A24A" strokeOpacity="0.6" strokeWidth="1.2">
                <circle cx="200" cy="150" r="22" stroke="#E3C277" strokeOpacity="1" />
                <g strokeOpacity="0.4"><circle cx="200" cy="150" r="70" /><circle cx="200" cy="150" r="118" /></g>
                <g fill="#C8A24A" stroke="none">
                  <circle cx="200" cy="32" r="3.5" /><circle cx="302" cy="91" r="3.5" /><circle cx="302" cy="209" r="3.5" /><circle cx="200" cy="268" r="3.5" /><circle cx="98" cy="209" r="3.5" /><circle cx="98" cy="91" r="3.5" />
                </g>
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* ══ OUR BUSINESSES ══ */}
      <section className="section">
        <div className="container">
          <div className="shead reveal">
            <span className="eyebrow">Our Businesses</span>
            <h2 className="serif">Six businesses. One continuous relationship.</h2>
            <p className="lede">
              Each business is a leader in its discipline. Together, they let a client raise, grow, advise, transact,
              and own — without ever leaving the platform.
            </p>
          </div>
          <div className="cards c3 reveal">
            <Link className="card" to="/rmh-capital/businesses" hash="investment-banking">
              <span className="ix">01</span><h3>Investment Banking</h3>
              <span className="card-brand">RMHan Stanley</span>
              <p>M&amp;A advisory, equity and debt capital markets, and leveraged finance for companies at every scale.</p>
              <span className="card-link">Learn more <span className="arw">→</span></span>
            </Link>
            <Link className="card" to="/rmh-capital/businesses" hash="markets">
              <span className="ix">02</span><h3>Markets</h3>
              <span className="card-brand">RMH Street</span>
              <p>Sales, trading, research, and liquidity across equities, credit, and rates for institutional clients.</p>
              <span className="card-link">Learn more <span className="arw">→</span></span>
            </Link>
            <Link className="card" to="/rmh-capital/businesses" hash="corporate-banking">
              <span className="ix">03</span><h3>Corporate Banking</h3>
              <p>Credit facilities, structured lending, and treasury solutions that scale with a growing company.</p>
              <span className="card-link">Learn more <span className="arw">→</span></span>
            </Link>
            <Link className="card" to="/rmh-capital/businesses" hash="venture-capital">
              <span className="ix">04</span><h3>Venture Capital</h3>
              <span className="card-brand">RMHCombinator</span>
              <p>Early-stage capital, an accelerator, and a venture studio backing founders from the very first round.</p>
              <span className="card-link">Learn more <span className="arw">→</span></span>
            </Link>
            <Link className="card" to="/rmh-capital/businesses" hash="management-consulting">
              <span className="ix">05</span><h3>Management Consulting</h3>
              <span className="card-brand">RMHcKinsey</span>
              <p>Strategy, operations, and transformation advisory delivered alongside the firm's capital and markets reach.</p>
              <span className="card-link">Learn more <span className="arw">→</span></span>
            </Link>
            <Link className="card" to="/rmh-capital/businesses" hash="private-equity">
              <span className="ix">06</span><h3>Private Equity</h3>
              <span className="card-brand">RMHstone</span>
              <p>Growth-equity and impact-housing strategies that let the firm own and build alongside its clients.</p>
              <span className="card-link">Learn more <span className="arw">→</span></span>
            </Link>
            <div className="card" style={{ background: 'linear-gradient(150deg,var(--ink),var(--void))' }}>
              <span className="ix">→</span><h3>See the full platform</h3>
              <p>How six businesses share clients, intelligence, and capital to create advantage no single-product firm can match.</p>
              <Link className="card-link" to="/rmh-capital/businesses">All businesses <span className="arw">→</span></Link>
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* ══ INSIGHTS / LATEST PERSPECTIVES ══ */}
      <section className="section">
        <div className="container">
          <div className="shead reveal">
            <span className="eyebrow">Latest Perspectives</span>
            <h2 className="serif">Intelligence from across the platform.</h2>
            <p className="lede">
              Research and commentary from the teams advising on the deals, markets, and companies shaping the year ahead.
            </p>
          </div>

          <div className="featured reveal">
            <Link className="featured-main" to="/rmh-capital/insights">
              <span className="metaline">Markets <span className="dot" /> <span className="t">Outlook</span></span>
              <h3>The 2026 capital cycle: where conviction meets discipline</h3>
              <p>
                Our markets and investment-banking teams on the conditions reshaping issuance, M&amp;A, and private capital
                — and how clients are positioning for them.
              </p>
            </Link>
            <div className="featured-side">
              <Link className="fside-item" to="/rmh-capital/insights">
                <span className="metaline">Venture Capital</span>
                <h4>What the strongest founders get right before their first round</h4>
                <p>Lessons from across our accelerator cohorts.</p>
              </Link>
              <Link className="fside-item" to="/rmh-capital/insights">
                <span className="metaline">Risk &amp; Regulation</span>
                <h4>Reading the new capital rules without overreacting to them</h4>
                <p>A practical view on Basel III endgame.</p>
              </Link>
              <Link className="fside-item" to="/rmh-capital/insights">
                <span className="metaline">Private Equity</span>
                <h4>Impact housing as an institutional asset class</h4>
                <p>Returns and resilience in affordable housing.</p>
              </Link>
            </div>
          </div>
          <Link className="btn-text reveal" to="/rmh-capital/insights">All insights <span className="arw">→</span></Link>
        </div>
      </section>

      <hr className="rule" />

      {/* ══ GLOBAL PLATFORM ══ */}
      <section className="section">
        <div className="container">
          <div className="feature flip">
            <div className="feature-media reveal" aria-hidden="true">
              <svg viewBox="0 0 400 320" width="86%" fill="none">
                <g stroke="#C8A24A" strokeOpacity="0.4" strokeWidth="1">
                  <circle cx="200" cy="160" r="140" />
                  <ellipse cx="200" cy="160" rx="140" ry="50" />
                  <ellipse cx="200" cy="160" rx="140" ry="100" />
                  <ellipse cx="200" cy="160" rx="62" ry="140" />
                  <line x1="60" y1="160" x2="340" y2="160" />
                </g>
                <path d="M 96 268 A 140 140 0 0 1 304 52" stroke="#E3C277" strokeWidth="2" fill="none" strokeLinecap="round" />
                <g fill="#E3C277"><circle cx="96" cy="268" r="4.5" /><circle cx="304" cy="52" r="4.5" /></g>
                <g fill="#C8A24A"><circle cx="150" cy="120" r="3" /><circle cx="250" cy="200" r="3" /><circle cx="265" cy="115" r="3" /></g>
              </svg>
            </div>
            <div className="feature-copy reveal d1">
              <span className="eyebrow">Global Platform</span>
              <h3>Local judgment, global reach.</h3>
              <p>
                Our clients operate across borders, and so do we. RMH Capital connects teams across the Americas, Europe,
                and Asia, giving every relationship access to the firm's full capabilities wherever opportunity arises.
              </p>
              <p>
                One coordinated platform means a client in any market gets the same standard of advice, the same risk
                discipline, and the same access to capital.
              </p>
              <Link className="btn-text" to="/rmh-capital/firm">Inside the platform <span className="arw">→</span></Link>
            </div>
          </div>
        </div>
      </section>

      {/* ══ CAREERS CTA ══ */}
      <section className="section tight">
        <div className="container">
          <div className="cta-band reveal">
            <span className="eyebrow center">Careers</span>
            <h2 style={{ marginTop: 18 }}>Build a career across the whole company arc.</h2>
            <p>
              From analyst programs to engineering and senior advisory roles, RMH Capital is a place to do the most
              interesting work in finance — and to grow with a platform built for the long term.
            </p>
            <Link className="btn btn-gold" to="/rmh-capital/careers">Explore careers <span className="arw">→</span></Link>
          </div>
        </div>
      </section>
    </>
  );
}
