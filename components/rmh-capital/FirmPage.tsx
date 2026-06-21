import { Link } from '@tanstack/react-router';

export default function FirmPage() {
  return (
    <>
      {/* PAGE HEADER */}
      <section className="pagehead">
        <div className="container pagehead-inner">
          <span className="eyebrow reveal">Our Firm</span>
          <h1 className="serif reveal d1">A firm built around the client, not the product.</h1>
          <p className="lede reveal d2">
            RMH Capital is an integrated investment bank and financial platform. We bring advisory, capital, and
            intelligence to a single relationship — and we stay with our clients through every stage of their growth.
          </p>
        </div>
      </section>

      {/* MISSION */}
      <section className="section">
        <div className="container">
          <div className="feature">
            <div className="reveal">
              <span className="eyebrow">Our Mission</span>
              <h3>Serve a client across the full arc of their journey.</h3>
            </div>
            <div className="prose reveal d1">
              <p>
                Most financial institutions are organized as a federation of product lines, each optimizing for its own
                mandate. The result is a client experience that fragments at exactly the moments that matter most — a
                financing that doesn't talk to an acquisition, advice that ends where capital begins.
              </p>
              <p>
                We built RMH Capital the other way around. One platform follows a company from its first venture round to
                large-cap M&amp;A, from a revolving credit line to a public listing and beyond. Every interaction deepens
                what we know, and lowers the cost of serving the next need.
              </p>
              <p>
                Our mission is simple to state and demanding to live: be the firm a client can rely on at every stage, and
                earn that trust through judgment, discretion, and results.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PULL QUOTE */}
      <section className="section tight">
        <div className="container">
          <blockquote className="pullquote reveal">
            <span className="lc">Durable advantage</span> belongs to the firm that serves a client across the full arc of
            their journey — not the firm that sells one product and walks away.
          </blockquote>
          <p className="attrib reveal d1">— The RMH Capital platform thesis</p>
        </div>
      </section>

      <hr className="rule" />

      {/* VALUES */}
      <section className="section">
        <div className="container">
          <div className="shead reveal">
            <span className="eyebrow">What We Value</span>
            <h2 className="serif">The principles behind every decision.</h2>
          </div>
          <div className="valuegrid">
            <div className="value reveal"><h3>Clients first</h3><p>We measure ourselves on the total value of a relationship over its lifetime, not the revenue of a single transaction. The client's outcome leads.</p></div>
            <div className="value reveal d1"><h3>Risk discipline</h3><p>A unified risk and compliance framework runs across every business. We protect the firm and our clients by understanding exposure before we take it.</p></div>
            <div className="value reveal d2"><h3>Intellectual rigor</h3><p>We hire people who think for themselves and argue for the right answer. Strong opinions are welcome; sloppy reasoning is not.</p></div>
            <div className="value reveal"><h3>Integrity, without exception</h3><p>Confidentiality and ethics walls are non-negotiable. Our reputation is the asset every business depends on.</p></div>
            <div className="value reveal d1"><h3>One firm</h3><p>Bankers here are advisors first and product specialists second. We are rewarded for bringing the whole platform to a client, not for guarding territory.</p></div>
            <div className="value reveal d2"><h3>The long term</h3><p>We build relationships, businesses, and careers to last. Short-term wins that compromise the franchise are not wins at all.</p></div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* LEADERSHIP PHILOSOPHY */}
      <section className="section">
        <div className="container">
          <div className="feature flip">
            <div className="feature-media reveal" aria-hidden="true">
              <svg viewBox="0 0 400 320" width="84%" fill="none">
                <g stroke="#C8A24A" strokeOpacity="0.35" strokeWidth="1"><circle cx="200" cy="160" r="130" /><circle cx="200" cy="160" r="78" /><circle cx="200" cy="160" r="30" /></g>
                <path d="M 110 240 A 130 130 0 0 1 300 70" stroke="#E3C277" strokeWidth="2" fill="none" strokeLinecap="round" />
                <g fill="#C8A24A"><circle cx="200" cy="30" r="3" /><circle cx="330" cy="160" r="3" /><circle cx="200" cy="290" r="3" /><circle cx="70" cy="160" r="3" /></g>
                <circle cx="200" cy="160" r="5" fill="#E3C277" />
              </svg>
            </div>
            <div className="reveal d1">
              <span className="eyebrow">Leadership Philosophy</span>
              <h3>Decisions close to the client, accountability across the firm.</h3>
              <p>
                Each business leader carries full ownership of their results, with the autonomy to compete in fast-moving
                markets. That autonomy operates inside firm-wide risk and financial controls, so independence never
                becomes isolation.
              </p>
              <p>
                Our leaders are evaluated on three things in equal measure: performance against plan, the strength of
                client relationships, and an unblemished compliance record. Get one without the others, and you have not
                done the job.
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* PLATFORM STRATEGY */}
      <section className="section">
        <div className="container">
          <div className="shead reveal">
            <span className="eyebrow">Platform Strategy</span>
            <h2 className="serif">How the platform compounds.</h2>
            <p className="lede">
              Integration is engineered, not hoped for. Three structural connectors turn six businesses into one
              advantage.
            </p>
          </div>
          <div className="cards c3 reveal">
            <div className="card"><span className="ix">01</span><h3>One client record</h3><p>A shared view of every relationship across all businesses, so the firm always sees the whole client — not one transaction at a time.</p></div>
            <div className="card"><span className="ix">02</span><h3>One risk framework</h3><p>A unified approach to risk and compliance keeps exposures coherent and ethics walls intact as a client moves between advisory, markets, and lending.</p></div>
            <div className="card"><span className="ix">03</span><h3>One incentive</h3><p>We reward collaboration over territory. Teams are measured on the value they create for the client across the platform, over the life of the relationship.</p></div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section tight">
        <div className="container">
          <div className="cta-band reveal">
            <span className="eyebrow center">Work With Us</span>
            <h2 style={{ marginTop: 18 }}>Bring the whole firm to your next decision.</h2>
            <p>Whether you're raising your first round or weighing a transformative acquisition, our teams are ready to help.</p>
            <Link className="btn btn-gold" to="/rmh-capital/contact">Contact RMH Capital <span className="arw">→</span></Link>
          </div>
        </div>
      </section>
    </>
  );
}
