import { Link } from '@tanstack/react-router';
import { StatusTicker } from './shared';

export default function HomePage() {
  return (
    <>
      {/* ══ HERO — radar-sweep operations globe ══ */}
      <section className="hero">
        <div className="hero-bg" aria-hidden="true">
          <svg className="hero-radar" viewBox="0 0 600 600" fill="none" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="rmhp-sweepgrad" x1="300" y1="300" x2="300" y2="40" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#E08A2B" stopOpacity="0.42" />
                <stop offset="1" stopColor="#E08A2B" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* range rings + graticule */}
            <g stroke="#E08A2B">
              <circle cx="300" cy="300" r="262" strokeOpacity="0.20" />
              <circle cx="300" cy="300" r="196" strokeOpacity="0.14" />
              <circle cx="300" cy="300" r="130" strokeOpacity="0.12" />
              <circle cx="300" cy="300" r="64" strokeOpacity="0.10" />
              <g strokeOpacity="0.10">
                <ellipse cx="300" cy="300" rx="262" ry="96" />
                <ellipse cx="300" cy="300" rx="262" ry="184" />
                <ellipse cx="300" cy="300" rx="120" ry="262" />
                <ellipse cx="300" cy="300" rx="210" ry="262" />
                <line x1="38" y1="300" x2="562" y2="300" />
                <line x1="300" y1="38" x2="300" y2="562" />
              </g>
              {/* bearing ticks */}
              <g strokeOpacity="0.5">
                <line x1="300" y1="38" x2="300" y2="56" /><line x1="300" y1="544" x2="300" y2="562" />
                <line x1="38" y1="300" x2="56" y2="300" /><line x1="544" y1="300" x2="562" y2="300" />
              </g>
            </g>

            {/* rotating sweep wedge */}
            <g className="sweep">
              <path d="M300 300 L300 40 A260 260 0 0 1 524 170 Z" fill="url(#rmhp-sweepgrad)" />
              <line x1="300" y1="300" x2="300" y2="40" stroke="#F4A646" strokeWidth="2" strokeOpacity="0.8" />
            </g>

            {/* theater ping markers */}
            <g>
              <circle className="pingring" cx="392" cy="206" r="9" fill="none" stroke="#F4A646" strokeWidth="1.4" />
              <circle className="ping" cx="392" cy="206" r="4.5" fill="#F4A646" />
              <circle className="pingring p2" cx="200" cy="372" r="9" fill="none" stroke="#F4A646" strokeWidth="1.4" />
              <circle className="ping p2" cx="200" cy="372" r="4.5" fill="#F4A646" />
              <circle className="pingring p3" cx="356" cy="392" r="9" fill="none" stroke="#F4A646" strokeWidth="1.4" />
              <circle className="ping p3" cx="356" cy="392" r="4.5" fill="#F4A646" />
              <circle className="ping p4" cx="236" cy="214" r="3.6" fill="#E08A2B" />
            </g>
            <circle cx="300" cy="300" r="4" fill="#F4A646" />
          </svg>
        </div>

        <div className="container hero-content">
          <span className="desig reveal">RMH PMC // Private Military Operations</span>
          <h1 className="reveal d1">When the outcome <em>cannot</em> be left to chance</h1>
          <p className="lede reveal d2">
            RMH PMC is the private military arm of RMH Studios. We field tier-one operators, a sovereign-grade
            intelligence cell, and a global logistics tail to protect people, secure ground, and shape outcomes
            for governments, corporations, and institutions — wherever the stakes are highest.
          </p>
          <div className="hero-actions reveal d3">
            <Link className="btn btn-amber" to="/rmh-pmc/capabilities">
              View capabilities <span className="arw">→</span>
            </Link>
            <Link className="btn btn-outline" to="/rmh-pmc/contact">
              Request a briefing <span className="arw">→</span>
            </Link>
          </div>
        </div>
      </section>

      <StatusTicker />

      {/* ══ STAT BAND ══ */}
      <section className="statband" aria-label="Force at a glance">
        <div className="stat reveal"><div className="v">200+</div><div className="k">Vetted operators on the active roster</div></div>
        <div className="stat reveal d1"><div className="v">40+</div><div className="k">Theaters with active or standby presence</div></div>
        <div className="stat reveal d2"><div className="v">14</div><div className="k">Allied services in our liaison architecture</div></div>
        <div className="stat reveal d3"><div className="v">24/7</div><div className="k">Global operations center, always manned</div></div>
      </section>

      {/* ══ COMMAND ══ */}
      <section className="section">
        <div className="container">
          <div className="feature">
            <div className="feature-copy reveal">
              <span className="desig">The Company</span>
              <h3>One command. Drawn from the world’s best.</h3>
              <p>
                Most security firms are a staffing agency with a logo. RMH PMC is built the other way around: a single
                command, manned almost entirely by veterans of tier-one special operations units — assault, recce,
                maritime, and aviation — backed by an intelligence cell and a logistics tail that move at the same tempo.
              </p>
              <p>
                That structure lets us put the whole organization behind a single task: the operators on the ground, the
                analysts reading it, and the planners who keep them supplied — under one chain of command, with the
                discretion our clients require.
              </p>
              <Link className="btn-text" to="/rmh-pmc/command">
                Inside the command <span className="arw">→</span>
              </Link>
            </div>
            <div className="feature-media ticks reveal d1" aria-hidden="true">
              <svg viewBox="0 0 400 300" width="80%" fill="none" stroke="#E08A2B" strokeOpacity="0.6" strokeWidth="1.2">
                <circle cx="200" cy="150" r="20" stroke="#F4A646" strokeOpacity="1" />
                <g strokeOpacity="0.35"><circle cx="200" cy="150" r="66" /><circle cx="200" cy="150" r="112" /></g>
                <g stroke="#E08A2B" strokeOpacity="0.5"><line x1="200" y1="40" x2="200" y2="80" /><line x1="200" y1="220" x2="200" y2="260" /><line x1="92" y1="150" x2="132" y2="150" /><line x1="268" y1="150" x2="308" y2="150" /></g>
                <g fill="#E08A2B" stroke="none"><circle cx="200" cy="38" r="3.4" /><circle cx="302" cy="92" r="3.4" /><circle cx="302" cy="208" r="3.4" /><circle cx="200" cy="262" r="3.4" /><circle cx="98" cy="208" r="3.4" /><circle cx="98" cy="92" r="3.4" /></g>
                <path d="M186 150 L200 164 L214 150" stroke="#F4A646" strokeWidth="3" strokeLinecap="square" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* ══ CAPABILITIES — seven lines, staff designators ══ */}
      <section className="section">
        <div className="container">
          <div className="shead reveal">
            <span className="desig">Lines of Operation</span>
            <h2>Seven capabilities. One chain of command.</h2>
            <p className="lede">
              Organized like a real staff — each line carries its section designator. Together they let a client
              protect, supply, understand, and act without ever leaving the command.
            </p>
          </div>
          <div className="cards c3 reveal">
            <Link className="card" to="/rmh-pmc/capabilities" hash="protective">
              <span className="ix">S-3 // OPERATIONS</span><h3>Protective Services</h3>
              <span className="card-brand">Close protection · mobile security</span>
              <p>Executive and diplomatic protection, secure movement, and crisis response for high-value principals in permissive and hostile environments.</p>
              <span className="card-link">Detail <span className="arw">→</span></span>
            </Link>
            <Link className="card" to="/rmh-pmc/capabilities" hash="guarding">
              <span className="ix">S-3 // GUARD FORCE</span><h3>Static Guarding</h3>
              <span className="card-brand">Sites · infrastructure · embassies</span>
              <p>Manned guarding and access control for embassies, energy sites, ports, and critical infrastructure — posted, trained, and supervised to standard.</p>
              <span className="card-link">Detail <span className="arw">→</span></span>
            </Link>
            <Link className="card" to="/rmh-pmc/capabilities" hash="training">
              <span className="ix">S-7 // TRAINING</span><h3>Training &amp; Doctrine</h3>
              <p>Selection-grade instruction for national militaries and police units: marksmanship, CQB, maritime interdiction, and command-staff doctrine.</p>
              <span className="card-link">Detail <span className="arw">→</span></span>
            </Link>
            <Link className="card" to="/rmh-pmc/capabilities" hash="logistics">
              <span className="ix">S-4 // LOGISTICS</span><h3>Expeditionary Logistics</h3>
              <p>Air, ground, and maritime movement, basing, and sustainment that put a self-supporting force anywhere within days.</p>
              <span className="card-link">Detail <span className="arw">→</span></span>
            </Link>
            <Link className="card" to="/rmh-pmc/capabilities" hash="intelligence">
              <span className="ix">S-2 // INTELLIGENCE</span><h3>Intelligence &amp; ISR</h3>
              <span className="card-brand">Cleared liaison architecture</span>
              <p>All-source intelligence, surveillance, and reconnaissance — with embedded liaison to allied national services.</p>
              <span className="card-link">Detail <span className="arw">→</span></span>
            </Link>
            <Link className="card" to="/rmh-pmc/capabilities" hash="advisory">
              <span className="ix">S-5 // PLANS</span><h3>Strategic Advisory</h3>
              <p>Risk, security architecture, and contingency planning for boards, ministries, and country teams operating in fragile environments.</p>
              <span className="card-link">Detail <span className="arw">→</span></span>
            </Link>
            <Link className="card" to="/rmh-pmc/capabilities" hash="sovereign">
              <span className="ix">S-9 // CIMIC</span><h3>Sovereign Solutions</h3>
              <span className="card-brand">Stabilization · governance · transition</span>
              <p>Discreet stabilization, governance advisory, and political-transition support for sovereign clients reshaping their security posture.</p>
              <span className="card-link">Detail <span className="arw">→</span></span>
            </Link>
            <div className="card" style={{ background: 'linear-gradient(150deg,var(--ink),var(--void))' }}>
              <span className="ix">→</span><h3>The full order of battle</h3>
              <p>How seven lines share operators, intelligence, and lift to deliver effects no single-service vendor can match.</p>
              <Link className="card-link" to="/rmh-pmc/capabilities">All capabilities <span className="arw">→</span></Link>
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* ══ ALLIED LIAISON ══ */}
      <section className="section">
        <div className="container">
          <div className="feature flip">
            <div className="feature-media ticks reveal" aria-hidden="true">
              <svg viewBox="0 0 400 320" width="86%" fill="none">
                <g stroke="#E08A2B" strokeOpacity="0.4" strokeWidth="1">
                  <circle cx="200" cy="160" r="138" />
                  <ellipse cx="200" cy="160" rx="138" ry="50" />
                  <ellipse cx="200" cy="160" rx="138" ry="100" />
                  <ellipse cx="200" cy="160" rx="60" ry="138" />
                  <line x1="62" y1="160" x2="338" y2="160" />
                </g>
                {/* secure links between nodes */}
                <g stroke="#F4A646" strokeOpacity="0.7" strokeWidth="1.3" strokeDasharray="2 5">
                  <line x1="200" y1="160" x2="120" y2="96" /><line x1="200" y1="160" x2="290" y2="120" /><line x1="200" y1="160" x2="250" y2="232" />
                </g>
                <g fill="#F4A646"><circle cx="120" cy="96" r="4" /><circle cx="290" cy="120" r="4" /><circle cx="250" cy="232" r="4" /></g>
                <circle cx="200" cy="160" r="6" fill="#E08A2B" />
              </svg>
            </div>
            <div className="feature-copy reveal d1">
              <span className="desig">Partner Liaison</span>
              <h3>Cleared to work alongside the agencies that matter.</h3>
              <p>
                Our intelligence cell does not operate in isolation. RMH PMC maintains a cleared liaison architecture
                with allied national services — including longstanding working relationships with U.S. and Israeli
                intelligence partners — so our clients benefit from collection, vetting, and warning that a private
                firm could not generate alone.
              </p>
              <p>
                Every engagement is run through that architecture: deconflicted, sanctions-screened, and lawful in
                every jurisdiction we touch.
              </p>
              <Link className="btn-text" to="/rmh-pmc/capabilities" hash="intelligence">The intelligence line <span className="arw">→</span></Link>
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* ══ OPERATOR LINEAGE ══ */}
      <section className="section tight">
        <div className="container">
          <div className="shead center reveal">
            <span className="desig center">Pedigree</span>
            <h2>Hired from the units that set the standard.</h2>
            <p className="lede">
              Our operators come from the tier-one elements of allied nations — selected again, on our terms, before
              they ever deploy under our flag.
            </p>
          </div>
          <div className="lineage reveal" style={{ justifyContent: 'center' }}>
            {['SAS', 'SBS', 'DELTA', 'DEVGRU', 'SAYERET MATKAL', 'SHAYETET 13', 'GIGN', 'KSK', 'JTF2', 'GROM', 'SASR', 'JW KOMANDOSÓW', 'FÖRSVARSMAKTEN SOG', 'RECON'].map((u) => (
              <span key={u}>{u}</span>
            ))}
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* ══ INTELLIGENCE PREVIEW ══ */}
      <section className="section">
        <div className="container">
          <div className="shead reveal">
            <span className="desig">Latest Dispatches</span>
            <h2>The product our clients act on.</h2>
            <p className="lede">
              Assessments from the same intelligence cell that supports our deployed teams — sanitized for release.
            </p>
          </div>

          <div className="featured reveal">
            <Link className="featured-main" to="/rmh-pmc/intelligence">
              <span className="metaline">Threat <span className="dot" /> <span className="t">Assessment</span></span>
              <h3>The 2026 fragility map: where instability becomes opportunity</h3>
              <p>
                Our analysts on the corridors, contested coastlines, and governance vacuums most likely to demand a
                private response in the year ahead — and how clients are positioning ahead of them.
              </p>
            </Link>
            <div className="featured-side">
              <Link className="fside-item" to="/rmh-pmc/intelligence">
                <span className="metaline">Maritime</span>
                <h4>Reading the next chokepoint before the convoys reroute</h4>
                <p>Red Sea and Gulf of Aden risk, week by week.</p>
              </Link>
              <Link className="fside-item" to="/rmh-pmc/intelligence">
                <span className="metaline">Stabilization</span>
                <h4>What separates a transition that holds from one that doesn’t</h4>
                <p>Lessons from sovereign engagements.</p>
              </Link>
              <Link className="fside-item" to="/rmh-pmc/intelligence">
                <span className="metaline">Cyber &amp; Signals</span>
                <h4>Protecting principals who are targeted before they land</h4>
                <p>Pre-travel digital threat reduction.</p>
              </Link>
            </div>
          </div>
          <Link className="btn-text reveal" to="/rmh-pmc/intelligence">All dispatches <span className="arw">→</span></Link>
        </div>
      </section>

      {/* ══ OPERATORS CTA ══ */}
      <section className="section tight">
        <div className="container">
          <div className="cta-band reveal">
            <span className="desig center">Selection</span>
            <h2 style={{ marginTop: 18 }}>The standard does not lower for anyone.</h2>
            <p>
              We recruit a small number of operators, analysts, logisticians, and medics each year — and select them
              again before they ever carry our flag. If you have already proven it, prove it once more.
            </p>
            <Link className="btn btn-amber" to="/rmh-pmc/operators">Selection &amp; recruiting <span className="arw">→</span></Link>
          </div>
        </div>
      </section>
    </>
  );
}
