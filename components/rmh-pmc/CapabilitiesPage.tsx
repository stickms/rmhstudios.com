/**
 * RMH PMC capabilities. The page head and the staff scene (seven chrome bars
 * that rise and are closed by a rail) play on the stage; the seven capability
 * sections alternate paper and stage, each with an instrument of its own:
 * protective (orb in rings), guarding (palisade of bars), training (turned
 * disc), logistics (rails), intelligence (reticle), advisory (hex plate),
 * sovereign (satin slab and ring). Flow mode is an ordinary document.
 */
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Arrow, CtaBand, Decrypt, Hud, Reticle, Scene, Words, cssVars } from './shared';

type Cap = {
  id: string;
  desig: string;
  idx: string;
  h: string;
  brand: string;
  p1: string;
  p2: ReactNode;
  chips: string[];
};

const POSTS = [58, 74, 66, 84, 62, 92, 70, 80, 64, 90, 68, 82, 60, 88, 72, 78, 66, 86, 56];

function Head({ c, center = false, num = false, desig = true }: { c: Cap; center?: boolean; num?: boolean; desig?: boolean }) {
  return (
    <header className={`cap-head${center ? ' cap-head--c' : ''}`}>
      {num ? <span className="cap-ghost steel" aria-hidden="true">{c.idx}</span> : null}
      {desig ? <span className="desig rv">{c.desig}</span> : null}
      <h2 className="h2 cap-h rv d1">{c.h}</h2>
      <p className="meta cap-brand rv d2">{c.brand}</p>
    </header>
  );
}

function Prose({ c, className = '' }: { c: Cap; className?: string }) {
  return (
    <div className={`cap-prose rv ${className}`.trim()}>
      <p className="body">{c.p1}</p>
      <p className="body">{c.p2}</p>
    </div>
  );
}

function Chips({ items, className = '' }: { items: string[]; className?: string }) {
  return (
    <ul className={`cap-chips ${className}`.trim()}>
      {items.map((x, i) => (
        <li key={x} className={`rv${i % 3 ? ` d${i % 3}` : ''}`}>
          <span className="cap-chip glass glass--pill">{x}</span>
        </li>
      ))}
    </ul>
  );
}

export default function CapabilitiesPage() {
  const { t } = useTranslation('c-rmh-pmc');

  const caps: Cap[] = [
    {
      id: 'protective', desig: 'S-3 // OPERATIONS', idx: '01',
      h: t("protective-heading", { defaultValue: "Protective Services" }),
      brand: t("protective-brand", { defaultValue: "Close protection · secure movement · crisis response" }),
      p1: t("protective-p1", { defaultValue: "We keep principals alive and moving. Executive and diplomatic protection details, secure ground and air movement, residential and venue security, and crisis and evacuation planning — delivered by operators who have run protection in permissive capitals and active conflict zones alike." }),
      p2: t("protective-p2", { defaultValue: "Every detail is built backward from the threat: advance work, route study, surveillance detection, and an embedded medical capability, so a bad day is one we have already rehearsed." }),
      chips: [t("cap-close-protection", { defaultValue: "Close Protection" }), t("cap-secure-movement", { defaultValue: "Secure Movement" }), t("cap-residential-security", { defaultValue: "Residential Security" }), t("cap-surveillance-detection", { defaultValue: "Surveillance Detection" }), t("cap-medical-cover", { defaultValue: "Medical Cover" }), t("cap-evacuation", { defaultValue: "Evacuation" })],
    },
    {
      id: 'guarding', desig: 'S-3 // GUARD FORCE', idx: '02',
      h: t("guarding-heading", { defaultValue: "Facility & Static Guarding" }),
      brand: t("guarding-brand", { defaultValue: "Embassies · energy · ports · critical infrastructure" }),
      p1: t("guarding-p1", { defaultValue: "Manned guarding and access control for the sites that cannot afford a lapse — embassies and missions, energy installations, ports and terminals, and critical national infrastructure. Posts are manned, trained, supervised, and audited to a written standard, with control rooms and K9 capability where the threat demands it." }),
      p2: t("guarding-p2", { defaultValue: "A guard force is only as good as the supervision behind it. Ours is run to the same tempo and discipline as our protective details — not a uniform agency with a logo." }),
      chips: [t("cap-manned-guarding", { defaultValue: "Manned Guarding" }), t("cap-access-control", { defaultValue: "Access Control" }), t("cap-embassy-posts", { defaultValue: "Embassy Posts" }), t("cap-energy-ports", { defaultValue: "Energy & Ports" }), t("cap-k9", { defaultValue: "K9" }), t("cap-control-rooms", { defaultValue: "Control Rooms" })],
    },
    {
      id: 'training', desig: 'S-7 // TRAINING', idx: '03',
      h: t("training-heading", { defaultValue: "Training & Doctrine" }),
      brand: t("training-brand", { defaultValue: "Selection-grade instruction for militaries and police" }),
      p1: t("training-p1", { defaultValue: "We train national militaries and police units to a selection standard, not a certificate standard. Marksmanship and CQB, maritime interdiction and boarding, mobile force tactics, and command-staff doctrine — taught by instructors who built and led these capabilities in their own services." }),
      p2: t("training-p2", { defaultValue: "Where a client needs the capability to outlast us, we run train-the-trainer programs that leave a self-sustaining cadre behind, not a dependency." }),
      chips: [t("cap-marksmanship", { defaultValue: "Marksmanship" }), t("cap-cqb", { defaultValue: "CQB" }), t("cap-maritime-interdiction", { defaultValue: "Maritime Interdiction" }), t("cap-mobile-force-training", { defaultValue: "Mobile Force Training" }), t("cap-command-staff", { defaultValue: "Command Staff" }), t("cap-train-the-trainer", { defaultValue: "Train-the-Trainer" })],
    },
    {
      id: 'logistics', desig: 'S-4 // LOGISTICS', idx: '04',
      h: t("logistics-heading", { defaultValue: "Expeditionary Logistics" }),
      brand: t("logistics-brand", { defaultValue: "Move · base · sustain — anywhere within days" }),
      p1: t("logistics-p1", { defaultValue: "Air, ground, and maritime movement, basing, and sustainment that put a self-supporting force on the ground within days — and keep it supplied for as long as the mandate runs. Charter lift, hardened convoys, camps and life support, fuel and ration chains, and an organic medevac capability." }),
      p2: t("logistics-p2", { defaultValue: "We handle customs and clearance through the same liaison channels that run the rest of the company, so the tail never becomes the bottleneck." }),
      chips: [t("cap-air-charter", { defaultValue: "Air Charter" }), t("cap-ground-convoy", { defaultValue: "Ground Convoy" }), t("cap-basing-camps", { defaultValue: "Basing & Camps" }), t("cap-sustainment", { defaultValue: "Sustainment" }), t("cap-medevac", { defaultValue: "Medevac" }), t("cap-customs-clearance", { defaultValue: "Customs & Clearance" })],
    },
    {
      id: 'intelligence', desig: 'S-2 // INTELLIGENCE', idx: '05',
      h: t("intelligence-heading", { defaultValue: "Intelligence & ISR" }),
      brand: t("intelligence-brand", { defaultValue: "All-source · cleared liaison architecture" }),
      p1: t("intelligence-p1", { defaultValue: "Our intelligence cell turns noise into decisions: all-source analysis, surveillance and reconnaissance, threat warning, due diligence, and counter-surveillance — the product our deployed teams and our clients act on, not a quarterly newsletter." }),
      p2: (
        <>
          {t("intelligence-p2", { defaultValue: "The cell does not work in isolation. RMH PMC maintains a cleared liaison architecture with allied national services — including longstanding working relationships with U.S. and Israeli intelligence partners — giving clients access to collection, vetting, and warning that no private firm could generate alone. Every engagement is run through that architecture: " })}
          <span className="cap-em">{t("intelligence-deconflicted", { defaultValue: "deconflicted, sanctions-screened, and lawful" })}</span>
          {t("intelligence-p2-end", { defaultValue: " in every jurisdiction we touch. What that architecture sees, and who exactly it touches, stays inside the briefing room." })}
        </>
      ),
      chips: [t("cap-all-source-analysis", { defaultValue: "All-Source Analysis" }), t("cap-isr", { defaultValue: "ISR" }), t("cap-threat-warning", { defaultValue: "Threat Warning" }), t("cap-due-diligence", { defaultValue: "Due Diligence" }), t("cap-partner-liaison", { defaultValue: "Partner Liaison" }), t("cap-counter-surveillance", { defaultValue: "Counter-Surveillance" })],
    },
    {
      id: 'advisory', desig: 'S-5 // PLANS', idx: '06',
      h: t("advisory-heading", { defaultValue: "Strategic Advisory" }),
      brand: t("advisory-brand", { defaultValue: "Risk · architecture · contingency planning" }),
      p1: t("advisory-p1", { defaultValue: "For boards, ministries, and country teams operating in fragile environments, we design the security architecture and the plan behind it: threat and risk assessment, contingency and crisis planning, red teaming of existing posture, and the entry strategy for a new and difficult market." }),
      p2: t("advisory-p2", { defaultValue: "Advisory here is not a deck. It is informed by the same intelligence cell and delivered by planners who have owned the consequences of being wrong." }),
      chips: [t("cap-security-architecture", { defaultValue: "Security Architecture" }), t("cap-risk-assessment", { defaultValue: "Risk Assessment" }), t("cap-contingency-planning", { defaultValue: "Contingency Planning" }), t("cap-red-teaming", { defaultValue: "Red Teaming" }), t("cap-board-advisory", { defaultValue: "Board Advisory" }), t("cap-country-entry", { defaultValue: "Country Entry" })],
    },
    {
      id: 'sovereign', desig: 'S-9 // CIMIC', idx: '07',
      h: t("sovereign-heading", { defaultValue: "Sovereign Solutions" }),
      brand: t("sovereign-brand", { defaultValue: "Stabilization · governance advisory · political transition" }),
      p1: t("sovereign-p1", { defaultValue: "A small number of clients are sovereign states reshaping their security posture from the ground up. For them we offer discreet stabilization, governance advisory, security-sector reform, and political-transition support — a single, quiet relationship that touches every level of how a state secures itself." }),
      p2: t("sovereign-p2", { defaultValue: "This line is delivered by invitation, under strict confidentiality, and within the legal frameworks that govern it. We do not discuss its methods, its clients, or its outcomes in the open. The work is rarely visible. It is meant to be." }),
      chips: [t("cap-stabilization", { defaultValue: "Stabilization" }), t("cap-governance-advisory", { defaultValue: "Governance Advisory" }), t("cap-security-sector-reform", { defaultValue: "Security-Sector Reform" }), t("cap-transition-support", { defaultValue: "Transition Support" }), t("cap-strategic-communications", { defaultValue: "Strategic Communications" }), t("cap-sovereign-liaison", { defaultValue: "Sovereign Liaison" })],
    },
  ];
  const [c1, c2, c3, c4, c5, c6, c7] = caps as [Cap, Cap, Cap, Cap, Cap, Cap, Cap];
  const H0 = [34, 40, 30, 38, 32, 42, 36];

  return (
    <div className="pg-capabilities">
      {/* ══ PAGE HEAD — a turned disc rising from the foot of the stage ══ */}
      <section className="pagehead stage ph">
        <Hud />
        <div className="pagehead-obj ph-obj" aria-hidden="true">
          <div className="ph-rig">
            <span className="obj-ring chrome ph-ring" />
            <span className="obj-disc chrome ph-disc" data-chrome-live="" />
          </div>
        </div>
        <div className="wrap">
          <div className="metaline">
            <span className="field"><b>{t("file-label", { defaultValue: "File" })}</b> ▸ <span className="v"><Decrypt text="CAPABILITIES" /></span></span>
            <span className="field"><b>{t("class-label", { defaultValue: "Class" })}</b> ▸ <span className="v"><Decrypt text="RESTRICTED" /></span></span>
            <span className="field"><b>{t("lines-label", { defaultValue: "Lines" })}</b> ▸ <span className="v"><Decrypt text="07" /></span></span>
          </div>
          <span className="desig">{t("lines-of-operation", { defaultValue: "Lines of Operation" })}</span>
          <h1 className="display">
            <Words text={t("hero-heading", { defaultValue: "Seven capabilities. One chain of command." })} />
          </h1>
          <p className="lede ld">
            {t("hero-lede-capabilities-page", { defaultValue: "We are organized like a real staff — each line carries its section designator. Together they let a client protect people, hold ground, train a force, supply it, understand the threat, plan the response, and reshape the picture entirely — without ever leaving the command." })}
          </p>
        </div>
      </section>

      {/* ══ THE STAFF ASSEMBLES — seven bars rise, a rail closes across their tops ══ */}
      <Scene len={2.4} className="stage staff" pinClassName="staff-pin">
        <Hud />
        <div className="staff-inner">
          <div className="staff-cap" aria-hidden="true">
            <span className="staff-count glass glass--pill">
              <b>{t("lines-label", { defaultValue: "Lines" })}</b>
              <i className="staff-n" />/07
            </span>
          </div>
          <nav className="staff-nav" aria-label={t("staff-nav-label", { defaultValue: "The seven lines of operation" })}>
            <i className="staff-rail obj-rail chrome sc-t" style={cssVars({ '--a': 84, '--b': 98 })} aria-hidden="true" />
            <ol className="staff-list">
              {caps.map((c, i) => {
                const a = 4 + i * 9.5;
                return (
                  <li key={c.id} className="bar sc-t" style={cssVars({ '--a': a, '--b': a + 24, '--h0': H0[i] ?? 34 })}>
                    <Link className="bar-link" to="/rmh-pmc/capabilities" hash={c.id}>
                      <i className="bar-col chrome" aria-hidden="true" />
                      <span className="bar-label">
                        <span className="bar-i">{c.idx}</span>
                        <span className="bar-d">{c.desig}</span>
                        <span className="bar-n">{c.h}</span>
                        <Arrow className="arw bar-go" />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
      </Scene>

      {/* ══ 01 PROTECTIVE — paper: an orb inside two rings ══ */}
      <section id={c1.id} className="sec cap c1">
        <div className="wrap c1-wrap">
          <Head c={c1} center />
          <div className="c1-plate rv-scale">
            <div className="well c1-well">
              <div className="cap-spin cap-spin--rev c1-r2" aria-hidden="true"><span className="obj-ring chrome" /></div>
              <div className="cap-spin c1-r1" aria-hidden="true"><span className="obj-ring chrome" /></div>
              <span className="obj-orb chrome c1-orb" data-chrome-live="" aria-hidden="true" />
              <span className="c1-tag glass glass--pill" aria-hidden="true"><span className="cap-num steel">{c1.idx}</span></span>
            </div>
          </div>
          <div className="c1-text">
            <Prose c={c1} />
            <Chips items={c1.chips} />
          </div>
        </div>
      </section>

      {/* ══ 02 GUARDING — stage: a palisade of bars under a glass lens ══ */}
      <section id={c2.id} className="cap c2 stage">
        <Hud />
        <div className="wrap c2-wrap">
          <Head c={c2} center num />
          <div className="c2-bars obj-bars" aria-hidden="true">
            {POSTS.map((h, i) => <i key={i} style={cssVars({ '--h': h, '--i': i })} />)}
          </div>
          <div className="c2-cardwrap rv-scale">
            <div className="c2-card glass glass--lens">
              <Prose c={c2} />
              <Chips items={c2.chips} />
            </div>
          </div>
        </div>
      </section>

      {/* ══ 03 TRAINING — paper: a sticky turned disc beside the syllabus ══ */}
      <section id={c3.id} className="sec cap c3">
        <div className="wrap c3-grid">
          <div className="c3-side">
            <div className="c3-disc cap-spin" aria-hidden="true"><span className="obj-disc chrome" data-chrome-live="" /></div>
            <span className="c3-num glass glass--lens" aria-hidden="true"><span className="cap-num steel">{c3.idx}</span></span>
          </div>
          <div className="c3-main">
            <Head c={c3} />
            <Prose c={c3} />
            <ol className="c3-rows">
              {c3.chips.map((x) => <li key={x} className="rv">{x}</li>)}
            </ol>
          </div>
        </div>
      </section>

      {/* ══ 04 LOGISTICS — stage: pills ride three rails ══ */}
      <section id={c4.id} className="cap c4 stage">
        <Hud />
        <div className="wrap c4-wrap">
          <Head c={c4} center num />
          <Prose c={c4} className="c4-prose" />
        </div>
        <div className="c4-lanes">
          {[0, 1, 2].map((l) => (
            <div key={l} className="sx c4-lane chrome chrome-ingot">
              <ul className={`sx-track${l === 1 ? ' sx-rev' : ''}`}>
                {c4.chips.slice(l * 2, l * 2 + 2).map((x) => (
                  <li key={x} className="c4-chip glass glass--pill">{x}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ══ 05 INTELLIGENCE — paper: a reticle under a glass card ══ */}
      <section id={c5.id} className="sec cap c5">
        <div className="wrap">
          <div className="well c5-well">
            <div className="c5-ret rv-lock" aria-hidden="true"><Reticle size="100%" live /></div>
            <div className="c5-card glass glass--lens">
              <div className="c5-top">
                <span className="desig">{c5.desig}</span>
                <span className="cap-num steel c5-num" aria-hidden="true">{c5.idx}</span>
              </div>
              <h2 className="h2 cap-h">{c5.h}</h2>
              <p className="meta cap-brand">{c5.brand}</p>
              <div className="cap-prose">
                <p className="body">{c5.p1}</p>
                <p className="body">{c5.p2}</p>
              </div>
            </div>
          </div>
          <Chips items={c5.chips} className="c5-chips" />
        </div>
      </section>

      {/* ══ 06 ADVISORY — stage: a hex plate between two plans ══ */}
      <section id={c6.id} className="cap c6 stage">
        <Hud />
        <div className="wrap c6-wrap">
          <Head c={c6} center num />
          <div className="c6-plate">
            <div className="c6-cell c6-cell--a rv-scale"><div className="c6-card glass glass--lens"><p className="body">{c6.p1}</p></div></div>
            <div className="c6-hex cap-spin cap-spin--hex" aria-hidden="true"><span className="obj-hex chrome" data-chrome-live="" /></div>
            <div className="c6-cell c6-cell--b rv-scale"><div className="c6-card glass glass--lens"><p className="body">{c6.p2}</p></div></div>
          </div>
          <Chips items={c6.chips} className="c6-chips" />
        </div>
      </section>

      {/* ══ 07 SOVEREIGN — paper: a satin slab and a ring, quietly ══ */}
      <section id={c7.id} className="sec cap c7">
        <div className="wrap c7-wrap">
          <Head c={c7} center />
          <div className="c7-plate rv-scale">
            <div className="obj-slab c7-slab">
              <div className="cap-spin c7-ring" aria-hidden="true"><span className="obj-ring chrome" /></div>
              <div className="cap-spin cap-spin--rev c7-ring2" aria-hidden="true"><span className="obj-ring chrome" /></div>
              <span className="cap-num steel c7-num" aria-hidden="true">{c7.idx}</span>
            </div>
          </div>
          <div className="c7-text">
            <Prose c={c7} />
            <ul className="cap-chips c7-chips">
              {c7.chips.map((x, i) => (
                <li key={x} className={`rv${i % 3 ? ` d${i % 3}` : ''}`}><span className="cap-chip glass glass--pill glass--quiet">{x}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ══ ONE COMMAND ══ */}
      <CtaBand
        desig={t("cta-desig-capabilities-page", { defaultValue: "One Command" })}
        title={t("cta-heading-capabilities-page", { defaultValue: "The advantage is in the chain of command." })}
        body={t("cta-body-capabilities-page", { defaultValue: "No single line works alone — protection draws on intelligence, logistics carries them all, and plans tie them together under one staff. Tell us the problem; we will bring the whole company to it." })}
      >
        <Link className="btn" to="/rmh-pmc/contact">{t("cta-link", { defaultValue: "Request a briefing" })} <Arrow /></Link>
      </CtaBand>
    </div>
  );
}
