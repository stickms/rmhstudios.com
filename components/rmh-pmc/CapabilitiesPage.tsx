import { Link } from '@tanstack/react-router';
import { Decrypt } from './shared';

export default function CapabilitiesPage() {
  return (
    <>
      <section className="pagehead reveal">
        <div className="container pagehead-inner">
          <div className="brief-meta">
            <span className="field"><b>File</b> ▸ <span className="v"><Decrypt text="CAPABILITIES" /></span></span>
            <span className="field"><b>Class</b> ▸ <span className="v"><Decrypt text="RESTRICTED" /></span></span>
            <span className="field"><b>Lines</b> ▸ <span className="v"><Decrypt text="07" /></span></span>
          </div>
          <span className="desig">Lines of Operation</span>
          <h1>Seven capabilities. One chain of command.</h1>
          <p className="lede">
            We are organized like a real staff — each line carries its section designator. Together they let a client
            protect people, hold ground, train a force, supply it, understand the threat, plan the response, and reshape
            the picture entirely — without ever leaving the command.
          </p>
        </div>
      </section>

      <section className="sec">
        <div className="container">

          {/* 01 — S-3 OPERATIONS */}
          <section className="entry reveal" id="protective">
            <div className="entry-key">
              <div className="entry-desig">S-3 // OPERATIONS</div>
              <div className="entry-idx">01</div>
            </div>
            <div>
              <h2>Protective Services</h2>
              <div className="entry-brand">Close protection · secure movement · crisis response</div>
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
          </section>

          {/* 02 — S-3 GUARD FORCE */}
          <section className="entry reveal" id="guarding">
            <div className="entry-key">
              <div className="entry-desig">S-3 // GUARD FORCE</div>
              <div className="entry-idx">02</div>
            </div>
            <div>
              <h2>Facility &amp; Static Guarding</h2>
              <div className="entry-brand">Embassies · energy · ports · critical infrastructure</div>
              <p>
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
          </section>

          {/* 03 — S-7 TRAINING */}
          <section className="entry reveal" id="training">
            <div className="entry-key">
              <div className="entry-desig">S-7 // TRAINING</div>
              <div className="entry-idx">03</div>
            </div>
            <div>
              <h2>Training &amp; Doctrine</h2>
              <div className="entry-brand">Selection-grade instruction for militaries and police</div>
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
          </section>

          {/* 04 — S-4 LOGISTICS */}
          <section className="entry reveal" id="logistics">
            <div className="entry-key">
              <div className="entry-desig">S-4 // LOGISTICS</div>
              <div className="entry-idx">04</div>
            </div>
            <div>
              <h2>Expeditionary Logistics</h2>
              <div className="entry-brand">Move · base · sustain — anywhere within days</div>
              <p>
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
          </section>

          {/* 05 — S-2 INTELLIGENCE */}
          <section className="entry reveal" id="intelligence">
            <div className="entry-key">
              <div className="entry-desig">S-2 // INTELLIGENCE</div>
              <div className="entry-idx">05</div>
            </div>
            <div>
              <h2>Intelligence &amp; ISR</h2>
              <div className="entry-brand">All-source · cleared liaison architecture</div>
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
          </section>

          {/* 06 — S-5 PLANS */}
          <section className="entry reveal" id="advisory">
            <div className="entry-key">
              <div className="entry-desig">S-5 // PLANS</div>
              <div className="entry-idx">06</div>
            </div>
            <div>
              <h2>Strategic Advisory</h2>
              <div className="entry-brand">Risk · architecture · contingency planning</div>
              <p>
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
          </section>

          {/* 07 — S-9 CIMIC */}
          <section className="entry reveal" id="sovereign">
            <div className="entry-key">
              <div className="entry-desig">S-9 // CIMIC</div>
              <div className="entry-idx">07</div>
            </div>
            <div>
              <h2>Sovereign Solutions</h2>
              <div className="entry-brand">Stabilization · governance advisory · political transition</div>
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
          </section>

        </div>
      </section>

      <section className="sec tight">
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
