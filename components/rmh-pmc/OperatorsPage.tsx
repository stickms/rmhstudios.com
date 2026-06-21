import { Link } from '@tanstack/react-router';

export default function OperatorsPage() {
  return (
    <>
      <section className="pagehead">
        <div className="container pagehead-inner">
          <span className="desig reveal">Selection // Operators</span>
          <h1 className="reveal d1">The standard does not lower for anyone.</h1>
          <p className="lede reveal d2">
            We bring on a small number of proven people each year — operators, analysts, logisticians, medics,
            and signallers — and we select them again on our own terms. A career somewhere else is the price of
            admission, not the qualification. If you have already proven it, you prove it once more here.
          </p>
          <div className="hero-actions reveal d3" style={{ marginTop: 34 }}>
            <a className="btn btn-amber" href="#pipeline">The selection pipeline <span className="arw">→</span></a>
            <a className="btn btn-outline" href="#roles">Roles we recruit <span className="arw">→</span></a>
          </div>
        </div>
      </section>

      {/* PEDIGREE */}
      <section className="section tight">
        <div className="container">
          <div className="shead center reveal">
            <span className="desig center">Pedigree</span>
            <h2>Hired from the units that set the standard.</h2>
            <p className="lede">
              Our operators come from the tier-one elements of allied nations — assault, recce, maritime, and
              aviation. We do not lower the bar to fill a roster. We hold it, and we draw from the people who
              cleared it the first time.
            </p>
          </div>
          <div className="lineage reveal" style={{ justifyContent: 'center' }}>
            {[
              'SAS',
              'SBS',
              'DELTA',
              'DEVGRU',
              'SAYERET MATKAL',
              'SHAYETET 13',
              'GIGN',
              'GIGN / RAID',
              'KSK',
              'JTF2',
              'GROM',
              'JW KOMANDOSÓW',
              'SASR',
              'NZSAS',
              'FÖRSVARSMAKTEN SOG',
              'MARSOC',
              'RANGERS',
              'PARA-SF',
            ].map((u) => (
              <span key={u}>{u}</span>
            ))}
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* SELECTION PIPELINE */}
      <section className="section" id="pipeline">
        <div className="container">
          <div className="shead reveal">
            <span className="desig">Selection Pipeline</span>
            <h2>Four phases. No shortcuts through any of them.</h2>
            <p className="lede">
              Selection is a sequence, run in order, with a hard stop at every gate. Most candidates do not finish
              it — and the ones who do arrive on a team already known, already cleared, already trusted.
            </p>
          </div>
          <div className="pathgrid">
            <div className="path reveal">
              <span className="ix">PHASE 01</span>
              <h3>Application &amp; Records</h3>
              <p>
                We verify the record before we verify anything else. Service history, unit, deployments,
                qualifications, and discharge are confirmed against source — not your résumé, the actual file. Every
                claim is checked. One that does not hold ends the process here.
              </p>
            </div>
            <div className="path reveal d1">
              <span className="ix">PHASE 02</span>
              <h3>Vetting &amp; Clearance</h3>
              <p>
                A full background investigation, polygraph-grade screening, financial and sanctions exposure
                checks, and a foreign-contact review run through our cleared liaison architecture. We work in
                jurisdictions where a single undisclosed tie can compromise a whole team. We find it now or not at all.
              </p>
            </div>
            <div className="path reveal">
              <span className="ix">PHASE 03</span>
              <h3>Assessment &amp; Selection</h3>
              <p>
                A graded course, not a tryout. Fitness and load-bearing endurance, live and stress-shoot
                marksmanship, navigation, medical and comms baselines, and — the part that fails most strong
                candidates — judgment under fatigue, ambiguity, and observation. Performance is scored. The board reviews the scores.
              </p>
            </div>
            <div className="path reveal d1">
              <span className="ix">PHASE 04</span>
              <h3>Badging &amp; Deployment</h3>
              <p>
                Selection earns a badge and a probationary attachment to a team, not tenure. You deploy under a team
                leader who reports on you, on a contract that either of us can end. Hold the standard on the ground
                and the attachment becomes a place on the roster.
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* ROLES */}
      <section className="section" id="roles">
        <div className="container">
          <div className="shead reveal">
            <span className="desig">Roles We Recruit</span>
            <h2>A team is more than its shooters.</h2>
            <p className="lede">
              We man a whole command, not just an assault element. These are the roles we recruit for — and the
              kind of person who fits each one.
            </p>
          </div>
          <div className="cards c3 reveal">
            <div className="card">
              <span className="ix">S-3 // OPERATIONS</span>
              <h3>Assaulters &amp; Protective Specialists</h3>
              <p>
                Tier-one assault, recce, or close-protection background. You move well, shoot to a measured standard,
                and stay calm when the plan does not. The work is principals and ground, not a highlight reel.
              </p>
            </div>
            <div className="card">
              <span className="ix">S-2 // INTELLIGENCE</span>
              <h3>Intelligence Analysts</h3>
              <p>
                All-source analysts who have supported deployed forces and can write a finished assessment a client
                will act on. Cleared experience and language ability are weighted heavily. Tradecraft, not opinion.
              </p>
            </div>
            <div className="card">
              <span className="ix">S-4 // LOGISTICS</span>
              <h3>Logisticians</h3>
              <p>
                Movement, basing, and sustainment specialists who can put a self-supporting force into a hard place
                and keep it fed, fueled, and armed. If you have run an expeditionary tail, you know what we mean.
              </p>
            </div>
            <div className="card">
              <span className="ix">S-1 // MEDICAL</span>
              <h3>Combat Medics</h3>
              <p>
                SOF medics and paramedics who can hold a casualty alive past the golden hour, far from a role-two
                facility. Currency matters. You are the reason a team takes the contract.
              </p>
            </div>
            <div className="card">
              <span className="ix">S-6 // SIGNALS</span>
              <h3>Communications &amp; Signals</h3>
              <p>
                Signallers and SIGINT-adjacent specialists who keep a team connected and covered across HF, SATCOM,
                and contested spectrum. You build the network the rest of the command depends on, then defend it.
              </p>
            </div>
            <div className="card">
              <span className="ix">S-5 // PLANS</span>
              <h3>Advisory Staff</h3>
              <p>
                Former command and staff officers who can sit across from a minister or a board and plan a campaign,
                not just brief one. Judgment, discretion, and a record of getting it right when it counted.
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* WHAT WE OFFER */}
      <section className="section">
        <div className="container">
          <div className="shead reveal">
            <span className="desig">The Terms</span>
            <h2>What you carry our flag for.</h2>
            <p className="lede">
              We ask a lot, and we are direct about what comes back. No equity-in-the-mission talk — terms a serious
              professional can actually plan a life around.
            </p>
          </div>
          <div className="valuegrid reveal">
            <div className="value">
              <h3>Compensation</h3>
              <p>Pay set against the risk and the rarity of the skill — not a market rate for a guard. Hazard and deployment terms are in the contract, not implied.</p>
            </div>
            <div className="value">
              <h3>World-Class Kit</h3>
              <p>You are issued and sustained on equipment chosen by operators, maintained by armorers, and replaced when it wears. You will not be the limiting factor.</p>
            </div>
            <div className="value">
              <h3>A Real Chain of Command</h3>
              <p>One command, a team leader who answers for you, and an operations center that is always manned. You will know who has the ground truth and who makes the call.</p>
            </div>
            <div className="value">
              <h3>Medical &amp; Family Cover</h3>
              <p>Comprehensive medical, evacuation, and disability cover for you, and standing provision for your family if the worst happens. It is written down before you deploy.</p>
            </div>
            <div className="value">
              <h3>Post-Contract Transition</h3>
              <p>Structured decompression, currency-keeping, and placement support when a contract ends. We do not cut people loose at the airfield. The relationship outlasts the rotation.</p>
            </div>
            <div className="value">
              <h3>The Standard Itself</h3>
              <p>You will work alongside people selected to the same bar you cleared — and never have to carry someone who was let through because a roster needed filling.</p>
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* SELECTION CTA */}
      <section className="section tight">
        <div className="container">
          <div className="cta-band reveal">
            <span className="desig center">Selection</span>
            <h2 style={{ marginTop: 18 }}>Prove it once more.</h2>
            <p>
              Selection inquiries are reviewed by the recruiting staff, in confidence. Tell us who you served with
              and what you did. We will tell you whether there is a place to compete for — and we will not waste your
              time if there isn't.
            </p>
            <div className="hero-actions" style={{ justifyContent: 'center', marginTop: 8 }}>
              <Link className="btn btn-amber" to="/rmh-pmc/contact" search={{ type: 'Recruiting' }}>
                Open a selection inquiry <span className="arw">→</span>
              </Link>
              <Link className="btn btn-outline" to="/rmh-pmc/capabilities">See where you'd deploy <span className="arw">→</span></Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
