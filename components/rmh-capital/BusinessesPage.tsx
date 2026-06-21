import { Link } from '@tanstack/react-router';

export default function BusinessesPage() {
  return (
    <>
      <section className="pagehead">
        <div className="container pagehead-inner">
          <span className="eyebrow reveal">Our Businesses</span>
          <h1 className="serif reveal d1">Six businesses. One continuous relationship.</h1>
          <p className="lede reveal d2">
            Each business leads in its discipline. Together, they let a client raise, grow, advise, transact, and own —
            every step ordered along the arc a company travels, from first round to public markets and beyond.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          {/* 01 IB */}
          <article className="biz" id="investment-banking">
            <div className="reveal">
              <div className="biz-stage">Advise &amp; raise</div>
              <h2>Investment Banking</h2>
              <div className="biz-brand">RMHan Stanley</div>
              <span className="biz-num">01 / 06</span>
            </div>
            <div className="reveal d1">
              <p>
                We advise companies on the decisions that define them — mergers and acquisitions, public offerings, and
                complex financings. Sector teams pair deep industry knowledge with the full reach of the platform, so a
                single mandate can draw on markets, lending, and capital across the firm.
              </p>
              <ul className="caps">
                <li>Mergers &amp; acquisitions</li><li>Equity capital markets</li><li>Debt capital markets</li>
                <li>Leveraged finance</li><li>Industry coverage</li>
              </ul>
            </div>
          </article>

          {/* 02 Markets */}
          <article className="biz flip" id="markets">
            <div className="biz-media reveal" aria-hidden="true">
              <svg viewBox="0 0 300 300" width="70%" fill="none"><g stroke="#C8A24A" strokeOpacity=".4"><path d="M30 220 L80 160 L120 190 L170 110 L220 150 L270 70" stroke="#E3C277" strokeWidth="2" fill="none" /><line x1="30" y1="250" x2="270" y2="250" strokeOpacity=".25" /></g><g fill="#C8A24A"><circle cx="80" cy="160" r="3" /><circle cx="170" cy="110" r="3" /><circle cx="270" cy="70" r="3" /></g></svg>
            </div>
            <div className="reveal d1">
              <div className="biz-stage">Execute &amp; access</div>
              <h2>Markets</h2>
              <div className="biz-brand">RMH Street</div>
              <span className="biz-num">02 / 06</span>
              <p style={{ marginTop: 20 }}>
                Our markets business connects institutional clients to liquidity across equities, credit, and rates.
                Sales, trading, and research work as one team, delivering execution, market intelligence, and a clear
                read on conditions — built to serve the mid-market clients larger banks overlook.
              </p>
              <ul className="caps"><li>Equities</li><li>Credit &amp; rates</li><li>Electronic execution</li><li>Research</li><li>Market-making</li></ul>
            </div>
          </article>

          {/* 03 Corp Banking */}
          <article className="biz" id="corporate-banking">
            <div className="reveal">
              <div className="biz-stage">Fund &amp; grow</div>
              <h2>Corporate Banking</h2>
              <span className="biz-num">03 / 06</span>
            </div>
            <div className="reveal d1">
              <p>
                As companies scale, they need credit that scales with them. We provide revolving facilities, term loans,
                and structured lending alongside treasury and cash-management solutions — a banking relationship designed
                to grow into capital markets and advisory as the company matures.
              </p>
              <ul className="caps"><li>Revolving credit</li><li>Term lending</li><li>Structured finance</li><li>Treasury services</li><li>Relationship banking</li></ul>
            </div>
          </article>

          {/* 04 VC */}
          <article className="biz" id="venture-capital">
            <div className="reveal">
              <div className="biz-stage">Back &amp; build</div>
              <h2>Venture Capital</h2>
              <div className="biz-brand">RMHCombinator</div>
              <span className="biz-num">04 / 06</span>
            </div>
            <div className="reveal d1">
              <p>
                We meet founders at the very beginning. Through an accelerator, an early-stage fund, and a venture studio,
                we provide first capital, hands-on support, and a network — the start of a relationship that can carry a
                company all the way to the public markets, with the whole firm behind it.
              </p>
              <ul className="caps"><li>Accelerator</li><li>Seed &amp; early-stage fund</li><li>Venture studio</li><li>Founder services</li></ul>
            </div>
          </article>

          {/* 05 Consulting */}
          <article className="biz flip" id="management-consulting">
            <div className="biz-media reveal" aria-hidden="true">
              <svg viewBox="0 0 300 300" width="68%" fill="none"><g stroke="#C8A24A" strokeOpacity=".4"><circle cx="110" cy="120" r="46" /><circle cx="190" cy="180" r="46" /></g><circle cx="150" cy="150" r="14" fill="none" stroke="#E3C277" strokeWidth="2" /></svg>
            </div>
            <div className="reveal d1">
              <div className="biz-stage">Strategize &amp; transform</div>
              <h2>Management Consulting</h2>
              <div className="biz-brand">RMHcKinsey</div>
              <span className="biz-num">05 / 06</span>
              <p style={{ marginTop: 20 }}>
                Strategy and execution advisory, delivered with the firm's capital and markets reach at hand. Our
                consultants work on the questions that change a company's trajectory — strategy, operations,
                organization, and digital transformation — and stay accountable for results, not slideware.
              </p>
              <ul className="caps"><li>Corporate strategy</li><li>Operations</li><li>Organization design</li><li>Digital transformation</li></ul>
            </div>
          </article>

          {/* 06 PE */}
          <article className="biz" id="private-equity">
            <div className="reveal">
              <div className="biz-stage">Own &amp; compound</div>
              <h2>Private Equity</h2>
              <div className="biz-brand">RMHstone</div>
              <span className="biz-num">06 / 06</span>
            </div>
            <div className="reveal d1">
              <p>
                At the far end of the arc, we invest our own conviction. Through growth-equity and impact-housing
                strategies, RMH Capital takes ownership positions alongside the companies and communities we know best —
                closing the loop between advising a client and building value with them.
              </p>
              <ul className="caps"><li>Growth equity</li><li>Impact housing</li><li>Co-investment</li><li>Long-term ownership</li></ul>
            </div>
          </article>
        </div>
      </section>

      <section className="section tight">
        <div className="container">
          <div className="cta-band reveal">
            <span className="eyebrow center">One Platform</span>
            <h2 style={{ marginTop: 18 }}>The advantage is in the connections.</h2>
            <p>
              A founder we back through venture can become a banking client, an advisory client, and a co-investment
              partner over a decade. Talk to us about where you are on the arc.
            </p>
            <Link className="btn btn-gold" to="/rmh-capital/contact">Start a conversation <span className="arw">→</span></Link>
          </div>
        </div>
      </section>
    </>
  );
}
