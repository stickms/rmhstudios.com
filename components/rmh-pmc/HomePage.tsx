/**
 * RMH PMC home — the reference implementation of "the sight" (rmh-pmc.css,
 * pages/home.css). Paper and stage alternate: the hero, the readout, the
 * seven lines and the closing call to action are pinned scenes on the stage;
 * the log, the company, the liaison, the pedigree and the dispatches are paper.
 */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Mercury } from './Mercury';
import {
  Arrow,
  CtaBand,
  Hud,
  MetaLine,
  Reticle,
  Scene,
  SceneDots,
  SecHead,
  Step,
  TransmissionLog,
  Words,
  cssVars,
  stepWindow,
} from './shared';

const UNITS = ['SAS', 'SBS', 'DELTA', 'DEVGRU', 'SAYERET MATKAL', 'SHAYETET 13', 'GIGN', 'KSK', 'JTF2', 'GROM', 'SASR', 'JW KOMANDOSÓW', 'SOG', 'RECON'];

export default function HomePage() {
  const { t } = useTranslation("c-rmh-pmc");

  const stats = [
    { l: t("stat-roster-label", { defaultValue: "Roster" }), v: '200+', k: t("stat-roster-desc", { defaultValue: "Vetted operators on the active roster" }) },
    { l: t("stat-theaters-label", { defaultValue: "Theaters" }), v: '40+', k: t("stat-theaters-desc", { defaultValue: "Active or standby presence worldwide" }) },
    { l: t("stat-liaison-label", { defaultValue: "Liaison" }), v: '14', k: t("stat-liaison-desc", { defaultValue: "Allied services in our architecture" }) },
    { l: t("stat-watch-label", { defaultValue: "Watch" }), v: '24/7', k: t("stat-watch-desc", { defaultValue: "Operations center, always manned" }) },
  ];

  const caps = [
    { d: 'S-3 // OPERATIONS', n: t("cap-protective-name", { defaultValue: "Protective Services" }), b: t("cap-protective-brand", { defaultValue: "Close protection · secure movement · crisis response" }), p: t("cap-protective-desc", { defaultValue: "Executive and diplomatic protection, secure movement, and crisis response for high-value principals in permissive and hostile environments." }), h: 'protective' },
    { d: 'S-3 // GUARD FORCE', n: t("cap-guarding-name", { defaultValue: "Static Guarding" }), b: t("cap-guarding-brand", { defaultValue: "Embassies · energy · ports · infrastructure" }), p: t("cap-guarding-desc", { defaultValue: "Manned guarding and access control for embassies, energy sites, ports, and critical infrastructure — posted, trained, and supervised to standard." }), h: 'guarding' },
    { d: 'S-7 // TRAINING', n: t("cap-training-name", { defaultValue: "Training & Doctrine" }), b: t("cap-training-brand", { defaultValue: "Selection-grade instruction" }), p: t("cap-training-desc", { defaultValue: "Selection-grade instruction for national militaries and police units: marksmanship, CQB, maritime interdiction, and command-staff doctrine." }), h: 'training' },
    { d: 'S-4 // LOGISTICS', n: t("cap-logistics-name", { defaultValue: "Expeditionary Logistics" }), b: t("cap-logistics-brand", { defaultValue: "Air · ground · maritime · sustainment" }), p: t("cap-logistics-desc", { defaultValue: "Air, ground, and maritime movement, basing, and sustainment that put a self-supporting force anywhere within days." }), h: 'logistics' },
    { d: 'S-2 // INTELLIGENCE', n: t("cap-intelligence-name", { defaultValue: "Intelligence & ISR" }), b: t("cap-intelligence-brand", { defaultValue: "All-source · cleared liaison architecture" }), p: t("cap-intelligence-desc", { defaultValue: "All-source intelligence, surveillance, and reconnaissance — with embedded liaison to allied national services." }), h: 'intelligence' },
    { d: 'S-5 // PLANS', n: t("cap-advisory-name", { defaultValue: "Strategic Advisory" }), b: t("cap-advisory-brand", { defaultValue: "Risk · architecture · contingency" }), p: t("cap-advisory-desc", { defaultValue: "Risk, security architecture, and contingency planning for boards, ministries, and country teams operating in fragile environments." }), h: 'advisory' },
    { d: 'S-9 // CIMIC', n: t("cap-sovereign-name", { defaultValue: "Sovereign Solutions" }), b: t("cap-sovereign-brand", { defaultValue: "Stabilization · governance · transition" }), p: t("cap-sovereign-desc", { defaultValue: "Discreet stabilization, governance advisory, and political-transition support for sovereign clients reshaping their security posture." }), h: 'sovereign' },
  ];
  // The orbit around the company disc: each staff section once.
  const sections = [...new Set(caps.map((c) => c.d.split(' //')[0]))].sort();

  return (
    <div className="pg-home">
      {/* ══ HERO — lock on. A pinned scene on the stage. ══ */}
      <Scene len={2.2} className="stage hero" pinClassName="hero-pin">
        <div className="hero-obj sc-t" style={cssVars({ '--a': 0, '--b': 100 })} aria-hidden="true">
          <Reticle className="hero-reticle" hub={false} live />
          <Mercury className="hero-mercury" />
        </div>
        <div className="hero-veil sc-out" style={cssVars({ '--a': 4, '--b': 30 })} aria-hidden="true" />
        <div className="hero-body">
          <div className="hero-top sc-out" style={cssVars({ '--a': 6, '--b': 34 })}>
            <MetaLine file="RMH-PMC / DOSSIER 2026" cls="RESTRICTED" status="OPERATIONAL" />
            <h1 className="display-xl hero-h1">
              <Words text={t("hero-line1", { defaultValue: "When the outcome" })} /><br />
              <Words text={t("hero-line2-cannot", { defaultValue: "cannot" })} start={3} steel={[0]} />{' '}
              <Words text={t("hero-line2-rest", { defaultValue: "be left" })} start={4} /><br />
              <Words text={t("hero-line3", { defaultValue: "to chance" })} start={6} />
            </h1>
          </div>
          <div className="hero-panel glass glass--lens sc-out" style={cssVars({ '--a': 10, '--b': 40 })}>
            <p className="lede ld" style={cssVars({ '--i': 0 })}>
              {t("hero-lede", { defaultValue: "RMH PMC is the private military arm of RMH Studios. We field tier-one operators, a sovereign-grade intelligence cell, and a global logistics tail to protect people, secure ground, and shape outcomes for governments, corporations, and institutions — wherever the stakes are highest." })}
            </p>
            <div className="actions ld" style={cssVars({ '--i': 1 })}>
              <Link className="btn" to="/rmh-pmc/capabilities">
                {t("view-capabilities", { defaultValue: "View capabilities" })} <Arrow />
              </Link>
              <Link className="btn-glass" to="/rmh-pmc/contact">
                {t("request-briefing", { defaultValue: "Request a briefing" })} <Arrow />
              </Link>
            </div>
          </div>
        </div>
        <Hud cross />
      </Scene>

      {/* The hero's liquid metal pours off the foot of the stage. */}
      <Mercury mode="drip" seed={3} className="hero-drip" />

      {/* ══ TRANSMISSION LOG ══ */}
      <TransmissionLog />

      {/* ══ READOUT — four numerals on the stage ══ */}
      <Scene len={2.8} steps={4} className="stage readout" pinClassName="ro-pin">
        <div className="ro-ring-wrap" aria-hidden="true">
          <span className="obj-ring ro-ring" />
        </div>
        <div className="sc-stack ro-stack">
          {stats.map((s, i) => (
            <Step key={s.l} index={i} count={stats.length} className="ro-step">
              <div className="ro-num steel">{s.v}</div>
              <div className="ro-chip glass glass--lens">
                <div className="ro-l">{s.l}</div>
                <div className="ro-k">{s.k}</div>
              </div>
            </Step>
          ))}
        </div>
        <SceneDots count={stats.length} className="ro-dots" />
        <Hud steps={stats.length} />
      </Scene>

      {/* ══ §01 THE COMPANY — paper ══ */}
      <section className="sec co">
        <div className="wrap">
          <SecHead
            desig={t("s01-desig", { defaultValue: "The Company" })}
            title={t("s01-heading", { defaultValue: "One command, drawn from the world's best" })}
            lede={t("s01-lede", { defaultValue: "Most security firms are a staffing agency with a logo. RMH PMC is built the other way around — a single command, manned almost entirely by veterans of tier-one special operations units, with an intelligence cell and a logistics tail that move at the same tempo." })}
          />
          <div className="measure rv">
            <p className="body">
              {t("s01-body", { defaultValue: "That structure lets us put the whole organization behind a single task: the operators on the ground, the analysts reading it, and the planners who keep them supplied — under one chain of command, with the discretion our clients require." })}
            </p>
            <p className="co-link">
              <Link className="link-arw" to="/rmh-pmc/command">{t("read-command-file", { defaultValue: "Read the command file" })} <Arrow /></Link>
            </p>
          </div>
          <div className="co-instr rv-scale" aria-hidden="true">
            <div className="well co-well">
              <div className="obj-bars co-bars co-bars--a" style={cssVars({ '--bh': '150px' })}>
                {[34, 52, 44, 70, 58, 86, 64].map((h, i) => <i key={i} style={cssVars({ '--h': h })} />)}
              </div>
              <div className="co-disc">
                <div className="obj-disc chrome" data-chrome-live="" />
                {sections.map((s, i) => (
                  <span key={s} className="co-chip glass glass--pill" style={cssVars({ '--ang': `${i * 60 - 90}deg` })}>{s}</span>
                ))}
              </div>
              <div className="obj-bars co-bars co-bars--b" style={cssVars({ '--bh': '150px' })}>
                {[64, 86, 58, 70, 44, 52, 34].map((h, i) => <i key={i} style={cssVars({ '--h': h })} />)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ §02 LINES OF OPERATION — the centrepiece, a stage scene of seven steps ══ */}
      <Scene len={5.5} steps={caps.length} className="stage lines" pinClassName="lines-pin">
        <div className="lines-head">
          <SecHead
            desig={t("s02-desig", { defaultValue: "Lines of Operation" })}
            title={t("s02-heading", { defaultValue: "Seven capabilities, one chain of command" })}
            lede={t("s02-lede", { defaultValue: "Organized like a real staff — each line carries its section designator. Together they let a client protect, supply, understand, and act without ever leaving the command." })}
          />
        </div>
        <div className="lines-body">
          <aside className="lines-index" aria-hidden="true">
            <i className="scene-rail lines-rail" />
            <ol>
              {caps.map((c, i) => {
                const { a, b } = stepWindow(i, caps.length);
                const pos = i === 0 ? ' is-first' : i === caps.length - 1 ? ' is-last' : '';
                return (
                  <li key={c.h} className={`sc-live${pos}`} style={cssVars({ '--a': a, '--b': b })}>
                    <span className="lines-ix">{String(i + 1).padStart(2, '0')}</span>
                    {c.d}
                  </li>
                );
              })}
            </ol>
          </aside>
          <div className="lines-object" aria-hidden="true">
            <div className="sc-stack lines-nums">
              {caps.map((c, i) => {
                const { a, b } = stepWindow(i, caps.length);
                const pos = i === 0 ? ' is-first' : i === caps.length - 1 ? ' is-last' : '';
                return <div key={c.h} className={`sc-step${pos} lines-num`} style={cssVars({ '--a': a, '--b': b })}><span className="steel">{String(i + 1).padStart(2, '0')}</span></div>;
              })}
            </div>
            <div className="obj-hex chrome lines-hex" data-chrome-live="" />
          </div>
          <div className="lines-card glass glass--lens">
            <div className="sc-stack lines-cards">
              {caps.map((c, i) => (
                <Step key={c.h} index={i} count={caps.length} className="lines-step">
                  <Link className="line-link" to="/rmh-pmc/capabilities" hash={c.h}>
                    <span className="line-d">
                      <span className="line-i">{String(i + 1).padStart(2, '0')}</span> {c.d}
                    </span>
                    <h3 className="h3 line-n">{c.n}</h3>
                    <span className="line-b">{c.b}</span>
                    <p className="line-p">{c.p}</p>
                    <span className="link-arw">{t("open-record", { defaultValue: "Open record" })} <Arrow /></span>
                  </Link>
                </Step>
              ))}
            </div>
          </div>
        </div>
        <div className="lines-foot" aria-hidden="true">
          <SceneDots count={caps.length} />
          <i className="scene-rail" />
        </div>
        <Hud steps={caps.length} />
      </Scene>

      {/* ══ §03 PARTNER LIAISON — paper, two rings interlock ══ */}
      <section className="sec liaison">
        <div className="wrap">
          <div className="ln-stage" aria-hidden="true">
            <div className="ln ln-a"><span className="obj-ring chrome" /></div>
            <div className="ln ln-b"><span className="obj-ring chrome" /></div>
            <div className="ln ln-a2"><span className="obj-ring chrome" /></div>
          </div>
          <SecHead
            desig={t("s03-desig", { defaultValue: "Partner Liaison" })}
            title={t("s03-heading", { defaultValue: "Cleared to work alongside the agencies that matter" })}
          />
          <div className="measure rv">
            <p className="body">
              {t("s03-body1", { defaultValue: "Our intelligence cell does not operate in isolation. RMH PMC maintains a cleared liaison architecture with allied national services — including longstanding working relationships with U.S. and Israeli intelligence partners — so our clients benefit from collection, vetting, and warning that a private firm could not generate alone." })}
            </p>
            <p className="body">
              {t("s03-body2", { defaultValue: "Every engagement is run through that architecture: deconflicted, sanctions-screened, and lawful in every jurisdiction we touch." })}
            </p>
            <p className="co-link">
              <Link className="link-arw" to="/rmh-pmc/capabilities" hash="intelligence">{t("the-intelligence-line", { defaultValue: "The intelligence line" })} <Arrow /></Link>
            </p>
          </div>
        </div>
      </section>

      {/* ══ §04 PEDIGREE — paper, two rails of glass pills travelling against each other ══ */}
      <section className="sec ped">
        <div className="wrap">
          <SecHead
            desig={t("s04-desig", { defaultValue: "Pedigree" })}
            title={t("s04-heading", { defaultValue: "Hired from the units that set the standard" })}
            lede={t("s04-lede", { defaultValue: "Our operators come from the tier-one elements of allied nations — selected again, on our terms, before they ever deploy under our flag." })}
          />
        </div>
        <div className="ped-stage">
          <div className="sx ped-row chrome chrome-ingot">
            <div className="sx-track">
              {UNITS.slice(0, 7).map((u) => <span key={u} className="ped-pill glass glass--pill">{u}</span>)}
            </div>
          </div>
          <div className="sx ped-row chrome chrome-ingot">
            <div className="sx-track sx-rev">
              {UNITS.slice(7).map((u) => <span key={u} className="ped-pill glass glass--pill">{u}</span>)}
            </div>
          </div>
        </div>
      </section>

      {/* ══ §05 LATEST DISPATCHES — paper, a glass card over chrome ══ */}
      <section className="sec disp">
        <div className="wrap">
          <SecHead
            desig={t("s05-desig", { defaultValue: "Latest Dispatches" })}
            title={t("s05-heading", { defaultValue: "The product our clients act on" })}
            lede={t("s05-lede", { defaultValue: "Assessments from the same intelligence cell that supports our deployed teams — sanitized for release." })}
          />
          <div className="disp-stage rv-scale">
            <div className="well disp-well">
              <span className="obj-orb chrome disp-orb disp-orb--s" aria-hidden="true" />
              <span className="obj-orb chrome disp-orb" aria-hidden="true" />
              <span className="obj-ring chrome disp-ring" aria-hidden="true" />
              <Link className="disp-lead glass glass--lens" to="/rmh-pmc/intelligence">
                <span className="logrow">
                  <b>{t("lead-main-metaline", { defaultValue: "Threat" })}</b> <span className="led" /> <span>RMH-INT-0434 · 21 JUN 2026</span>
                </span>
                <h3 className="h3 disp-h">{t("lead-main-heading", { defaultValue: "The 2026 fragility map: where instability becomes a private problem" })}</h3>
                <p className="disp-p">
                  {t("lead-main-body", { defaultValue: "Our standing read on the corridors, contested coastlines, and governance vacuums most likely to demand a private response this year — and how clients are positioning ahead of them." })}
                </p>
              </Link>
            </div>
          </div>
          <div className="rows disp-rows rv">
            <Link className="row" to="/rmh-pmc/intelligence">
              <span className="row-k">{t("side-maritime-metaline", { defaultValue: "Maritime" })}</span>
              <span className="row-t">{t("side-maritime-heading", { defaultValue: "The next chokepoint, before it closes" })}</span>
              <span className="row-d">{t("side-maritime-body", { defaultValue: "Red Sea and Gulf of Aden risk, week by week." })}</span>
              <span className="row-end"><Arrow /></span>
            </Link>
            <Link className="row" to="/rmh-pmc/intelligence">
              <span className="row-k">{t("side-stabilization-metaline", { defaultValue: "Stabilization" })}</span>
              <span className="row-t">{t("side-stabilization-heading", { defaultValue: "Why some transitions hold and others don't" })}</span>
              <span className="row-d">{t("side-stabilization-body", { defaultValue: "Patterns from our sovereign engagements." })}</span>
              <span className="row-end"><Arrow /></span>
            </Link>
            <Link className="row" to="/rmh-pmc/intelligence">
              <span className="row-k">{t("side-cyber-metaline", { defaultValue: "Cyber & Signals" })}</span>
              <span className="row-t">{t("side-cyber-heading", { defaultValue: "Principals targeted before they land" })}</span>
              <span className="row-d">{t("side-cyber-body", { defaultValue: "Pre-travel digital threat reduction." })}</span>
              <span className="row-end"><Arrow /></span>
            </Link>
          </div>
          <p className="tc disp-more">
            <Link className="link-arw" to="/rmh-pmc/intelligence">{t("open-manifest", { defaultValue: "Open the manifest" })} <Arrow /></Link>
          </p>
        </div>
      </section>

      {/* ══ SELECTION — the sight locks on ══ */}
      <CtaBand
        desig={t("cta-desig", { defaultValue: "Selection" })}
        title={t("cta-heading-home-page", { defaultValue: "The standard does not lower for anyone" })}
        body={t("cta-body-home-page", { defaultValue: "We recruit a small number of operators, analysts, logisticians, and medics each year — and select them again before they ever carry our flag. If you have already proven it, prove it once more." })}
      >
        <Link className="btn" to="/rmh-pmc/operators">{t("selection-recruiting", { defaultValue: "Selection & recruiting" })} <Arrow /></Link>
      </CtaBand>
    </div>
  );
}
