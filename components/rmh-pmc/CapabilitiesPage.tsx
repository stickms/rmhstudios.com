import { Link } from '@tanstack/react-router';

export default function CapabilitiesPage() {
  return (
    <>
      <section className="pagehead">
        <div className="container pagehead-inner">
          <span className="desig reveal">Lines of Operation</span>
          <h1 className="reveal d1">Seven capabilities. One chain of command.</h1>
          <p className="lede reveal d2">
            We are organized like a real staff — each line carries its section designator. Together they let a client
            protect people, hold ground, train a force, supply it, understand the threat, plan the response, and reshape
            the picture entirely — without ever leaving the command.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">

          {/* 01 — S-3 OPERATIONS */}
          <article className="biz" id="protective">
            <div className="reveal">
              <div className="biz-stage">S-3 // OPERATIONS</div>
              <h2>Protective Services</h2>
              <div className="biz-brand">Close protection · secure movement · crisis response</div>
              <span className="biz-num">01 / 07</span>
            </div>
            <div className="reveal d1">
              <p>
                We keep principals alive and moving. Executive and diplomatic protection details, secure ground and air
                movement, residential and venue security, and crisis and evacuation planning — delivered by operators who
                have run protection in permissive capitals and active conflict zones alike.
              </p>
              <p>
                Every detail is built backward from the threat: advance work, route study, surveillance detection, and an
                embedded medical capability, so a bad day is one we have already rehearsed.
              </p>
              <ul className="caps">
                <li>Close Protection</li><li>Secure Movement</li><li>Residential Security</li>
                <li>Surveillance Detection</li><li>Medical Cover</li><li>Evacuation</li>
              </ul>
            </div>
          </article>

          {/* 02 — S-3 GUARD FORCE */}
          <article className="biz flip" id="guarding">
            <div className="biz-media ticks reveal" aria-hidden="true">
              {/* shield / posted perimeter */}
              <svg viewBox="0 0 300 300" width="66%" fill="none">
                <path d="M150 36 L246 76 V152 C246 212 204 250 150 268 C96 250 54 212 54 152 V76 Z"
                  stroke="#E08A2B" strokeOpacity="0.4" strokeWidth="1.4" />
                <path d="M150 70 L214 96 V150 C214 196 184 224 150 238 C116 224 86 196 86 150 V96 Z"
                  stroke="#E08A2B" strokeOpacity="0.22" strokeWidth="1" />
                <path d="M124 152 L144 174 L182 124" stroke="#F4A646" strokeWidth="3"
                  strokeLinecap="square" strokeLinejoin="miter" fill="none" />
                <g fill="#E08A2B">
                  <circle cx="150" cy="36" r="3.2" /><circle cx="246" cy="76" r="3.2" />
                  <circle cx="246" cy="152" r="3.2" /><circle cx="54" cy="152" r="3.2" /><circle cx="54" cy="76" r="3.2" />
                </g>
              </svg>
            </div>
            <div className="reveal d1">
              <div className="biz-stage">S-3 // GUARD FORCE</div>
              <h2>Facility &amp; Static Guarding</h2>
              <div className="biz-brand">Embassies · energy · ports · critical infrastructure</div>
              <span className="biz-num">02 / 07</span>
              <p style={{ marginTop: 20 }}>
                Manned guarding and access control for the sites that cannot afford a lapse — embassies and missions,
                energy installations, ports and terminals, and critical national infrastructure. Posts are manned,
                trained, supervised, and audited to a written standard, with control rooms and K9 capability where the
                threat demands it.
              </p>
              <p>
                A guard force is only as good as the supervision behind it. Ours is run to the same tempo and discipline
                as our protective details — not a uniform agency with a logo.
              </p>
              <ul className="caps">
                <li>Manned Guarding</li><li>Access Control</li><li>Embassy Posts</li>
                <li>Energy &amp; Ports</li><li>K9</li><li>Control Rooms</li>
              </ul>
            </div>
          </article>

          {/* 03 — S-7 TRAINING */}
          <article className="biz" id="training">
            <div className="reveal">
              <div className="biz-stage">S-7 // TRAINING</div>
              <h2>Training &amp; Doctrine</h2>
              <div className="biz-brand">Selection-grade instruction for militaries and police</div>
              <span className="biz-num">03 / 07</span>
            </div>
            <div className="reveal d1">
              <p>
                We train national militaries and police units to a selection standard, not a certificate standard.
                Marksmanship and CQB, maritime interdiction and boarding, mobile force tactics, and command-staff
                doctrine — taught by instructors who built and led these capabilities in their own services.
              </p>
              <p>
                Where a client needs the capability to outlast us, we run train-the-trainer programs that leave a
                self-sustaining cadre behind, not a dependency.
              </p>
              <ul className="caps">
                <li>Marksmanship</li><li>CQB</li><li>Maritime Interdiction</li>
                <li>Mobile Force Training</li><li>Command Staff</li><li>Train-the-Trainer</li>
              </ul>
            </div>
          </article>

          {/* 04 — S-4 LOGISTICS */}
          <article className="biz flip" id="logistics">
            <div className="biz-media ticks reveal" aria-hidden="true">
              {/* route lines / movement legs */}
              <svg viewBox="0 0 300 300" width="74%" fill="none">
                <g stroke="#E08A2B" strokeOpacity="0.22" strokeWidth="1">
                  <line x1="40" y1="220" x2="260" y2="220" /><line x1="40" y1="150" x2="260" y2="150" />
                  <line x1="40" y1="80" x2="260" y2="80" />
                </g>
                <path d="M52 232 L120 168 L188 196 L252 96" stroke="#F4A646" strokeWidth="2"
                  strokeDasharray="3 6" fill="none" />
                <path d="M52 232 L96 110 L176 132 L252 60" stroke="#E08A2B" strokeOpacity="0.5"
                  strokeWidth="1.4" fill="none" />
                <g fill="#F4A646">
                  <circle cx="52" cy="232" r="4" /><circle cx="120" cy="168" r="3.4" />
                  <circle cx="188" cy="196" r="3.4" /><circle cx="252" cy="96" r="4" />
                </g>
                <g fill="#E08A2B"><circle cx="96" cy="110" r="3" /><circle cx="176" cy="132" r="3" /><circle cx="252" cy="60" r="3.4" /></g>
              </svg>
            </div>
            <div className="reveal d1">
              <div className="biz-stage">S-4 // LOGISTICS</div>
              <h2>Expeditionary Logistics</h2>
              <div className="biz-brand">Move · base · sustain — anywhere within days</div>
              <span className="biz-num">04 / 07</span>
              <p style={{ marginTop: 20 }}>
                Air, ground, and maritime movement, basing, and sustainment that put a self-supporting force on the
                ground within days — and keep it supplied for as long as the mandate runs. Charter lift, hardened
                convoys, camps and life support, fuel and ration chains, and an organic medevac capability.
              </p>
              <p>
                We handle customs and clearance through the same liaison channels that run the rest of the company, so
                the tail never becomes the bottleneck.
              </p>
              <ul className="caps">
                <li>Air Charter</li><li>Ground Convoy</li><li>Basing &amp; Camps</li>
                <li>Sustainment</li><li>Medevac</li><li>Customs &amp; Clearance</li>
              </ul>
            </div>
          </article>

          {/* 05 — S-2 INTELLIGENCE */}
          <article className="biz" id="intelligence">
            <div className="reveal">
              <div className="biz-stage">S-2 // INTELLIGENCE</div>
              <h2>Intelligence &amp; ISR</h2>
              <div className="biz-brand">All-source · cleared liaison architecture</div>
              <span className="biz-num">05 / 07</span>
            </div>
            <div className="reveal d1">
              <p>
                Our intelligence cell turns noise into decisions: all-source analysis, surveillance and reconnaissance,
                threat warning, due diligence, and counter-surveillance — the product our deployed teams and our clients
                act on, not a quarterly newsletter.
              </p>
              <p>
                The cell does not work in isolation. RMH PMC maintains a cleared liaison architecture with allied
                national services — including longstanding working relationships with U.S. and Israeli intelligence
                partners — giving clients access to collection, vetting, and warning that no private firm could generate
                alone. Every engagement is run through that architecture: <span className="amber-text">deconflicted,
                sanctions-screened, and lawful</span> in every jurisdiction we touch. What that architecture sees, and
                who exactly it touches, stays inside the briefing room.
              </p>
              <ul className="caps">
                <li>All-Source Analysis</li><li>ISR</li><li>Threat Warning</li>
                <li>Due Diligence</li><li>Partner Liaison</li><li>Counter-Surveillance</li>
              </ul>
            </div>
          </article>

          {/* 06 — S-5 PLANS */}
          <article className="biz flip" id="advisory">
            <div className="biz-media ticks reveal" aria-hidden="true">
              {/* node graph / planning lattice */}
              <svg viewBox="0 0 300 300" width="72%" fill="none">
                <g stroke="#E08A2B" strokeOpacity="0.4" strokeWidth="1.2">
                  <line x1="150" y1="150" x2="78" y2="78" /><line x1="150" y1="150" x2="226" y2="92" />
                  <line x1="150" y1="150" x2="92" y2="220" /><line x1="150" y1="150" x2="224" y2="212" />
                  <line x1="78" y1="78" x2="226" y2="92" /><line x1="92" y1="220" x2="224" y2="212" />
                </g>
                <g stroke="#F4A646" strokeOpacity="0.7" strokeWidth="1.2" strokeDasharray="2 5">
                  <line x1="78" y1="78" x2="92" y2="220" /><line x1="226" y1="92" x2="224" y2="212" />
                </g>
                <g fill="#E08A2B">
                  <circle cx="78" cy="78" r="4" /><circle cx="226" cy="92" r="4" />
                  <circle cx="92" cy="220" r="4" /><circle cx="224" cy="212" r="4" />
                </g>
                <circle cx="150" cy="150" r="7" fill="#F4A646" />
              </svg>
            </div>
            <div className="reveal d1">
              <div className="biz-stage">S-5 // PLANS</div>
              <h2>Strategic Advisory</h2>
              <div className="biz-brand">Risk · architecture · contingency planning</div>
              <span className="biz-num">06 / 07</span>
              <p style={{ marginTop: 20 }}>
                For boards, ministries, and country teams operating in fragile environments, we design the security
                architecture and the plan behind it: threat and risk assessment, contingency and crisis planning, red
                teaming of existing posture, and the entry strategy for a new and difficult market.
              </p>
              <p>
                Advisory here is not a deck. It is informed by the same intelligence cell and delivered by planners who
                have owned the consequences of being wrong.
              </p>
              <ul className="caps">
                <li>Security Architecture</li><li>Risk Assessment</li><li>Contingency Planning</li>
                <li>Red Teaming</li><li>Board Advisory</li><li>Country Entry</li>
              </ul>
            </div>
          </article>

          {/* 07 — S-9 CIMIC */}
          <article className="biz" id="sovereign">
            <div className="reveal">
              <div className="biz-stage">S-9 // CIMIC</div>
              <h2>Sovereign Solutions</h2>
              <div className="biz-brand">Stabilization · governance advisory · political transition</div>
              <span className="biz-num">07 / 07</span>
            </div>
            <div className="reveal d1">
              <p>
                A small number of clients are sovereign states reshaping their security posture from the ground up. For
                them we offer discreet stabilization, governance advisory, security-sector reform, and political-transition
                support — a single, quiet relationship that touches every level of how a state secures itself.
              </p>
              <p>
                This line is delivered by invitation, under strict confidentiality, and within the legal frameworks that
                govern it. We do not discuss its methods, its clients, or its outcomes in the open. The work is rarely
                visible. It is meant to be.
              </p>
              <ul className="caps">
                <li>Stabilization</li><li>Governance Advisory</li><li>Security-Sector Reform</li>
                <li>Transition Support</li><li>Strategic Communications</li><li>Sovereign Liaison</li>
              </ul>
            </div>
          </article>

        </div>
      </section>

      <section className="section tight">
        <div className="container">
          <div className="cta-band reveal">
            <span className="desig center">One Command</span>
            <h2 style={{ marginTop: 18 }}>The advantage is in the chain of command.</h2>
            <p>
              No single line works alone — protection draws on intelligence, logistics carries them all, and plans tie
              them together under one staff. Tell us the problem; we will bring the whole company to it.
            </p>
            <Link className="btn btn-amber" to="/rmh-pmc/contact">Request a briefing <span className="arw">→</span></Link>
          </div>
        </div>
      </section>
    </>
  );
}
