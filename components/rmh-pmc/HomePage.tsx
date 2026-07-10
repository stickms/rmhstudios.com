import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Decrypt, TransmissionLog } from './shared';

export default function HomePage() {
  const { t } = useTranslation("c-rmh-pmc");
  return (
    <>
      {/* ══ HERO — declassified brief ══ */}
      <section className="brief">
        <svg className="brief-schematic" viewBox="0 0 600 600" fill="none" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <g className="spin-slow" stroke="#E89A3C">
            <circle cx="300" cy="300" r="262" strokeOpacity="0.18" />
            <circle cx="300" cy="300" r="196" strokeOpacity="0.13" />
            <circle cx="300" cy="300" r="130" strokeOpacity="0.11" />
            <g strokeOpacity="0.09">
              <ellipse cx="300" cy="300" rx="262" ry="96" />
              <ellipse cx="300" cy="300" rx="262" ry="184" />
              <ellipse cx="300" cy="300" rx="120" ry="262" />
              <line x1="38" y1="300" x2="562" y2="300" /><line x1="300" y1="38" x2="300" y2="562" />
            </g>
            <g strokeOpacity="0.5">
              <line x1="300" y1="38" x2="300" y2="56" /><line x1="300" y1="544" x2="300" y2="562" />
              <line x1="38" y1="300" x2="56" y2="300" /><line x1="544" y1="300" x2="562" y2="300" />
            </g>
          </g>
          <g>
            <circle className="ping" cx="392" cy="206" r="4.5" fill="#F6B45A" />
            <circle className="ping p2" cx="200" cy="372" r="4.5" fill="#F6B45A" />
            <circle className="ping p3" cx="356" cy="392" r="3.6" fill="#E89A3C" />
          </g>
          <path d="M300 300 L392 206" stroke="#F6B45A" strokeWidth="1" strokeOpacity="0.6" strokeDasharray="2 5" />
          <circle cx="300" cy="300" r="4" fill="#F6B45A" />
        </svg>

        <div className="container brief-content">
          <div className="brief-meta reveal">
            <span className="field"><b>{t("meta-file-label", { defaultValue: "File" })}</b> ▸ <span className="v"><Decrypt text="RMH-PMC / DOSSIER 2026" /></span></span>
            <span className="field"><b>{t("meta-class-label", { defaultValue: "Class" })}</b> ▸ <span className="v"><Decrypt text="RESTRICTED" /></span></span>
            <span className="field"><b>{t("meta-status-label", { defaultValue: "Status" })}</b> ▸ <span className="v"><Decrypt text="OPERATIONAL" /></span></span>
          </div>
          <h1>
            <span className="redactln">{t("hero-line1", { defaultValue: "When the outcome" })}</span><br />
            <span className="redactln l2"><em>{t("hero-line2-cannot", { defaultValue: "cannot" })}</em> {t("hero-line2-rest", { defaultValue: "be left" })}</span><br />
            <span className="redactln l3">{t("hero-line3", { defaultValue: "to chance" })}</span>
          </h1>
          <p className="lede reveal d2">
            {t("hero-lede", { defaultValue: "RMH PMC is the private military arm of RMH Studios. We field tier-one operators, a sovereign-grade intelligence cell, and a global logistics tail to protect people, secure ground, and shape outcomes for governments, corporations, and institutions — wherever the stakes are highest." })}
          </p>
          <div className="brief-actions reveal d3">
            <Link className="btn btn-amber" to="/rmh-pmc/capabilities">
              {t("view-capabilities", { defaultValue: "View capabilities" })} <span className="arw">→</span>
            </Link>
            <Link className="btn btn-outline" to="/rmh-pmc/contact">
              {t("request-briefing", { defaultValue: "Request a briefing" })} <span className="arw">→</span>
            </Link>
          </div>
        </div>
      </section>

      <TransmissionLog />

      {/* ══ READOUT ══ */}
      <section className="sec tight">
        <div className="container">
          <div className="readout reveal">
            <div className="cell"><div className="l">{t("stat-roster-label", { defaultValue: "Roster" })}</div><div className="v">200+</div><div className="k">{t("stat-roster-desc", { defaultValue: "Vetted operators on the active roster" })}</div></div>
            <div className="cell"><div className="l">{t("stat-theaters-label", { defaultValue: "Theaters" })}</div><div className="v">40+</div><div className="k">{t("stat-theaters-desc", { defaultValue: "Active or standby presence worldwide" })}</div></div>
            <div className="cell"><div className="l">{t("stat-liaison-label", { defaultValue: "Liaison" })}</div><div className="v">14</div><div className="k">{t("stat-liaison-desc", { defaultValue: "Allied services in our architecture" })}</div></div>
            <div className="cell"><div className="l">{t("stat-watch-label", { defaultValue: "Watch" })}</div><div className="v">24/7</div><div className="k">{t("stat-watch-desc", { defaultValue: "Operations center, always manned" })}</div></div>
          </div>
        </div>
      </section>

      {/* ══ §01 COMMAND ══ */}
      <section className="sec">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">§01</div>
            <div className="sechead-body">
              <span className="desig">{t("s01-desig", { defaultValue: "The Company" })}</span>
              <h2>{t("s01-heading", { defaultValue: "One command, drawn from the world's best" })}</h2>
              <p className="lede">
                {t("s01-lede", { defaultValue: "Most security firms are a staffing agency with a logo. RMH PMC is built the other way around — a single command, manned almost entirely by veterans of tier-one special operations units, with an intelligence cell and a logistics tail that move at the same tempo." })}
              </p>
            </div>
          </div>
          <div className="prose reveal d1" style={{ maxWidth: '70ch' }}>
            <p>
              {t("s01-body", { defaultValue: "That structure lets us put the whole organization behind a single task: the operators on the ground, the analysts reading it, and the planners who keep them supplied — under one chain of command, with the discretion our clients require." })}
            </p>
            <p style={{ marginTop: 24 }}>
              <Link className="btn-text" to="/rmh-pmc/command">{t("read-command-file", { defaultValue: "Read the command file" })} <span className="arw">→</span></Link>
            </p>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* ══ §02 CAPABILITIES — dossier entries ══ */}
      <section className="sec">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">§02</div>
            <div className="sechead-body">
              <span className="desig">{t("s02-desig", { defaultValue: "Lines of Operation" })}</span>
              <h2>{t("s02-heading", { defaultValue: "Seven capabilities, one chain of command" })}</h2>
              <p className="lede">
                {t("s02-lede", { defaultValue: "Organized like a real staff — each line carries its section designator. Together they let a client protect, supply, understand, and act without ever leaving the command." })}
              </p>
            </div>
          </div>

          <div className="reveal">
            {[
              { d: 'S-3 // OPERATIONS', n: t("cap-protective-name", { defaultValue: "Protective Services" }), b: t("cap-protective-brand", { defaultValue: "Close protection · secure movement · crisis response" }), p: t("cap-protective-desc", { defaultValue: "Executive and diplomatic protection, secure movement, and crisis response for high-value principals in permissive and hostile environments." }), h: 'protective' },
              { d: 'S-3 // GUARD FORCE', n: t("cap-guarding-name", { defaultValue: "Static Guarding" }), b: t("cap-guarding-brand", { defaultValue: "Embassies · energy · ports · infrastructure" }), p: t("cap-guarding-desc", { defaultValue: "Manned guarding and access control for embassies, energy sites, ports, and critical infrastructure — posted, trained, and supervised to standard." }), h: 'guarding' },
              { d: 'S-7 // TRAINING', n: t("cap-training-name", { defaultValue: "Training & Doctrine" }), b: t("cap-training-brand", { defaultValue: "Selection-grade instruction" }), p: t("cap-training-desc", { defaultValue: "Selection-grade instruction for national militaries and police units: marksmanship, CQB, maritime interdiction, and command-staff doctrine." }), h: 'training' },
              { d: 'S-4 // LOGISTICS', n: t("cap-logistics-name", { defaultValue: "Expeditionary Logistics" }), b: t("cap-logistics-brand", { defaultValue: "Air · ground · maritime · sustainment" }), p: t("cap-logistics-desc", { defaultValue: "Air, ground, and maritime movement, basing, and sustainment that put a self-supporting force anywhere within days." }), h: 'logistics' },
              { d: 'S-2 // INTELLIGENCE', n: t("cap-intelligence-name", { defaultValue: "Intelligence & ISR" }), b: t("cap-intelligence-brand", { defaultValue: "All-source · cleared liaison architecture" }), p: t("cap-intelligence-desc", { defaultValue: "All-source intelligence, surveillance, and reconnaissance — with embedded liaison to allied national services." }), h: 'intelligence' },
              { d: 'S-5 // PLANS', n: t("cap-advisory-name", { defaultValue: "Strategic Advisory" }), b: t("cap-advisory-brand", { defaultValue: "Risk · architecture · contingency" }), p: t("cap-advisory-desc", { defaultValue: "Risk, security architecture, and contingency planning for boards, ministries, and country teams operating in fragile environments." }), h: 'advisory' },
              { d: 'S-9 // CIMIC', n: t("cap-sovereign-name", { defaultValue: "Sovereign Solutions" }), b: t("cap-sovereign-brand", { defaultValue: "Stabilization · governance · transition" }), p: t("cap-sovereign-desc", { defaultValue: "Discreet stabilization, governance advisory, and political-transition support for sovereign clients reshaping their security posture." }), h: 'sovereign' },
            ].map((e, i) => (
              <Link className="entry" to="/rmh-pmc/capabilities" hash={e.h} key={e.h}>
                <div className="entry-key">
                  <div className="entry-desig">{e.d}</div>
                  <div className="entry-idx">{String(i + 1).padStart(2, '0')}</div>
                </div>
                <div>
                  <h2>{e.n}</h2>
                  <div className="entry-brand">{e.b}</div>
                  <p>{e.p}</p>
                  <span className="btn-text">{t("open-record", { defaultValue: "Open record" })} <span className="arw">→</span></span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* ══ §03 PARTNER LIAISON ══ */}
      <section className="sec">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">§03</div>
            <div className="sechead-body">
              <span className="desig">{t("s03-desig", { defaultValue: "Partner Liaison" })}</span>
              <h2>{t("s03-heading", { defaultValue: "Cleared to work alongside the agencies that matter" })}</h2>
            </div>
          </div>
          <div className="prose reveal d1" style={{ maxWidth: '72ch' }}>
            <p>
              {t("s03-body1", { defaultValue: "Our intelligence cell does not operate in isolation. RMH PMC maintains a cleared liaison architecture with allied national services — including longstanding working relationships with U.S. and Israeli intelligence partners — so our clients benefit from collection, vetting, and warning that a private firm could not generate alone." })}
            </p>
            <p>
              {t("s03-body2", { defaultValue: "Every engagement is run through that architecture: deconflicted, sanctions-screened, and lawful in every jurisdiction we touch." })}
            </p>
            <p style={{ marginTop: 8 }}>
              <Link className="btn-text" to="/rmh-pmc/capabilities" hash="intelligence">{t("the-intelligence-line", { defaultValue: "The intelligence line" })} <span className="arw">→</span></Link>
            </p>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* ══ §04 PEDIGREE ══ */}
      <section className="sec tight">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">§04</div>
            <div className="sechead-body">
              <span className="desig">{t("s04-desig", { defaultValue: "Pedigree" })}</span>
              <h2>{t("s04-heading", { defaultValue: "Hired from the units that set the standard" })}</h2>
              <p className="lede">
                {t("s04-lede", { defaultValue: "Our operators come from the tier-one elements of allied nations — selected again, on our terms, before they ever deploy under our flag." })}
              </p>
            </div>
          </div>
          <div className="lineage reveal d1">
            <div className="lineage-track">
              {[...['SAS', 'SBS', 'DELTA', 'DEVGRU', 'SAYERET MATKAL', 'SHAYETET 13', 'GIGN', 'KSK', 'JTF2', 'GROM', 'SASR', 'JW KOMANDOSÓW', 'SOG', 'RECON'], ...['SAS', 'SBS', 'DELTA', 'DEVGRU', 'SAYERET MATKAL', 'SHAYETET 13', 'GIGN', 'KSK', 'JTF2', 'GROM', 'SASR', 'JW KOMANDOSÓW', 'SOG', 'RECON']].map((u, i) => (
                <span key={i}>{u}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* ══ §05 INTELLIGENCE PREVIEW ══ */}
      <section className="sec">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">§05</div>
            <div className="sechead-body">
              <span className="desig">{t("s05-desig", { defaultValue: "Latest Dispatches" })}</span>
              <h2>{t("s05-heading", { defaultValue: "The product our clients act on" })}</h2>
              <p className="lede">
                {t("s05-lede", { defaultValue: "Assessments from the same intelligence cell that supports our deployed teams — sanitized for release." })}
              </p>
            </div>
          </div>

          <div className="cable-lead reveal">
            <Link className="lead-main" to="/rmh-pmc/intelligence">
              <span className="metaline">{t("lead-main-metaline", { defaultValue: "Threat" })} <span className="dot" /> <span className="t">RMH-INT-0434 · 21 JUN 2026</span></span>
              <h3>{t("lead-main-heading", { defaultValue: "The 2026 fragility map: where instability becomes a private problem" })}</h3>
              <p>
                {t("lead-main-body", { defaultValue: "Our standing read on the corridors, contested coastlines, and governance vacuums most likely to demand a private response this year — and how clients are positioning ahead of them." })}
              </p>
            </Link>
            <div className="lead-side">
              <Link className="side-item" to="/rmh-pmc/intelligence">
                <span className="metaline">{t("side-maritime-metaline", { defaultValue: "Maritime" })}</span>
                <h4>{t("side-maritime-heading", { defaultValue: "The next chokepoint, before it closes" })}</h4>
                <p>{t("side-maritime-body", { defaultValue: "Red Sea and Gulf of Aden risk, week by week." })}</p>
              </Link>
              <Link className="side-item" to="/rmh-pmc/intelligence">
                <span className="metaline">{t("side-stabilization-metaline", { defaultValue: "Stabilization" })}</span>
                <h4>{t("side-stabilization-heading", { defaultValue: "Why some transitions hold and others don't" })}</h4>
                <p>{t("side-stabilization-body", { defaultValue: "Patterns from our sovereign engagements." })}</p>
              </Link>
              <Link className="side-item" to="/rmh-pmc/intelligence">
                <span className="metaline">{t("side-cyber-metaline", { defaultValue: "Cyber & Signals" })}</span>
                <h4>{t("side-cyber-heading", { defaultValue: "Principals targeted before they land" })}</h4>
                <p>{t("side-cyber-body", { defaultValue: "Pre-travel digital threat reduction." })}</p>
              </Link>
            </div>
          </div>
          <Link className="btn-text reveal" to="/rmh-pmc/intelligence">{t("open-manifest", { defaultValue: "Open the manifest" })} <span className="arw">→</span></Link>
        </div>
      </section>

      {/* ══ SELECTION CTA ══ */}
      <section className="sec tight">
        <div className="container">
          <div className="cta-band reveal">
            <span className="desig center">{t("cta-desig", { defaultValue: "Selection" })}</span>
            <h2 style={{ marginTop: 16 }}>{t("cta-heading", { defaultValue: "The standard does not lower for anyone" })}</h2>
            <p>
              {t("cta-body", { defaultValue: "We recruit a small number of operators, analysts, logisticians, and medics each year — and select them again before they ever carry our flag. If you have already proven it, prove it once more." })}
            </p>
            <Link className="btn btn-amber" to="/rmh-pmc/operators">{t("selection-recruiting", { defaultValue: "Selection & recruiting" })} <span className="arw">→</span></Link>
          </div>
        </div>
      </section>
    </>
  );
}
