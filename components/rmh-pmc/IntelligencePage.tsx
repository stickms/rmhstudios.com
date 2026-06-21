import { useState } from 'react';
import { Link } from '@tanstack/react-router';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'threat', label: 'Threat' },
  { id: 'geopolitics', label: 'Geopolitics' },
  { id: 'maritime', label: 'Maritime' },
  { id: 'cyber', label: 'Cyber & Signals' },
  { id: 'stabilization', label: 'Stabilization' },
  { id: 'protective', label: 'Protective' },
] as const;

type Dispatch = { cat: string; meta: string; serial: string; rd: string; title: string; blurb: string };

const DISPATCHES: Dispatch[] = [
  {
    cat: 'threat',
    meta: 'Threat',
    serial: 'RMH-INT-0431',
    rd: '7 MIN READ',
    title: 'The Sahel corridor is hardening — and so are the actors holding it',
    blurb: 'JNIM and ISWAP have shifted from raiding to road control across the tri-border. We map the segments where convoy movement now requires a deliberate threat decision, not a logistics one.',
  },
  {
    cat: 'maritime',
    meta: 'Maritime',
    serial: 'RMH-INT-0428',
    rd: '6 MIN READ',
    title: 'Reading the Red Sea before the convoys reroute',
    blurb: 'Hull-strike patterns and AIS-spoofing density tell you a reroute is coming days before the underwriters price it. Our weekly Bab-el-Mandeb / Gulf of Aden read for clients moving tonnage.',
  },
  {
    cat: 'protective',
    meta: 'Protective',
    serial: 'RMH-INT-0425',
    rd: 'FOR CLIENT RELEASE',
    title: 'Embassy threat posture: when the standoff distance is already gone',
    blurb: 'For missions in dense urban ground, the perimeter is rented real estate, not a wall. How we re-score posture when the approach has already been built up to the gate.',
  },
  {
    cat: 'cyber',
    meta: 'Cyber & Signals',
    serial: 'RMH-INT-0422',
    rd: '5 MIN READ',
    title: 'Targeted before they land: pre-travel digital threat reduction for principals',
    blurb: 'Hostile services build the principal from open data weeks ahead of arrival. A disciplined seventy-two-hour scrub of device, identity, and pattern-of-life shrinks the surface they planned against.',
  },
  {
    cat: 'stabilization',
    meta: 'Stabilization',
    serial: 'RMH-INT-0419',
    rd: '9 MIN READ',
    title: 'What separates a transition that holds from one that collapses',
    blurb: 'Across our sovereign engagements, durable transitions share three traits — none of them is the size of the security force. Where elite control, payroll continuity, and a credible exit actually sit.',
  },
  {
    cat: 'cyber',
    meta: 'Cyber & Signals',
    serial: 'RMH-INT-0416',
    rd: '6 MIN READ',
    title: 'The ransomware crews now hunting extractives',
    blurb: 'A cluster of access brokers has pivoted from healthcare to mining and oilfield OT. We profile the initial-access tradecraft and the one segmentation gap that keeps showing up in remote-site SCADA.',
  },
  {
    cat: 'threat',
    meta: 'Threat',
    serial: 'RMH-INT-0413',
    rd: '7 MIN READ',
    title: 'Cheap drones, fixed sites, and the math of static defense',
    blurb: 'Commercial-airframe proliferation has put a precision threat in the hands of actors who could never field one before. What a credible counter-UAS posture costs a static site — and what it does not buy.',
  },
  {
    cat: 'geopolitics',
    meta: 'Geopolitics',
    serial: 'RMH-INT-0409',
    rd: '8 MIN READ',
    title: 'Due diligence on a counterparty before the ink, not after',
    blurb: 'A clean corporate registry is not a clean counterparty. How our cell reads beneficial ownership, sanctions adjacency, and local enforcer relationships before a client commits to the deal.',
  },
  {
    cat: 'maritime',
    meta: 'Maritime',
    serial: 'RMH-INT-0405',
    rd: '6 MIN READ',
    title: 'Kidnap-for-ransom is migrating back offshore',
    blurb: 'Gulf of Guinea boarding gangs are working further from the coast and holding crews longer. The negotiation timeline has changed; the pre-transit hardening that actually moves the odds has not.',
  },
];

export default function IntelligencePage() {
  const [active, setActive] = useState<string>('all');

  return (
    <>
      <section className="pagehead">
        <div className="container pagehead-inner">
          <span className="desig reveal">Intelligence // Dispatches</span>
          <h1 className="reveal d1">The product our clients act on.</h1>
          <p className="lede reveal d2">
            Sanitized assessments from the same intelligence cell that supports our deployed teams. What you read here
            has been stripped of sources and methods and cleared for release — the judgment is the same one we hand a
            commander on the ground.
          </p>
        </div>
      </section>

      <section className="section tight">
        <div className="container">
          {/* FEATURED */}
          <div className="featured reveal">
            <Link className="featured-main" to="/rmh-pmc/intelligence">
              <span className="metaline">Threat <span className="dot" /> <span className="t">RMH-INT-0434 · 21 JUN 2026</span></span>
              <h3>The 2026 fragility map: where instability becomes a private problem</h3>
              <p>
                Our standing read on the corridors, contested coastlines, and governance vacuums most likely to demand
                a private response this year — scored on probability, proximity to client interests, and how fast a
                situation can move from headline to evacuation.
              </p>
            </Link>
            <div className="featured-side">
              <Link className="fside-item" to="/rmh-pmc/intelligence">
                <span className="metaline">Maritime</span>
                <h4>The next chokepoint, before it closes</h4>
                <p>Red Sea and Gulf of Aden risk, week by week.</p>
              </Link>
              <Link className="fside-item" to="/rmh-pmc/intelligence">
                <span className="metaline">Stabilization</span>
                <h4>Why some transitions hold and others don't</h4>
                <p>Patterns from our sovereign engagements.</p>
              </Link>
              <Link className="fside-item" to="/rmh-pmc/intelligence">
                <span className="metaline">Cyber &amp; Signals</span>
                <h4>Principals targeted before they land</h4>
                <p>Pre-travel digital threat reduction.</p>
              </Link>
            </div>
          </div>

          {/* FILTERS */}
          <div className="filters reveal" role="group" aria-label="Filter dispatches by category">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                className="chip"
                aria-pressed={active === c.id}
                onClick={() => setActive(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* GRID */}
          <div className="articlegrid reveal">
            {DISPATCHES.map((d, i) => {
              const hidden = active !== 'all' && d.cat !== active;
              return (
                <Link key={i} className={`article${hidden ? ' hide' : ''}`} to="/rmh-pmc/intelligence">
                  <span className="metaline">{d.meta} <span className="dot" /> <span className="t">{d.serial}</span></span>
                  <h3>{d.title}</h3>
                  <p>{d.blurb}</p>
                  <span className="rd">{d.rd}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section tight">
        <div className="container">
          <div className="cta-band reveal">
            <span className="desig center">Cleared Distribution</span>
            <h2 style={{ marginTop: 18 }}>Read the version we don't release.</h2>
            <p>
              Clients on a standing engagement receive named-theater assessments, warning thresholds, and a direct line
              to the cell that wrote them. The public feed is the part we can show.
            </p>
            <Link className="btn btn-amber" to="/rmh-pmc/contact">
              Request a briefing <span className="arw">→</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
