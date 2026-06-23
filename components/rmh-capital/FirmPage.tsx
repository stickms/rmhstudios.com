import { Link } from '@tanstack/react-router';
import { useTranslation } from "react-i18next";

export default function FirmPage() {
  const { t } = useTranslation("c-rmh-capital");

  return (
    <>
      {/* PAGE HEADER */}
      <section className="pagehead">
        <div className="container pagehead-inner">
          <span className="eyebrow reveal">{t("our-firm", { defaultValue: "Our Firm" })}</span>
          <h1 className="serif reveal d1">{t("hero-heading", { defaultValue: "A firm built around the client, not the product." })}</h1>
          <p className="lede reveal d2">
            {t("hero-lede", { defaultValue: "RMH Capital is an integrated investment bank and financial platform. We bring advisory, capital, and intelligence to a single relationship — and we stay with our clients through every stage of their growth." })}
          </p>
        </div>
      </section>

      {/* MISSION */}
      <section className="section">
        <div className="container">
          <div className="feature">
            <div className="reveal">
              <span className="eyebrow">{t("our-mission", { defaultValue: "Our Mission" })}</span>
              <h3>{t("mission-heading", { defaultValue: "Serve a client across the full arc of their journey." })}</h3>
            </div>
            <div className="prose reveal d1">
              <p>
                {t("mission-p1", { defaultValue: "Most financial institutions are organized as a federation of product lines, each optimizing for its own mandate. The result is a client experience that fragments at exactly the moments that matter most — a financing that doesn't talk to an acquisition, advice that ends where capital begins." })}
              </p>
              <p>
                {t("mission-p2", { defaultValue: "We built RMH Capital the other way around. One platform follows a company from its first venture round to large-cap M&A, from a revolving credit line to a public listing and beyond. Every interaction deepens what we know, and lowers the cost of serving the next need." })}
              </p>
              <p>
                {t("mission-p3", { defaultValue: "Our mission is simple to state and demanding to live: be the firm a client can rely on at every stage, and earn that trust through judgment, discretion, and results." })}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PULL QUOTE */}
      <section className="section tight">
        <div className="container">
          <blockquote className="pullquote reveal">
            <span className="lc">{t("durable-advantage", { defaultValue: "Durable advantage" })}</span> {t("pullquote-body", { defaultValue: "belongs to the firm that serves a client across the full arc of their journey — not the firm that sells one product and walks away." })}
          </blockquote>
          <p className="attrib reveal d1">{t("pullquote-attrib", { defaultValue: "— The RMH Capital platform thesis" })}</p>
        </div>
      </section>

      <hr className="rule" />

      {/* VALUES */}
      <section className="section">
        <div className="container">
          <div className="shead reveal">
            <span className="eyebrow">{t("what-we-value", { defaultValue: "What We Value" })}</span>
            <h2 className="serif">{t("values-heading", { defaultValue: "The principles behind every decision." })}</h2>
          </div>
          <div className="valuegrid">
            <div className="value reveal"><h3>{t("value-clients-first-title", { defaultValue: "Clients first" })}</h3><p>{t("value-clients-first-body", { defaultValue: "We measure ourselves on the total value of a relationship over its lifetime, not the revenue of a single transaction. The client's outcome leads." })}</p></div>
            <div className="value reveal d1"><h3>{t("value-risk-discipline-title", { defaultValue: "Risk discipline" })}</h3><p>{t("value-risk-discipline-body", { defaultValue: "A unified risk and compliance framework runs across every business. We protect the firm and our clients by understanding exposure before we take it." })}</p></div>
            <div className="value reveal d2"><h3>{t("value-intellectual-rigor-title", { defaultValue: "Intellectual rigor" })}</h3><p>{t("value-intellectual-rigor-body", { defaultValue: "We hire people who think for themselves and argue for the right answer. Strong opinions are welcome; sloppy reasoning is not." })}</p></div>
            <div className="value reveal"><h3>{t("value-integrity-title", { defaultValue: "Integrity, without exception" })}</h3><p>{t("value-integrity-body", { defaultValue: "Confidentiality and ethics walls are non-negotiable. Our reputation is the asset every business depends on." })}</p></div>
            <div className="value reveal d1"><h3>{t("value-one-firm-title", { defaultValue: "One firm" })}</h3><p>{t("value-one-firm-body", { defaultValue: "Bankers here are advisors first and product specialists second. We are rewarded for bringing the whole platform to a client, not for guarding territory." })}</p></div>
            <div className="value reveal d2"><h3>{t("value-long-term-title", { defaultValue: "The long term" })}</h3><p>{t("value-long-term-body", { defaultValue: "We build relationships, businesses, and careers to last. Short-term wins that compromise the franchise are not wins at all." })}</p></div>
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
              <span className="eyebrow">{t("leadership-philosophy", { defaultValue: "Leadership Philosophy" })}</span>
              <h3>{t("leadership-heading", { defaultValue: "Decisions close to the client, accountability across the firm." })}</h3>
              <p>
                {t("leadership-p1", { defaultValue: "Each business leader carries full ownership of their results, with the autonomy to compete in fast-moving markets. That autonomy operates inside firm-wide risk and financial controls, so independence never becomes isolation." })}
              </p>
              <p>
                {t("leadership-p2", { defaultValue: "Our leaders are evaluated on three things in equal measure: performance against plan, the strength of client relationships, and an unblemished compliance record. Get one without the others, and you have not done the job." })}
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
            <span className="eyebrow">{t("platform-strategy", { defaultValue: "Platform Strategy" })}</span>
            <h2 className="serif">{t("platform-heading", { defaultValue: "How the platform compounds." })}</h2>
            <p className="lede">
              {t("platform-lede", { defaultValue: "Integration is engineered, not hoped for. Three structural connectors turn six businesses into one advantage." })}
            </p>
          </div>
          <div className="cards c3 reveal">
            <div className="card"><span className="ix">01</span><h3>{t("card1-title", { defaultValue: "One client record" })}</h3><p>{t("card1-body", { defaultValue: "A shared view of every relationship across all businesses, so the firm always sees the whole client — not one transaction at a time." })}</p></div>
            <div className="card"><span className="ix">02</span><h3>{t("card2-title", { defaultValue: "One risk framework" })}</h3><p>{t("card2-body", { defaultValue: "A unified approach to risk and compliance keeps exposures coherent and ethics walls intact as a client moves between advisory, markets, and lending." })}</p></div>
            <div className="card"><span className="ix">03</span><h3>{t("card3-title", { defaultValue: "One incentive" })}</h3><p>{t("card3-body", { defaultValue: "We reward collaboration over territory. Teams are measured on the value they create for the client across the platform, over the life of the relationship." })}</p></div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section tight">
        <div className="container">
          <div className="cta-band reveal">
            <span className="eyebrow center">{t("work-with-us", { defaultValue: "Work With Us" })}</span>
            <h2 style={{ marginTop: 18 }}>{t("cta-heading", { defaultValue: "Bring the whole firm to your next decision." })}</h2>
            <p>{t("cta-body", { defaultValue: "Whether you're raising your first round or weighing a transformative acquisition, our teams are ready to help." })}</p>
            <Link className="btn btn-gold" to="/rmh-capital/contact">{t("cta-link", { defaultValue: "Contact RMH Capital" })} <span className="arw">→</span></Link>
          </div>
        </div>
      </section>
    </>
  );
}
