import { Link } from '@tanstack/react-router';

export default function CareersPage() {
  return (
    <>
      <section className="pagehead">
        <div className="container pagehead-inner">
          <span className="eyebrow reveal">Careers</span>
          <h1 className="serif reveal d1">Build a career across the whole company arc.</h1>
          <p className="lede reveal d2">
            RMH Capital is a place to do the most interesting work in finance — advising founders one year and global
            institutions the next — and to grow with a platform built for the long term.
          </p>
          <div className="hero-actions reveal d3" style={{ marginTop: 34 }}>
            <a className="btn btn-gold" href="#open-roles">See open roles <span className="arw">→</span></a>
            <a className="btn btn-outline" href="#culture">Our culture <span className="arw">→</span></a>
          </div>
        </div>
      </section>

      {/* PATHS */}
      <section className="section">
        <div className="container">
          <div className="shead reveal">
            <span className="eyebrow">Ways In</span>
            <h2 className="serif">Find the path that fits where you are.</h2>
          </div>
          <div className="pathgrid">
            <div className="path reveal"><span className="ix">01</span><h3>Analyst Programs</h3><p>Our flagship entry point. Analysts join a business, take on real responsibility early, and learn the platform from the inside through structured training and senior mentorship.</p></div>
            <div className="path reveal d1"><span className="ix">02</span><h3>Experienced Professionals</h3><p>For people who have built a track record and want a platform that lets them bring more to every client. We hire across all six businesses and corporate functions.</p></div>
            <div className="path reveal"><span className="ix">03</span><h3>Engineering &amp; Technology</h3><p>The platform runs on the systems our engineers build — shared client data, real-time risk, and the tools our teams use every day. Technology is a first-class discipline here.</p></div>
            <div className="path reveal d1"><span className="ix">04</span><h3>Campus Recruiting</h3><p>Internships and graduate roles for students ready to test themselves against the best. We recruit for curiosity and judgment as much as for résumés.</p></div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* CULTURE */}
      <section className="section" id="culture">
        <div className="container">
          <div className="feature">
            <div className="reveal">
              <span className="eyebrow">Culture</span>
              <h3>Elite standards, without the airlessness.</h3>
              <p>
                We hold ourselves to a high bar — on judgment, on rigor, on integrity — because our clients trust us with
                decisions that matter. That standard is the point, not the pressure for its own sake.
              </p>
              <p>
                What makes it work is the people. We hire advisors first, specialists second, and we reward the colleagues
                who bring the whole firm to a problem. Ambition here is collaborative, and the work is genuinely
                interesting.
              </p>
            </div>
            <div className="valuegrid reveal d1" style={{ gridTemplateColumns: '1fr 1fr', gap: 28 }}>
              <div className="value"><h3>Ownership</h3><p>Real responsibility early, and the autonomy to act on it.</p></div>
              <div className="value"><h3>Mentorship</h3><p>Senior people who invest in how you think, not just what you produce.</p></div>
              <div className="value"><h3>Mobility</h3><p>Move across businesses and markets as your interests grow.</p></div>
              <div className="value"><h3>The long term</h3><p>Careers built to last, on a platform built the same way.</p></div>
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* OPEN ROLES CTA */}
      <section className="section" id="open-roles">
        <div className="container">
          <div className="cta-band reveal">
            <span className="eyebrow center">Open Roles</span>
            <h2 style={{ marginTop: 18 }}>Ready when you are.</h2>
            <p>
              We're hiring across investment banking, markets, technology, and corporate functions in our offices
              worldwide. Tell us where you'd make the biggest difference.
            </p>
            <div className="hero-actions" style={{ justifyContent: 'center', marginTop: 8 }}>
              <Link className="btn btn-gold" to="/rmh-capital/contact" search={{ type: 'Careers' }}>
                Apply or inquire <span className="arw">→</span>
              </Link>
              <Link className="btn btn-outline" to="/rmh-capital/businesses">Explore the businesses <span className="arw">→</span></Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
