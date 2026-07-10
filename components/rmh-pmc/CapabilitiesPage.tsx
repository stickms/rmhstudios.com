import { Link } from '@tanstack/react-router';
import { useTranslation } from "react-i18next";
import { Decrypt } from './shared';

export default function CapabilitiesPage() {
  const { t } = useTranslation("c-rmh-pmc");
  return (
    <>
      <section className="pagehead reveal">
        <div className="container pagehead-inner">
          <div className="brief-meta">
            <span className="field"><b>{t("file-label", { defaultValue: "File" })}</b> ▸ <span className="v"><Decrypt text="CAPABILITIES" /></span></span>
            <span className="field"><b>{t("class-label", { defaultValue: "Class" })}</b> ▸ <span className="v"><Decrypt text="RESTRICTED" /></span></span>
            <span className="field"><b>{t("lines-label", { defaultValue: "Lines" })}</b> ▸ <span className="v"><Decrypt text="07" /></span></span>
          </div>
          <span className="desig">{t("lines-of-operation", { defaultValue: "Lines of Operation" })}</span>
          <h1>{t("hero-heading", { defaultValue: "Seven capabilities. One chain of command." })}</h1>
          <p className="lede">
            {t("hero-lede", { defaultValue: "We are organized like a real staff — each line carries its section designator. Together they let a client protect people, hold ground, train a force, supply it, understand the threat, plan the response, and reshape the picture entirely — without ever leaving the command." })}
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
              <h2>{t("protective-heading", { defaultValue: "Protective Services" })}</h2>
              <div className="entry-brand">{t("protective-brand", { defaultValue: "Close protection · secure movement · crisis response" })}</div>
              <p>
                {t("protective-p1", { defaultValue: "We keep principals alive and moving. Executive and diplomatic protection details, secure ground and air movement, residential and venue security, and crisis and evacuation planning — delivered by operators who have run protection in permissive capitals and active conflict zones alike." })}
              </p>
              <p>
                {t("protective-p2", { defaultValue: "Every detail is built backward from the threat: advance work, route study, surveillance detection, and an embedded medical capability, so a bad day is one we have already rehearsed." })}
              </p>
              <ul className="caps">
                <li>{t("cap-close-protection", { defaultValue: "Close Protection" })}</li><li>{t("cap-secure-movement", { defaultValue: "Secure Movement" })}</li><li>{t("cap-residential-security", { defaultValue: "Residential Security" })}</li>
                <li>{t("cap-surveillance-detection", { defaultValue: "Surveillance Detection" })}</li><li>{t("cap-medical-cover", { defaultValue: "Medical Cover" })}</li><li>{t("cap-evacuation", { defaultValue: "Evacuation" })}</li>
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
              <h2>{t("guarding-heading", { defaultValue: "Facility & Static Guarding" })}</h2>
              <div className="entry-brand">{t("guarding-brand", { defaultValue: "Embassies · energy · ports · critical infrastructure" })}</div>
              <p>
                {t("guarding-p1", { defaultValue: "Manned guarding and access control for the sites that cannot afford a lapse — embassies and missions, energy installations, ports and terminals, and critical national infrastructure. Posts are manned, trained, supervised, and audited to a written standard, with control rooms and K9 capability where the threat demands it." })}
              </p>
              <p>
                {t("guarding-p2", { defaultValue: "A guard force is only as good as the supervision behind it. Ours is run to the same tempo and discipline as our protective details — not a uniform agency with a logo." })}
              </p>
              <ul className="caps">
                <li>{t("cap-manned-guarding", { defaultValue: "Manned Guarding" })}</li><li>{t("cap-access-control", { defaultValue: "Access Control" })}</li><li>{t("cap-embassy-posts", { defaultValue: "Embassy Posts" })}</li>
                <li>{t("cap-energy-ports", { defaultValue: "Energy & Ports" })}</li><li>{t("cap-k9", { defaultValue: "K9" })}</li><li>{t("cap-control-rooms", { defaultValue: "Control Rooms" })}</li>
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
              <h2>{t("training-heading", { defaultValue: "Training & Doctrine" })}</h2>
              <div className="entry-brand">{t("training-brand", { defaultValue: "Selection-grade instruction for militaries and police" })}</div>
              <p>
                {t("training-p1", { defaultValue: "We train national militaries and police units to a selection standard, not a certificate standard. Marksmanship and CQB, maritime interdiction and boarding, mobile force tactics, and command-staff doctrine — taught by instructors who built and led these capabilities in their own services." })}
              </p>
              <p>
                {t("training-p2", { defaultValue: "Where a client needs the capability to outlast us, we run train-the-trainer programs that leave a self-sustaining cadre behind, not a dependency." })}
              </p>
              <ul className="caps">
                <li>{t("cap-marksmanship", { defaultValue: "Marksmanship" })}</li><li>{t("cap-cqb", { defaultValue: "CQB" })}</li><li>{t("cap-maritime-interdiction", { defaultValue: "Maritime Interdiction" })}</li>
                <li>{t("cap-mobile-force-training", { defaultValue: "Mobile Force Training" })}</li><li>{t("cap-command-staff", { defaultValue: "Command Staff" })}</li><li>{t("cap-train-the-trainer", { defaultValue: "Train-the-Trainer" })}</li>
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
              <h2>{t("logistics-heading", { defaultValue: "Expeditionary Logistics" })}</h2>
              <div className="entry-brand">{t("logistics-brand", { defaultValue: "Move · base · sustain — anywhere within days" })}</div>
              <p>
                {t("logistics-p1", { defaultValue: "Air, ground, and maritime movement, basing, and sustainment that put a self-supporting force on the ground within days — and keep it supplied for as long as the mandate runs. Charter lift, hardened convoys, camps and life support, fuel and ration chains, and an organic medevac capability." })}
              </p>
              <p>
                {t("logistics-p2", { defaultValue: "We handle customs and clearance through the same liaison channels that run the rest of the company, so the tail never becomes the bottleneck." })}
              </p>
              <ul className="caps">
                <li>{t("cap-air-charter", { defaultValue: "Air Charter" })}</li><li>{t("cap-ground-convoy", { defaultValue: "Ground Convoy" })}</li><li>{t("cap-basing-camps", { defaultValue: "Basing & Camps" })}</li>
                <li>{t("cap-sustainment", { defaultValue: "Sustainment" })}</li><li>{t("cap-medevac", { defaultValue: "Medevac" })}</li><li>{t("cap-customs-clearance", { defaultValue: "Customs & Clearance" })}</li>
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
              <h2>{t("intelligence-heading", { defaultValue: "Intelligence & ISR" })}</h2>
              <div className="entry-brand">{t("intelligence-brand", { defaultValue: "All-source · cleared liaison architecture" })}</div>
              <p>
                {t("intelligence-p1", { defaultValue: "Our intelligence cell turns noise into decisions: all-source analysis, surveillance and reconnaissance, threat warning, due diligence, and counter-surveillance — the product our deployed teams and our clients act on, not a quarterly newsletter." })}
              </p>
              <p>
                {t("intelligence-p2", { defaultValue: "The cell does not work in isolation. RMH PMC maintains a cleared liaison architecture with allied national services — including longstanding working relationships with U.S. and Israeli intelligence partners — giving clients access to collection, vetting, and warning that no private firm could generate alone. Every engagement is run through that architecture: " })}<span className="amber-text">{t("intelligence-deconflicted", { defaultValue: "deconflicted, sanctions-screened, and lawful" })}</span>{t("intelligence-p2-end", { defaultValue: " in every jurisdiction we touch. What that architecture sees, and who exactly it touches, stays inside the briefing room." })}
              </p>
              <ul className="caps">
                <li>{t("cap-all-source-analysis", { defaultValue: "All-Source Analysis" })}</li><li>{t("cap-isr", { defaultValue: "ISR" })}</li><li>{t("cap-threat-warning", { defaultValue: "Threat Warning" })}</li>
                <li>{t("cap-due-diligence", { defaultValue: "Due Diligence" })}</li><li>{t("cap-partner-liaison", { defaultValue: "Partner Liaison" })}</li><li>{t("cap-counter-surveillance", { defaultValue: "Counter-Surveillance" })}</li>
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
              <h2>{t("advisory-heading", { defaultValue: "Strategic Advisory" })}</h2>
              <div className="entry-brand">{t("advisory-brand", { defaultValue: "Risk · architecture · contingency planning" })}</div>
              <p>
                {t("advisory-p1", { defaultValue: "For boards, ministries, and country teams operating in fragile environments, we design the security architecture and the plan behind it: threat and risk assessment, contingency and crisis planning, red teaming of existing posture, and the entry strategy for a new and difficult market." })}
              </p>
              <p>
                {t("advisory-p2", { defaultValue: "Advisory here is not a deck. It is informed by the same intelligence cell and delivered by planners who have owned the consequences of being wrong." })}
              </p>
              <ul className="caps">
                <li>{t("cap-security-architecture", { defaultValue: "Security Architecture" })}</li><li>{t("cap-risk-assessment", { defaultValue: "Risk Assessment" })}</li><li>{t("cap-contingency-planning", { defaultValue: "Contingency Planning" })}</li>
                <li>{t("cap-red-teaming", { defaultValue: "Red Teaming" })}</li><li>{t("cap-board-advisory", { defaultValue: "Board Advisory" })}</li><li>{t("cap-country-entry", { defaultValue: "Country Entry" })}</li>
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
              <h2>{t("sovereign-heading", { defaultValue: "Sovereign Solutions" })}</h2>
              <div className="entry-brand">{t("sovereign-brand", { defaultValue: "Stabilization · governance advisory · political transition" })}</div>
              <p>
                {t("sovereign-p1", { defaultValue: "A small number of clients are sovereign states reshaping their security posture from the ground up. For them we offer discreet stabilization, governance advisory, security-sector reform, and political-transition support — a single, quiet relationship that touches every level of how a state secures itself." })}
              </p>
              <p>
                {t("sovereign-p2", { defaultValue: "This line is delivered by invitation, under strict confidentiality, and within the legal frameworks that govern it. We do not discuss its methods, its clients, or its outcomes in the open. The work is rarely visible. It is meant to be." })}
              </p>
              <ul className="caps">
                <li>{t("cap-stabilization", { defaultValue: "Stabilization" })}</li><li>{t("cap-governance-advisory", { defaultValue: "Governance Advisory" })}</li><li>{t("cap-security-sector-reform", { defaultValue: "Security-Sector Reform" })}</li>
                <li>{t("cap-transition-support", { defaultValue: "Transition Support" })}</li><li>{t("cap-strategic-communications", { defaultValue: "Strategic Communications" })}</li><li>{t("cap-sovereign-liaison", { defaultValue: "Sovereign Liaison" })}</li>
              </ul>
            </div>
          </section>

        </div>
      </section>

      <section className="sec tight">
        <div className="container">
          <div className="cta-band reveal">
            <span className="desig center">{t("cta-desig", { defaultValue: "One Command" })}</span>
            <h2 style={{ marginTop: 18 }}>{t("cta-heading", { defaultValue: "The advantage is in the chain of command." })}</h2>
            <p>
              {t("cta-body", { defaultValue: "No single line works alone — protection draws on intelligence, logistics carries them all, and plans tie them together under one staff. Tell us the problem; we will bring the whole company to it." })}
            </p>
            <Link className="btn btn-amber" to="/rmh-pmc/contact">{t("cta-link", { defaultValue: "Request a briefing" })} <span className="arw">→</span></Link>
          </div>
        </div>
      </section>
    </>
  );
}
