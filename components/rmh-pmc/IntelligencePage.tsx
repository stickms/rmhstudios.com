/**
 * RMH PMC intelligence — the dispatches. The page head is the one stage; the
 * lead dispatch, the three side dispatches and the filterable manifest follow
 * on paper as type on hairlines.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Arrow, CtaBand, PageHead, SecHead } from './shared';
import { INTELLIGENCE_CATEGORY_IDS, intelligenceCategoryLabels } from './intelligence-labels';

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
  const { t } = useTranslation('c-rmh-pmc');
  const categoryLabels = intelligenceCategoryLabels(t);
  const [active, setActive] = useState<string>('all');
  const visible = DISPATCHES.filter((d) => active === 'all' || d.cat === active);

  const sides = [
    { c: t('side1-category', { defaultValue: 'Maritime' }), h: t('side1-title', { defaultValue: 'The next chokepoint, before it closes' }), p: t('side1-blurb', { defaultValue: 'Red Sea and Gulf of Aden risk, week by week.' }) },
    { c: t('side2-category', { defaultValue: 'Stabilization' }), h: t('side2-title', { defaultValue: "Why some transitions hold and others don't" }), p: t('side2-blurb', { defaultValue: 'Patterns from our sovereign engagements.' }) },
    { c: t('side3-category', { defaultValue: 'Cyber & Signals' }), h: t('side3-title', { defaultValue: 'Principals targeted before they land' }), p: t('side3-blurb', { defaultValue: 'Pre-travel digital threat reduction.' }) },
  ];

  return (
    <div className="pg-intelligence">
      <PageHead
        seed={7}
        meta={[
          [t('field-file', { defaultValue: 'File' }), 'RMH-INT / DISPATCHES'],
          [t('field-class', { defaultValue: 'Class' }), 'CLEARED FOR RELEASE'],
          [t('field-feed', { defaultValue: 'Feed' }), 'PUBLIC'],
        ]}
        desig={t('page-desig', { defaultValue: 'Intelligence // Dispatches' })}
        title={t('page-heading', { defaultValue: 'The product our clients act on.' })}
        lede={t('page-lede', { defaultValue: 'Sanitized assessments from the same intelligence cell that supports our deployed teams. What you read here has been stripped of sources and methods and cleared for release — the judgment is the same one we hand a commander on the ground.' })}
      />

      {/* ══ LEAD + SIDES ══ */}
      <section className="sec">
        <div className="wrap">
          <Link className="lead-link rv" to="/rmh-pmc/intelligence">
            <span className="meta">
              <span className="ink">{t('lead-category', { defaultValue: 'Threat' })}</span> · RMH-INT-0434 · 21 JUN 2026
            </span>
            <span className="h2">{t('lead-title', { defaultValue: 'The 2026 fragility map: where instability becomes a private problem' })}</span>
            <span className="body">
              {t('lead-blurb', { defaultValue: 'Our standing read on the corridors, contested coastlines, and governance vacuums most likely to demand a private response this year — scored on probability, proximity to client interests, and how fast a situation can move from headline to evacuation.' })}
            </span>
            <span className="link-arw">{t('open-record', { defaultValue: 'Open record' })} <Arrow /></span>
          </Link>
          <div className="rows rv">
            {sides.map((s) => (
              <Link key={s.h} className="row" to="/rmh-pmc/intelligence">
                <span className="row-k">{s.c}</span>
                <span className="row-t">{s.h}</span>
                <span className="row-d">{s.p}</span>
                <span className="row-end"><Arrow /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══ THE MANIFEST ══ */}
      <section className="sec">
        <div className="wrap">
          <SecHead
            className="rv"
            desig={t('manifest-desig', { defaultValue: 'The Manifest' })}
            title={t('manifest-heading', { defaultValue: 'Every cleared dispatch' })}
          />
          <div className="chips" role="group" aria-label={t('filters-aria-label', { defaultValue: 'Filter dispatches by category' })}>
            {INTELLIGENCE_CATEGORY_IDS.map((id) => (
              <button key={id} type="button" className="chip" aria-pressed={active === id} onClick={() => setActive(id)}>
                {categoryLabels[id]}
              </button>
            ))}
          </div>
          <p className="meta" role="status" aria-live="polite" style={{ margin: '20px 0 16px' }}>
            {t('manifest-count', { defaultValue: '{{shown}} of {{total}} dispatches', shown: visible.length, total: DISPATCHES.length })}
          </p>
          <div className="rows">
            {visible.map((d) => (
              <Link key={d.serial} className="row" to="/rmh-pmc/intelligence">
                <span className="row-k">{d.serial} · {d.meta}</span>
                <span className="row-t">{d.title}</span>
                <span className="row-d">{d.blurb}</span>
                <span className="row-end meta">{d.rd}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        desig={t('cta-desig-intelligence-page', { defaultValue: 'Cleared Distribution' })}
        title={t('cta-heading', { defaultValue: "Read the version we don't release." })}
        body={t('cta-body-intelligence-page', { defaultValue: 'Clients on a standing engagement receive named-theater assessments, warning thresholds, and a direct line to the cell that wrote them. The public feed is the part we can show.' })}
      >
        <Link className="btn" to="/rmh-pmc/contact">
          {t('cta-button', { defaultValue: 'Request a briefing' })} <Arrow />
        </Link>
      </CtaBand>
    </div>
  );
}
