/**
 * RMH PMC capabilities. The page head is the one stage; the seven lines follow
 * on paper as an index, then one section each: designator, name and brand line
 * on the left; two paragraphs and the line's specialities on the right.
 */
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Arrow, CtaBand, PageHead } from './shared';

type Cap = {
  id: string;
  desig: string;
  h: string;
  brand: string;
  p1: string;
  p2: ReactNode;
  chips: string[];
};

export default function CapabilitiesPage() {
  const { t } = useTranslation('c-rmh-pmc');

  const caps: Cap[] = [
    {
      id: 'protective', desig: 'S-3 // OPERATIONS',
      h: t('protective-heading', { defaultValue: 'Protective Services' }),
      brand: t('protective-brand', { defaultValue: 'Close protection · secure movement · crisis response' }),
      p1: t('protective-p1', { defaultValue: 'We keep principals alive and moving. Executive and diplomatic protection details, secure ground and air movement, residential and venue security, and crisis and evacuation planning — delivered by operators who have run protection in permissive capitals and active conflict zones alike.' }),
      p2: t('protective-p2', { defaultValue: 'Every detail is built backward from the threat: advance work, route study, surveillance detection, and an embedded medical capability, so a bad day is one we have already rehearsed.' }),
      chips: [t('cap-close-protection', { defaultValue: 'Close Protection' }), t('cap-secure-movement', { defaultValue: 'Secure Movement' }), t('cap-residential-security', { defaultValue: 'Residential Security' }), t('cap-surveillance-detection', { defaultValue: 'Surveillance Detection' }), t('cap-medical-cover', { defaultValue: 'Medical Cover' }), t('cap-evacuation', { defaultValue: 'Evacuation' })],
    },
    {
      id: 'guarding', desig: 'S-3 // GUARD FORCE',
      h: t('guarding-heading', { defaultValue: 'Facility & Static Guarding' }),
      brand: t('guarding-brand', { defaultValue: 'Embassies · energy · ports · critical infrastructure' }),
      p1: t('guarding-p1', { defaultValue: 'Manned guarding and access control for the sites that cannot afford a lapse — embassies and missions, energy installations, ports and terminals, and critical national infrastructure. Posts are manned, trained, supervised, and audited to a written standard, with control rooms and K9 capability where the threat demands it.' }),
      p2: t('guarding-p2', { defaultValue: 'A guard force is only as good as the supervision behind it. Ours is run to the same tempo and discipline as our protective details — not a uniform agency with a logo.' }),
      chips: [t('cap-manned-guarding', { defaultValue: 'Manned Guarding' }), t('cap-access-control', { defaultValue: 'Access Control' }), t('cap-embassy-posts', { defaultValue: 'Embassy Posts' }), t('cap-energy-ports', { defaultValue: 'Energy & Ports' }), t('cap-k9', { defaultValue: 'K9' }), t('cap-control-rooms', { defaultValue: 'Control Rooms' })],
    },
    {
      id: 'training', desig: 'S-7 // TRAINING',
      h: t('training-heading', { defaultValue: 'Training & Doctrine' }),
      brand: t('training-brand', { defaultValue: 'Selection-grade instruction for militaries and police' }),
      p1: t('training-p1', { defaultValue: 'We train national militaries and police units to a selection standard, not a certificate standard. Marksmanship and CQB, maritime interdiction and boarding, mobile force tactics, and command-staff doctrine — taught by instructors who built and led these capabilities in their own services.' }),
      p2: t('training-p2', { defaultValue: 'Where a client needs the capability to outlast us, we run train-the-trainer programs that leave a self-sustaining cadre behind, not a dependency.' }),
      chips: [t('cap-marksmanship', { defaultValue: 'Marksmanship' }), t('cap-cqb', { defaultValue: 'CQB' }), t('cap-maritime-interdiction', { defaultValue: 'Maritime Interdiction' }), t('cap-mobile-force-training', { defaultValue: 'Mobile Force Training' }), t('cap-command-staff', { defaultValue: 'Command Staff' }), t('cap-train-the-trainer', { defaultValue: 'Train-the-Trainer' })],
    },
    {
      id: 'logistics', desig: 'S-4 // LOGISTICS',
      h: t('logistics-heading', { defaultValue: 'Expeditionary Logistics' }),
      brand: t('logistics-brand', { defaultValue: 'Move · base · sustain — anywhere within days' }),
      p1: t('logistics-p1', { defaultValue: 'Air, ground, and maritime movement, basing, and sustainment that put a self-supporting force on the ground within days — and keep it supplied for as long as the mandate runs. Charter lift, hardened convoys, camps and life support, fuel and ration chains, and an organic medevac capability.' }),
      p2: t('logistics-p2', { defaultValue: 'We handle customs and clearance through the same liaison channels that run the rest of the company, so the tail never becomes the bottleneck.' }),
      chips: [t('cap-air-charter', { defaultValue: 'Air Charter' }), t('cap-ground-convoy', { defaultValue: 'Ground Convoy' }), t('cap-basing-camps', { defaultValue: 'Basing & Camps' }), t('cap-sustainment', { defaultValue: 'Sustainment' }), t('cap-medevac', { defaultValue: 'Medevac' }), t('cap-customs-clearance', { defaultValue: 'Customs & Clearance' })],
    },
    {
      id: 'intelligence', desig: 'S-2 // INTELLIGENCE',
      h: t('intelligence-heading', { defaultValue: 'Intelligence & ISR' }),
      brand: t('intelligence-brand', { defaultValue: 'All-source · cleared liaison architecture' }),
      p1: t('intelligence-p1', { defaultValue: 'Our intelligence cell turns noise into decisions: all-source analysis, surveillance and reconnaissance, threat warning, due diligence, and counter-surveillance — the product our deployed teams and our clients act on, not a quarterly newsletter.' }),
      p2: (
        <>
          {t('intelligence-p2', { defaultValue: 'The cell does not work in isolation. RMH PMC maintains a cleared liaison architecture with allied national services — including longstanding working relationships with U.S. and Israeli intelligence partners — giving clients access to collection, vetting, and warning that no private firm could generate alone. Every engagement is run through that architecture: ' })}
          <span className="ink">{t('intelligence-deconflicted', { defaultValue: 'deconflicted, sanctions-screened, and lawful' })}</span>
          {t('intelligence-p2-end', { defaultValue: ' in every jurisdiction we touch. What that architecture sees, and who exactly it touches, stays inside the briefing room.' })}
        </>
      ),
      chips: [t('cap-all-source-analysis', { defaultValue: 'All-Source Analysis' }), t('cap-isr', { defaultValue: 'ISR' }), t('cap-threat-warning', { defaultValue: 'Threat Warning' }), t('cap-due-diligence', { defaultValue: 'Due Diligence' }), t('cap-partner-liaison', { defaultValue: 'Partner Liaison' }), t('cap-counter-surveillance', { defaultValue: 'Counter-Surveillance' })],
    },
    {
      id: 'advisory', desig: 'S-5 // PLANS',
      h: t('advisory-heading', { defaultValue: 'Strategic Advisory' }),
      brand: t('advisory-brand', { defaultValue: 'Risk · architecture · contingency planning' }),
      p1: t('advisory-p1', { defaultValue: 'For boards, ministries, and country teams operating in fragile environments, we design the security architecture and the plan behind it: threat and risk assessment, contingency and crisis planning, red teaming of existing posture, and the entry strategy for a new and difficult market.' }),
      p2: t('advisory-p2', { defaultValue: 'Advisory here is not a deck. It is informed by the same intelligence cell and delivered by planners who have owned the consequences of being wrong.' }),
      chips: [t('cap-security-architecture', { defaultValue: 'Security Architecture' }), t('cap-risk-assessment', { defaultValue: 'Risk Assessment' }), t('cap-contingency-planning', { defaultValue: 'Contingency Planning' }), t('cap-red-teaming', { defaultValue: 'Red Teaming' }), t('cap-board-advisory', { defaultValue: 'Board Advisory' }), t('cap-country-entry', { defaultValue: 'Country Entry' })],
    },
    {
      id: 'sovereign', desig: 'S-9 // CIMIC',
      h: t('sovereign-heading', { defaultValue: 'Sovereign Solutions' }),
      brand: t('sovereign-brand', { defaultValue: 'Stabilization · governance advisory · political transition' }),
      p1: t('sovereign-p1', { defaultValue: 'A small number of clients are sovereign states reshaping their security posture from the ground up. For them we offer discreet stabilization, governance advisory, security-sector reform, and political-transition support — a single, quiet relationship that touches every level of how a state secures itself.' }),
      p2: t('sovereign-p2', { defaultValue: 'This line is delivered by invitation, under strict confidentiality, and within the legal frameworks that govern it. We do not discuss its methods, its clients, or its outcomes in the open. The work is rarely visible. It is meant to be.' }),
      chips: [t('cap-stabilization', { defaultValue: 'Stabilization' }), t('cap-governance-advisory', { defaultValue: 'Governance Advisory' }), t('cap-security-sector-reform', { defaultValue: 'Security-Sector Reform' }), t('cap-transition-support', { defaultValue: 'Transition Support' }), t('cap-strategic-communications', { defaultValue: 'Strategic Communications' }), t('cap-sovereign-liaison', { defaultValue: 'Sovereign Liaison' })],
    },
  ];

  return (
    <div className="pg-capabilities">
      <PageHead
        seed={2}
        meta={[
          [t('file-label', { defaultValue: 'File' }), 'CAPABILITIES'],
          [t('class-label', { defaultValue: 'Class' }), 'RESTRICTED'],
          [t('lines-label', { defaultValue: 'Lines' }), '07'],
        ]}
        desig={t('lines-of-operation', { defaultValue: 'Lines of Operation' })}
        title={t('hero-heading', { defaultValue: 'Seven capabilities. One chain of command.' })}
        lede={t('hero-lede-capabilities-page', { defaultValue: 'We are organized like a real staff — each line carries its section designator. Together they let a client protect people, hold ground, train a force, supply it, understand the threat, plan the response, and reshape the picture entirely — without ever leaving the command.' })}
      />

      {/* ══ INDEX ══ */}
      <section className="sec">
        <div className="wrap">
          <nav className="rows rv" aria-label={t('staff-nav-label', { defaultValue: 'The seven lines of operation' })}>
            {caps.map((c, i) => (
              <Link key={c.id} className="row" to="/rmh-pmc/capabilities" hash={c.id}>
                <span className="row-k">{String(i + 1).padStart(2, '0')} · {c.desig}</span>
                <span className="row-t">{c.h}</span>
                <span className="row-d">{c.brand}</span>
                <span className="row-end"><Arrow /></span>
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {/* ══ THE SEVEN LINES ══ */}
      {caps.map((c) => (
        <section key={c.id} id={c.id} className="sec">
          <div className="wrap split">
            <header className="sechead rv">
              <span className="desig">{c.desig}</span>
              <h2 className="h2">{c.h}</h2>
              <p className="meta">{c.brand}</p>
            </header>
            <div className="rv">
              <p className="body">{c.p1}</p>
              <p className="body">{c.p2}</p>
              <ul className="inline-list" style={{ marginTop: 28 }}>
                {c.chips.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>
          </div>
        </section>
      ))}

      <CtaBand
        desig={t('cta-desig-capabilities-page', { defaultValue: 'One Command' })}
        title={t('cta-heading-capabilities-page', { defaultValue: 'The advantage is in the chain of command.' })}
        body={t('cta-body-capabilities-page', { defaultValue: 'No single line works alone — protection draws on intelligence, logistics carries them all, and plans tie them together under one staff. Tell us the problem; we will bring the whole company to it.' })}
      >
        <Link className="btn" to="/rmh-pmc/contact">{t('cta-link', { defaultValue: 'Request a briefing' })} <Arrow /></Link>
      </CtaBand>
    </div>
  );
}
