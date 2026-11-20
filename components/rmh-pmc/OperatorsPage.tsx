/**
 * RMH PMC — operators. The page head is the one stage; the pedigree, the four
 * selection phases, the roles and the terms follow on paper as type on hairlines.
 */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Arrow, CtaBand, PageHead, SecHead } from './shared';

export default function OperatorsPage() {
  const { t } = useTranslation('c-rmh-pmc');

  const phases = [
    {
      title: t('phase-application-title', { defaultValue: 'Application & Records' }),
      body: t('phase-application-body', { defaultValue: 'We verify the record before we verify anything else. Service history, unit, deployments, qualifications, and discharge are confirmed against source — not your résumé, the actual file. Every claim is checked. One that does not hold ends the process here.' }),
    },
    {
      title: t('phase-vetting-title', { defaultValue: 'Vetting & Clearance' }),
      body: t('phase-vetting-body', { defaultValue: 'A full background investigation, polygraph-grade screening, financial and sanctions exposure checks, and a foreign-contact review run through our cleared liaison architecture. We work in jurisdictions where a single undisclosed tie can compromise a whole team. We find it now or not at all.' }),
    },
    {
      title: t('phase-assessment-title', { defaultValue: 'Assessment & Selection' }),
      body: t('phase-assessment-body', { defaultValue: 'A graded course, not a tryout. Fitness and load-bearing endurance, live and stress-shoot marksmanship, navigation, medical and comms baselines, and — the part that fails most strong candidates — judgment under fatigue, ambiguity, and observation. Performance is scored. The board reviews the scores.' }),
    },
    {
      title: t('phase-badging-title', { defaultValue: 'Badging & Deployment' }),
      body: t('phase-badging-body', { defaultValue: 'Selection earns a badge and a probationary attachment to a team, not tenure. You deploy under a team leader who reports on you, on a contract that either of us can end. Hold the standard on the ground and the attachment becomes a place on the roster.' }),
    },
  ];

  const roles = [
    { tag: 'S-3 // OPERATIONS', title: t('role-assaulters-title', { defaultValue: 'Assaulters & Protective Specialists' }), body: t('role-assaulters-body', { defaultValue: 'Tier-one assault, recce, or close-protection background. You move well, shoot to a measured standard, and stay calm when the plan does not. The work is principals and ground, not a highlight reel.' }) },
    { tag: 'S-2 // INTELLIGENCE', title: t('role-intel-title', { defaultValue: 'Intelligence Analysts' }), body: t('role-intel-body', { defaultValue: 'All-source analysts who have supported deployed forces and can write a finished assessment a client will act on. Cleared experience and language ability are weighted heavily. Tradecraft, not opinion.' }) },
    { tag: 'S-4 // LOGISTICS', title: t('role-logistics-title', { defaultValue: 'Logisticians' }), body: t('role-logistics-body', { defaultValue: 'Movement, basing, and sustainment specialists who can put a self-supporting force into a hard place and keep it fed, fueled, and armed. If you have run an expeditionary tail, you know what we mean.' }) },
    { tag: 'S-1 // MEDICAL', title: t('role-medics-title', { defaultValue: 'Combat Medics' }), body: t('role-medics-body', { defaultValue: 'SOF medics and paramedics who can hold a casualty alive past the golden hour, far from a role-two facility. Currency matters. You are the reason a team takes the contract.' }) },
    { tag: 'S-6 // SIGNALS', title: t('role-signals-title', { defaultValue: 'Communications & Signals' }), body: t('role-signals-body', { defaultValue: 'Signallers and SIGINT-adjacent specialists who keep a team connected and covered across HF, SATCOM, and contested spectrum. You build the network the rest of the command depends on, then defend it.' }) },
    { tag: 'S-5 // PLANS', title: t('role-advisory-title', { defaultValue: 'Advisory Staff' }), body: t('role-advisory-body', { defaultValue: 'Former command and staff officers who can sit across from a minister or a board and plan a campaign, not just brief one. Judgment, discretion, and a record of getting it right when it counted.' }) },
  ];

  const terms = [
    { vk: 'PAY // RISK', title: t('term-compensation-title', { defaultValue: 'Compensation' }), body: t('term-compensation-body', { defaultValue: 'Pay set against the risk and the rarity of the skill — not a market rate for a guard. Hazard and deployment terms are in the contract, not implied.' }) },
    { vk: 'KIT // SUSTAIN', title: t('term-kit-title', { defaultValue: 'World-Class Kit' }), body: t('term-kit-body', { defaultValue: 'You are issued and sustained on equipment chosen by operators, maintained by armorers, and replaced when it wears. You will not be the limiting factor.' }) },
    { vk: 'C2 // COMMAND', title: t('term-command-title', { defaultValue: 'A Real Chain of Command' }), body: t('term-command-body', { defaultValue: 'One command, a team leader who answers for you, and an operations center that is always manned. You will know who has the ground truth and who makes the call.' }) },
    { vk: 'S-1 // COVER', title: t('term-medical-title', { defaultValue: 'Medical & Family Cover' }), body: t('term-medical-body', { defaultValue: 'Comprehensive medical, evacuation, and disability cover for you, and standing provision for your family if the worst happens. It is written down before you deploy.' }) },
    { vk: 'POST // TRANSITION', title: t('term-transition-title', { defaultValue: 'Post-Contract Transition' }), body: t('term-transition-body', { defaultValue: 'Structured decompression, currency-keeping, and placement support when a contract ends. We do not cut people loose at the airfield. The relationship outlasts the rotation.' }) },
    { vk: 'STD // BAR', title: t('term-standard-title', { defaultValue: 'The Standard Itself' }), body: t('term-standard-body', { defaultValue: 'You will work alongside people selected to the same bar you cleared — and never have to carry someone who was let through because a roster needed filling.' }) },
  ];

  const units = ['SAS', 'SBS', 'DELTA', 'DEVGRU', 'SAYERET MATKAL', 'SHAYETET 13', 'GIGN', 'GIGN / RAID', 'KSK', 'JTF2', 'GROM', 'JW KOMANDOSÓW', 'SASR', 'NZSAS', 'FÖRSVARSMAKTEN SOG', 'MARSOC', 'RANGERS', 'PARA-SF'];

  return (
    <div className="pg-operators">
      <PageHead
        seed={11}
        meta={[
          [t('field-file', { defaultValue: 'File' }), 'RMH-PMC / SELECTION'],
          [t('field-class', { defaultValue: 'Class' }), 'RESTRICTED'],
          [t('field-process', { defaultValue: 'Process' }), 'OPERATORS'],
        ]}
        desig={t('pagehead-desig', { defaultValue: 'Selection // Operators' })}
        title={t('pagehead-h1', { defaultValue: 'The standard does not lower for anyone.' })}
        lede={t('pagehead-lede', { defaultValue: 'We bring on a small number of proven people each year — operators, analysts, logisticians, medics, and signallers — and we select them again on our own terms. A career somewhere else is the price of admission, not the qualification. If you have already proven it, you prove it once more here.' })}
      />

      {/* ══ §01 PEDIGREE ══ */}
      <section className="sec">
        <div className="wrap split">
          <SecHead
            className="rv"
            desig={t('pedigree-desig', { defaultValue: 'Pedigree' })}
            title={t('pedigree-h2', { defaultValue: 'Hired from the units that set the standard.' })}
          />
          <div className="rv">
            <p className="lede">
              {t('pedigree-lede', { defaultValue: 'Our operators come from the tier-one elements of allied nations — assault, recce, maritime, and aviation. We do not lower the bar to fill a roster. We hold it, and we draw from the people who cleared it the first time.' })}
            </p>
            <ul className="inline-list" style={{ marginTop: 28 }}>
              {units.map((u) => <li key={u}>{u}</li>)}
            </ul>
          </div>
        </div>
      </section>

      {/* ══ §02 SELECTION PIPELINE ══ */}
      <section className="sec">
        <div className="wrap">
          <SecHead
            className="rv"
            desig={t('pipeline-desig', { defaultValue: 'Selection Pipeline' })}
            title={t('pipeline-h2', { defaultValue: 'Four phases. No shortcuts through any of them.' })}
            lede={t('pipeline-lede', { defaultValue: 'Selection is a sequence, run in order, with a hard stop at every gate. Most candidates do not finish it — and the ones who do arrive on a team already known, already cleared, already trusted.' })}
          />
          <ol className="rows rv">
            {phases.map((p, i) => (
              <li key={p.title} className="row row--2">
                <span>
                  <span className="row-k">PHASE {String(i + 1).padStart(2, '0')}</span>
                  <span className="row-t" style={{ display: 'block', marginTop: 6 }}>{p.title}</span>
                </span>
                <p className="row-d">{p.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ══ §03 ROLES ══ */}
      <section className="sec">
        <div className="wrap">
          <SecHead
            className="rv"
            desig={t('roles-desig', { defaultValue: 'Roles We Recruit' })}
            title={t('roles-h2', { defaultValue: 'A team is more than its shooters.' })}
            lede={t('roles-lede', { defaultValue: 'We man a whole command, not just an assault element. These are the roles we recruit for — and the kind of person who fits each one.' })}
          />
          <div className="grid-3">
            {roles.map((r) => (
              <article key={r.title} className="card-text rv">
                <span className="meta">{r.tag}</span>
                <h3 className="h3">{r.title}</h3>
                <p>{r.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ══ §04 TERMS ══ */}
      <section className="sec">
        <div className="wrap">
          <SecHead
            className="rv"
            desig={t('terms-desig', { defaultValue: 'The Terms' })}
            title={t('terms-h2', { defaultValue: 'What you carry our flag for.' })}
            lede={t('terms-lede', { defaultValue: 'We ask a lot, and we are direct about what comes back. No equity-in-the-mission talk — terms a serious professional can actually plan a life around.' })}
          />
          <div className="rows rv">
            {terms.map((term) => (
              <div className="row row--2" key={term.title}>
                <span>
                  <span className="row-k">{term.vk}</span>
                  <span className="row-t" style={{ display: 'block', marginTop: 6 }}>{term.title}</span>
                </span>
                <p className="row-d">{term.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        desig={t('cta-desig', { defaultValue: 'Selection' })}
        title={t('cta-h2', { defaultValue: 'Prove it once more.' })}
        body={t('cta-body', { defaultValue: "Selection inquiries are reviewed by the recruiting staff, in confidence. Tell us who you served with and what you did. We will tell you whether there is a place to compete for — and we will not waste your time if there isn't." })}
      >
        <Link className="btn" to="/rmh-pmc/contact" search={{ type: 'Recruiting' }}>
          {t('cta-btn-inquiry', { defaultValue: 'Open a selection inquiry' })} <Arrow />
        </Link>
        <Link className="btn-line" to="/rmh-pmc/capabilities">
          {t('cta-btn-capabilities', { defaultValue: "See where you'd deploy" })} <Arrow />
        </Link>
      </CtaBand>
    </div>
  );
}
