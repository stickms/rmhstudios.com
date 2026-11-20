/**
 * RMH PMC home. One dark stage holds the only object on the page, a body of
 * liquid mercury, with the headline beneath it; the metal pours off the foot of
 * the stage onto the paper. Everything after it is type on hairlines.
 */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Mercury } from './Mercury';
import { Arrow, CtaBand, MetaLine, SecHead, Words, cssVars } from './shared';

const UNITS = ['SAS', 'SBS', 'DELTA', 'DEVGRU', 'SAYERET MATKAL', 'SHAYETET 13', 'GIGN', 'KSK', 'JTF2', 'GROM', 'SASR', 'JW KOMANDOSÓW', 'SOG', 'RECON'];

export default function HomePage() {
  const { t } = useTranslation('c-rmh-pmc');

  const stats = [
    { l: t('stat-roster-label', { defaultValue: 'Roster' }), v: '200+', k: t('stat-roster-desc', { defaultValue: 'Vetted operators on the active roster' }) },
    { l: t('stat-theaters-label', { defaultValue: 'Theaters' }), v: '40+', k: t('stat-theaters-desc', { defaultValue: 'Active or standby presence worldwide' }) },
    { l: t('stat-liaison-label', { defaultValue: 'Liaison' }), v: '14', k: t('stat-liaison-desc', { defaultValue: 'Allied services in our architecture' }) },
    { l: t('stat-watch-label', { defaultValue: 'Watch' }), v: '24/7', k: t('stat-watch-desc', { defaultValue: 'Operations center, always manned' }) },
  ];

  const caps = [
    { d: 'S-3 // OPERATIONS', n: t('cap-protective-name', { defaultValue: 'Protective Services' }), p: t('cap-protective-desc', { defaultValue: 'Executive and diplomatic protection, secure movement, and crisis response for high-value principals in permissive and hostile environments.' }), h: 'protective' },
    { d: 'S-3 // GUARD FORCE', n: t('cap-guarding-name', { defaultValue: 'Static Guarding' }), p: t('cap-guarding-desc', { defaultValue: 'Manned guarding and access control for embassies, energy sites, ports, and critical infrastructure — posted, trained, and supervised to standard.' }), h: 'guarding' },
    { d: 'S-7 // TRAINING', n: t('cap-training-name', { defaultValue: 'Training & Doctrine' }), p: t('cap-training-desc', { defaultValue: 'Selection-grade instruction for national militaries and police units: marksmanship, CQB, maritime interdiction, and command-staff doctrine.' }), h: 'training' },
    { d: 'S-4 // LOGISTICS', n: t('cap-logistics-name', { defaultValue: 'Expeditionary Logistics' }), p: t('cap-logistics-desc', { defaultValue: 'Air, ground, and maritime movement, basing, and sustainment that put a self-supporting force anywhere within days.' }), h: 'logistics' },
    { d: 'S-2 // INTELLIGENCE', n: t('cap-intelligence-name', { defaultValue: 'Intelligence & ISR' }), p: t('cap-intelligence-desc', { defaultValue: 'All-source intelligence, surveillance, and reconnaissance — with embedded liaison to allied national services.' }), h: 'intelligence' },
    { d: 'S-5 // PLANS', n: t('cap-advisory-name', { defaultValue: 'Strategic Advisory' }), p: t('cap-advisory-desc', { defaultValue: 'Risk, security architecture, and contingency planning for boards, ministries, and country teams operating in fragile environments.' }), h: 'advisory' },
    { d: 'S-9 // CIMIC', n: t('cap-sovereign-name', { defaultValue: 'Sovereign Solutions' }), p: t('cap-sovereign-desc', { defaultValue: 'Discreet stabilization, governance advisory, and political-transition support for sovereign clients reshaping their security posture.' }), h: 'sovereign' },
  ];

  const dispatches = [
    { k: t('side-maritime-metaline', { defaultValue: 'Maritime' }), h: t('side-maritime-heading', { defaultValue: 'The next chokepoint, before it closes' }), p: t('side-maritime-body', { defaultValue: 'Red Sea and Gulf of Aden risk, week by week.' }) },
    { k: t('side-stabilization-metaline', { defaultValue: 'Stabilization' }), h: t('side-stabilization-heading', { defaultValue: "Why some transitions hold and others don't" }), p: t('side-stabilization-body', { defaultValue: 'Patterns from our sovereign engagements.' }) },
    { k: t('side-cyber-metaline', { defaultValue: 'Cyber & Signals' }), h: t('side-cyber-heading', { defaultValue: 'Principals targeted before they land' }), p: t('side-cyber-body', { defaultValue: 'Pre-travel digital threat reduction.' }) },
  ];

  return (
    <div className="pg-home">
      {/* ══ HERO — the one object ══ */}
      <section className="stage hero">
        <Mercury className="hero-orb" />
        <div className="hero-copy">
          <MetaLine
            fields={[
              [t('meta-file-label', { defaultValue: 'File' }), 'RMH-PMC / DOSSIER 2026'],
              [t('meta-class-label', { defaultValue: 'Class' }), 'RESTRICTED'],
              [t('meta-status-label', { defaultValue: 'Status' }), 'OPERATIONAL'],
            ]}
          />
          <h1 className="display-xl">
            <Words text={t('hero-line1', { defaultValue: 'When the outcome' })} />{' '}
            <Words text={t('hero-line2-cannot', { defaultValue: 'cannot' })} start={3} steel={[0]} />{' '}
            <Words text={t('hero-line2-rest', { defaultValue: 'be left' })} start={4} />{' '}
            <Words text={t('hero-line3', { defaultValue: 'to chance' })} start={6} />
          </h1>
          <p className="lede ld" style={cssVars({ '--i': 0 })}>
            {t('hero-lede', { defaultValue: 'RMH PMC is the private military arm of RMH Studios. We field tier-one operators, a sovereign-grade intelligence cell, and a global logistics tail to protect people, secure ground, and shape outcomes for governments, corporations, and institutions — wherever the stakes are highest.' })}
          </p>
          <div className="actions ld" style={cssVars({ '--i': 1 })}>
            <Link className="btn" to="/rmh-pmc/capabilities">{t('view-capabilities', { defaultValue: 'View capabilities' })} <Arrow /></Link>
            <Link className="btn-line" to="/rmh-pmc/contact">{t('request-briefing', { defaultValue: 'Request a briefing' })} <Arrow /></Link>
          </div>
        </div>
      </section>

      {/* The metal pours off the foot of the stage. */}
      <Mercury mode="drip" seed={3} />

      {/* ══ FIGURES ══ */}
      <section className="sec">
        <div className="wrap">
          <div className="figures rv">
            {stats.map((s) => (
              <div className="figure" key={s.l}>
                <span className="figure-k">{s.l}</span>
                <span className="figure-n">{s.v}</span>
                <span className="figure-d">{s.k}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ §01 THE COMPANY ══ */}
      <section className="sec">
        <div className="wrap split">
          <SecHead
            className="rv"
            desig={t('s01-desig', { defaultValue: 'The Company' })}
            title={t('s01-heading', { defaultValue: "One command, drawn from the world's best" })}
          />
          <div className="rv">
            <p className="lede">
              {t('s01-lede', { defaultValue: 'Most security firms are a staffing agency with a logo. RMH PMC is built the other way around — a single command, manned almost entirely by veterans of tier-one special operations units, with an intelligence cell and a logistics tail that move at the same tempo.' })}
            </p>
            <p className="body" style={{ marginTop: 20 }}>
              {t('s01-body', { defaultValue: 'That structure lets us put the whole organization behind a single task: the operators on the ground, the analysts reading it, and the planners who keep them supplied — under one chain of command, with the discretion our clients require.' })}
            </p>
            <p className="more">
              <Link className="link-arw" to="/rmh-pmc/command">{t('read-command-file', { defaultValue: 'Read the command file' })} <Arrow /></Link>
            </p>
          </div>
        </div>
      </section>

      {/* ══ §02 LINES OF OPERATION ══ */}
      <section className="sec">
        <div className="wrap">
          <SecHead
            className="rv"
            desig={t('s02-desig', { defaultValue: 'Lines of Operation' })}
            title={t('s02-heading', { defaultValue: 'Seven capabilities, one chain of command' })}
            lede={t('s02-lede', { defaultValue: 'Organized like a real staff — each line carries its section designator. Together they let a client protect, supply, understand, and act without ever leaving the command.' })}
          />
          <div className="rows rv">
            {caps.map((c) => (
              <Link key={c.h} className="row" to="/rmh-pmc/capabilities" hash={c.h}>
                <span className="row-k">{c.d}</span>
                <span className="row-t">{c.n}</span>
                <span className="row-d">{c.p}</span>
                <span className="row-end"><Arrow /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══ §03 PARTNER LIAISON ══ */}
      <section className="sec">
        <div className="wrap split">
          <SecHead
            className="rv"
            desig={t('s03-desig', { defaultValue: 'Partner Liaison' })}
            title={t('s03-heading', { defaultValue: 'Cleared to work alongside the agencies that matter' })}
          />
          <div className="rv">
            <p className="body">
              {t('s03-body1', { defaultValue: 'Our intelligence cell does not operate in isolation. RMH PMC maintains a cleared liaison architecture with allied national services — including longstanding working relationships with U.S. and Israeli intelligence partners — so our clients benefit from collection, vetting, and warning that a private firm could not generate alone.' })}
            </p>
            <p className="body">
              {t('s03-body2', { defaultValue: 'Every engagement is run through that architecture: deconflicted, sanctions-screened, and lawful in every jurisdiction we touch.' })}
            </p>
            <p className="more">
              <Link className="link-arw" to="/rmh-pmc/capabilities" hash="intelligence">{t('the-intelligence-line', { defaultValue: 'The intelligence line' })} <Arrow /></Link>
            </p>
          </div>
        </div>
      </section>

      {/* ══ §04 PEDIGREE ══ */}
      <section className="sec">
        <div className="wrap split">
          <SecHead
            className="rv"
            desig={t('s04-desig', { defaultValue: 'Pedigree' })}
            title={t('s04-heading', { defaultValue: 'Hired from the units that set the standard' })}
          />
          <div className="rv">
            <p className="lede">
              {t('s04-lede', { defaultValue: 'Our operators come from the tier-one elements of allied nations — selected again, on our terms, before they ever deploy under our flag.' })}
            </p>
            <ul className="inline-list" style={{ marginTop: 28 }}>
              {UNITS.map((u) => <li key={u}>{u}</li>)}
            </ul>
          </div>
        </div>
      </section>

      {/* ══ §05 LATEST DISPATCHES ══ */}
      <section className="sec">
        <div className="wrap">
          <SecHead
            className="rv"
            desig={t('s05-desig', { defaultValue: 'Latest Dispatches' })}
            title={t('s05-heading', { defaultValue: 'The product our clients act on' })}
            lede={t('s05-lede', { defaultValue: 'Assessments from the same intelligence cell that supports our deployed teams — sanitized for release.' })}
          />
          <Link className="lead-link rv" to="/rmh-pmc/intelligence">
            <span className="meta">
              <span className="ink">{t('lead-main-metaline', { defaultValue: 'Threat' })}</span> · RMH-INT-0434 · 21 JUN 2026
            </span>
            <span className="h2">{t('lead-main-heading', { defaultValue: 'The 2026 fragility map: where instability becomes a private problem' })}</span>
            <span className="body">
              {t('lead-main-body', { defaultValue: 'Our standing read on the corridors, contested coastlines, and governance vacuums most likely to demand a private response this year — and how clients are positioning ahead of them.' })}
            </span>
          </Link>
          <div className="rows rv">
            {dispatches.map((d) => (
              <Link key={d.h} className="row" to="/rmh-pmc/intelligence">
                <span className="row-k">{d.k}</span>
                <span className="row-t">{d.h}</span>
                <span className="row-d">{d.p}</span>
                <span className="row-end"><Arrow /></span>
              </Link>
            ))}
          </div>
          <p className="more">
            <Link className="link-arw" to="/rmh-pmc/intelligence">{t('open-manifest', { defaultValue: 'Open the manifest' })} <Arrow /></Link>
          </p>
        </div>
      </section>

      {/* ══ SELECTION ══ */}
      <CtaBand
        desig={t('cta-desig', { defaultValue: 'Selection' })}
        title={t('cta-heading-home-page', { defaultValue: 'The standard does not lower for anyone' })}
        body={t('cta-body-home-page', { defaultValue: 'We recruit a small number of operators, analysts, logisticians, and medics each year — and select them again before they ever carry our flag. If you have already proven it, prove it once more.' })}
      >
        <Link className="btn" to="/rmh-pmc/operators">{t('selection-recruiting', { defaultValue: 'Selection & recruiting' })} <Arrow /></Link>
      </CtaBand>
    </div>
  );
}
