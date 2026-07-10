import { Link } from '@tanstack/react-router';
import { useTranslation } from "react-i18next";

export default function CareersPage() {
  const { t } = useTranslation("c-rmh-capital");
  return (
    <>
      <section className="pagehead">
        <div className="container pagehead-inner">
          <span className="eyebrow reveal">{t("careers-eyebrow", { defaultValue: "Careers" })}</span>
          <h1 className="serif reveal d1">{t("careers-headline", { defaultValue: "Build a career across the whole company arc." })}</h1>
          <p className="lede reveal d2">
            {t("careers-lede", { defaultValue: "RMH Capital is a place to do the most interesting work in finance — advising founders one year and global institutions the next — and to grow with a platform built for the long term." })}
          </p>
          <div className="hero-actions reveal d3" style={{ marginTop: 34 }}>
            <a className="btn btn-gold" href="#open-roles">{t("see-open-roles", { defaultValue: "See open roles" })} <span className="arw">→</span></a>
            <a className="btn btn-outline" href="#culture">{t("our-culture", { defaultValue: "Our culture" })} <span className="arw">→</span></a>
          </div>
        </div>
      </section>

      {/* PATHS */}
      <section className="section">
        <div className="container">
          <div className="shead reveal">
            <span className="eyebrow">{t("ways-in-eyebrow", { defaultValue: "Ways In" })}</span>
            <h2 className="serif">{t("ways-in-headline", { defaultValue: "Find the path that fits where you are." })}</h2>
          </div>
          <div className="pathgrid">
            <div className="path reveal"><span className="ix">01</span><h3>{t("analyst-programs-title", { defaultValue: "Analyst Programs" })}</h3><p>{t("analyst-programs-body", { defaultValue: "Our flagship entry point. Analysts join a business, take on real responsibility early, and learn the platform from the inside through structured training and senior mentorship." })}</p></div>
            <div className="path reveal d1"><span className="ix">02</span><h3>{t("experienced-professionals-title", { defaultValue: "Experienced Professionals" })}</h3><p>{t("experienced-professionals-body", { defaultValue: "For people who have built a track record and want a platform that lets them bring more to every client. We hire across all six businesses and corporate functions." })}</p></div>
            <div className="path reveal"><span className="ix">03</span><h3>{t("engineering-technology-title", { defaultValue: "Engineering & Technology" })}</h3><p>{t("engineering-technology-body", { defaultValue: "The platform runs on the systems our engineers build — shared client data, real-time risk, and the tools our teams use every day. Technology is a first-class discipline here." })}</p></div>
            <div className="path reveal d1"><span className="ix">04</span><h3>{t("campus-recruiting-title", { defaultValue: "Campus Recruiting" })}</h3><p>{t("campus-recruiting-body", { defaultValue: "Internships and graduate roles for students ready to test themselves against the best. We recruit for curiosity and judgment as much as for résumés." })}</p></div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* CULTURE */}
      <section className="section" id="culture">
        <div className="container">
          <div className="feature">
            <div className="reveal">
              <span className="eyebrow">{t("culture-eyebrow", { defaultValue: "Culture" })}</span>
              <h3>{t("culture-headline", { defaultValue: "Elite standards, without the airlessness." })}</h3>
              <p>
                {t("culture-body-1", { defaultValue: "We hold ourselves to a high bar — on judgment, on rigor, on integrity — because our clients trust us with decisions that matter. That standard is the point, not the pressure for its own sake." })}
              </p>
              <p>
                {t("culture-body-2", { defaultValue: "What makes it work is the people. We hire advisors first, specialists second, and we reward the colleagues who bring the whole firm to a problem. Ambition here is collaborative, and the work is genuinely interesting." })}
              </p>
            </div>
            <div className="valuegrid reveal d1" style={{ gridTemplateColumns: '1fr 1fr', gap: 28 }}>
              <div className="value"><h3>{t("value-ownership-title", { defaultValue: "Ownership" })}</h3><p>{t("value-ownership-body", { defaultValue: "Real responsibility early, and the autonomy to act on it." })}</p></div>
              <div className="value"><h3>{t("value-mentorship-title", { defaultValue: "Mentorship" })}</h3><p>{t("value-mentorship-body", { defaultValue: "Senior people who invest in how you think, not just what you produce." })}</p></div>
              <div className="value"><h3>{t("value-mobility-title", { defaultValue: "Mobility" })}</h3><p>{t("value-mobility-body", { defaultValue: "Move across businesses and markets as your interests grow." })}</p></div>
              <div className="value"><h3>{t("value-long-term-title", { defaultValue: "The long term" })}</h3><p>{t("value-long-term-body", { defaultValue: "Careers built to last, on a platform built the same way." })}</p></div>
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* OPEN ROLES CTA */}
      <section className="section" id="open-roles">
        <div className="container">
          <div className="cta-band reveal">
            <span className="eyebrow center">{t("open-roles-eyebrow", { defaultValue: "Open Roles" })}</span>
            <h2 style={{ marginTop: 18 }}>{t("open-roles-headline", { defaultValue: "Ready when you are." })}</h2>
            <p>
              {t("open-roles-body", { defaultValue: "We're hiring across investment banking, markets, technology, and corporate functions in our offices worldwide. Tell us where you'd make the biggest difference." })}
            </p>
            <div className="hero-actions" style={{ justifyContent: 'center', marginTop: 8 }}>
              <Link className="btn btn-gold" to="/rmh-capital/contact" search={{ type: 'Careers' }}>
                {t("apply-or-inquire", { defaultValue: "Apply or inquire" })} <span className="arw">→</span>
              </Link>
              <Link className="btn btn-outline" to="/rmh-capital/businesses">{t("explore-the-businesses", { defaultValue: "Explore the businesses" })} <span className="arw">→</span></Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
