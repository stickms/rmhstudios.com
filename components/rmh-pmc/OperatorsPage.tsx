/**
 * RMH PMC — operators. Paper and stage alternate: the page head and the
 * selection scene (four phases, a reticle whose rings lock concentric at
 * Badging) and the closing call to action play on the stage; the pedigree
 * rails, the roles and the terms are paper. Flow mode is an ordinary document.
 */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Arrow, CtaBand, Decrypt, Hud, Reticle, Scene, SceneDots, SecHead, Step, Words, cssVars, stepWindow } from './shared';

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
    {
      tag: 'S-3 // OPERATIONS',
      title: t('role-assaulters-title', { defaultValue: 'Assaulters & Protective Specialists' }),
      body: t('role-assaulters-body', { defaultValue: 'Tier-one assault, recce, or close-protection background. You move well, shoot to a measured standard, and stay calm when the plan does not. The work is principals and ground, not a highlight reel.' }),
    },
    {
      tag: 'S-2 // INTELLIGENCE',
      title: t('role-intel-title', { defaultValue: 'Intelligence Analysts' }),
      body: t('role-intel-body', { defaultValue: 'All-source analysts who have supported deployed forces and can write a finished assessment a client will act on. Cleared experience and language ability are weighted heavily. Tradecraft, not opinion.' }),
    },
    {
      tag: 'S-4 // LOGISTICS',
      title: t('role-logistics-title', { defaultValue: 'Logisticians' }),
      body: t('role-logistics-body', { defaultValue: 'Movement, basing, and sustainment specialists who can put a self-supporting force into a hard place and keep it fed, fueled, and armed. If you have run an expeditionary tail, you know what we mean.' }),
    },
    {
      tag: 'S-1 // MEDICAL',
      title: t('role-medics-title', { defaultValue: 'Combat Medics' }),
      body: t('role-medics-body', { defaultValue: 'SOF medics and paramedics who can hold a casualty alive past the golden hour, far from a role-two facility. Currency matters. You are the reason a team takes the contract.' }),
    },
    {
      tag: 'S-6 // SIGNALS',
      title: t('role-signals-title', { defaultValue: 'Communications & Signals' }),
      body: t('role-signals-body', { defaultValue: 'Signallers and SIGINT-adjacent specialists who keep a team connected and covered across HF, SATCOM, and contested spectrum. You build the network the rest of the command depends on, then defend it.' }),
    },
    {
      tag: 'S-5 // PLANS',
      title: t('role-advisory-title', { defaultValue: 'Advisory Staff' }),
      body: t('role-advisory-body', { defaultValue: 'Former command and staff officers who can sit across from a minister or a board and plan a campaign, not just brief one. Judgment, discretion, and a record of getting it right when it counted.' }),
    },
  ];

  const terms = [
    {
      vk: 'PAY // RISK',
      title: t('term-compensation-title', { defaultValue: 'Compensation' }),
      body: t('term-compensation-body', { defaultValue: 'Pay set against the risk and the rarity of the skill — not a market rate for a guard. Hazard and deployment terms are in the contract, not implied.' }),
    },
    {
      vk: 'KIT // SUSTAIN',
      title: t('term-kit-title', { defaultValue: 'World-Class Kit' }),
      body: t('term-kit-body', { defaultValue: 'You are issued and sustained on equipment chosen by operators, maintained by armorers, and replaced when it wears. You will not be the limiting factor.' }),
    },
    {
      vk: 'C2 // COMMAND',
      title: t('term-command-title', { defaultValue: 'A Real Chain of Command' }),
      body: t('term-command-body', { defaultValue: 'One command, a team leader who answers for you, and an operations center that is always manned. You will know who has the ground truth and who makes the call.' }),
    },
    {
      vk: 'S-1 // COVER',
      title: t('term-medical-title', { defaultValue: 'Medical & Family Cover' }),
      body: t('term-medical-body', { defaultValue: 'Comprehensive medical, evacuation, and disability cover for you, and standing provision for your family if the worst happens. It is written down before you deploy.' }),
    },
    {
      vk: 'POST // TRANSITION',
      title: t('term-transition-title', { defaultValue: 'Post-Contract Transition' }),
      body: t('term-transition-body', { defaultValue: 'Structured decompression, currency-keeping, and placement support when a contract ends. We do not cut people loose at the airfield. The relationship outlasts the rotation.' }),
    },
    {
      vk: 'STD // BAR',
      title: t('term-standard-title', { defaultValue: 'The Standard Itself' }),
      body: t('term-standard-body', { defaultValue: 'You will work alongside people selected to the same bar you cleared — and never have to carry someone who was let through because a roster needed filling.' }),
    },
  ];

  const units = [
    'SAS',
    'SBS',
    'DELTA',
    'DEVGRU',
    'SAYERET MATKAL',
    'SHAYETET 13',
    'GIGN',
    'GIGN / RAID',
    'KSK',
    'JTF2',
    'GROM',
    'JW KOMANDOSÓW',
    'SASR',
    'NZSAS',
    'FÖRSVARSMAKTEN SOG',
    'MARSOC',
    'RANGERS',
    'PARA-SF',
  ];

  const rails = [units.slice(0, 6), units.slice(6, 12), units.slice(12)];

  return (
    <div className="pg-operators">
      {/* ══ PAGE HEAD — a hex badge plate rising on the stage ══ */}
      <section className="pagehead stage">
        <Hud />
        <div className="pagehead-obj" aria-hidden="true">
          <div className="oh-obj">
            <span className="obj-ring chrome oh-ring" />
            <span className="obj-hex chrome oh-hex" data-chrome-live="" />
          </div>
        </div>
        <div className="wrap">
          <div className="metaline">
            <span className="field"><b>File</b> ▸ <span className="v"><Decrypt text="RMH-PMC / SELECTION" /></span></span>
            <span className="field"><b>Class</b> ▸ <span className="v"><Decrypt text="RESTRICTED" /></span></span>
            <span className="field"><b>Process</b> ▸ <span className="v"><Decrypt text="OPERATORS" /></span></span>
          </div>
          <span className="desig">{t('pagehead-desig', { defaultValue: 'Selection // Operators' })}</span>
          <h1 className="display">
            <Words text={t('pagehead-h1', { defaultValue: 'The standard does not lower for anyone.' })} />
          </h1>
          <p className="lede ld">
            {t('pagehead-lede', { defaultValue: 'We bring on a small number of proven people each year — operators, analysts, logisticians, medics, and signallers — and we select them again on our own terms. A career somewhere else is the price of admission, not the qualification. If you have already proven it, you prove it once more here.' })}
          </p>
        </div>
      </section>

      {/* ══ §01 PEDIGREE — paper, three rails of glass pills travelling against each other ══ */}
      <section className="sec ped">
        <div className="wrap">
          <SecHead
            desig={t('pedigree-desig', { defaultValue: 'Pedigree' })}
            title={t('pedigree-h2', { defaultValue: 'Hired from the units that set the standard.' })}
            lede={t('pedigree-lede', { defaultValue: 'Our operators come from the tier-one elements of allied nations — assault, recce, maritime, and aviation. We do not lower the bar to fill a roster. We hold it, and we draw from the people who cleared it the first time.' })}
          />
        </div>
        <ul className="ped-stage">
          {rails.map((row, r) => (
            <li key={r} className="sx ped-row chrome chrome-ingot">
              <div className={r === 1 ? 'sx-track sx-rev' : 'sx-track'}>
                {row.map((u) => (
                  <span key={u} className="ped-pill glass glass--pill">{u}</span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ══ §02 SELECTION — the pinned scene: four phases, the sight locks on at Badging ══ */}
      <Scene len={3.4} steps={phases.length} className="stage sel" pinClassName="sel-pin">
        <div className="sel-head">
          <SecHead
            desig={t('pipeline-desig', { defaultValue: 'Selection Pipeline' })}
            title={t('pipeline-h2', { defaultValue: 'Four phases. No shortcuts through any of them.' })}
            lede={t('pipeline-lede', { defaultValue: 'Selection is a sequence, run in order, with a hard stop at every gate. Most candidates do not finish it — and the ones who do arrive on a team already known, already cleared, already trusted.' })}
          />
        </div>
        <div className="sel-body">
          <aside className="sel-index" aria-hidden="true">
            <i className="scene-rail sel-rail" />
            <ol>
              {phases.map((p, i) => {
                const { a, b } = stepWindow(i, phases.length);
                const pos = i === 0 ? ' is-first' : i === phases.length - 1 ? ' is-last' : '';
                return (
                  <li key={p.title} className={`sc-live${pos}`} style={cssVars({ '--a': a, '--b': b })}>
                    <span className="sel-ix">{String(i + 1).padStart(2, '0')}</span>
                    {p.title}
                  </li>
                );
              })}
            </ol>
          </aside>
          <div className="sel-object" aria-hidden="true">
            <Reticle className="sel-reticle" live />
          </div>
          <div className="sel-card glass glass--lens">
            <div className="sc-stack sel-cards">
              {phases.map((p, i) => (
                <Step key={p.title} index={i} count={phases.length} className="sel-step">
                  <div className="sel-item">
                    <div className="sel-ph">PHASE {String(i + 1).padStart(2, '0')}</div>
                    <h3 className="h3 sel-t">{p.title}</h3>
                    <p className="sel-p">{p.body}</p>
                  </div>
                </Step>
              ))}
            </div>
          </div>
        </div>
        <div className="sel-foot" aria-hidden="true">
          <SceneDots count={phases.length} />
          <i className="scene-rail" />
        </div>
        <Hud steps={phases.length} />
      </Scene>

      {/* ══ §03 ROLES — paper, glass cards over chrome ══ */}
      <section className="sec roles">
        <div className="wrap">
          <SecHead
            desig={t('roles-desig', { defaultValue: 'Roles We Recruit' })}
            title={t('roles-h2', { defaultValue: 'A team is more than its shooters.' })}
            lede={t('roles-lede', { defaultValue: 'We man a whole command, not just an assault element. These are the roles we recruit for — and the kind of person who fits each one.' })}
          />
          <div className="well roles-well">
            <span className="obj-ring chrome roles-ring" aria-hidden="true" />
            <span className="obj-orb chrome roles-orb roles-orb--a" aria-hidden="true" />
            <span className="obj-orb chrome roles-orb roles-orb--b" aria-hidden="true" />
            <span className="obj-orb chrome roles-orb roles-orb--c" aria-hidden="true" />
            <div className="roles-grid">
              {roles.map((r) => (
                <div className="role rv-scale" key={r.title}>
                  <article className="role-card glass">
                    <span className="role-tag">{r.tag}</span>
                    <h3 className="h3">{r.title}</h3>
                    <p>{r.body}</p>
                  </article>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* ══ §04 TERMS — paper, rows on hairlines ══ */}
      <section className="sec terms">
        <div className="wrap">
          <SecHead
            desig={t('terms-desig', { defaultValue: 'The Terms' })}
            title={t('terms-h2', { defaultValue: 'What you carry our flag for.' })}
            lede={t('terms-lede', { defaultValue: "We ask a lot, and we are direct about what comes back. No equity-in-the-mission talk — terms a serious professional can actually plan a life around." })}
          />
          <div className="rows terms-rows">
            {terms.map((term) => (
              <div className="row rv" key={term.title}>
                <span className="row-k">{term.vk}</span>
                <h3 className="row-t">{term.title}</h3>
                <p className="row-d">{term.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ SELECTION CTA — the sight locks on ══ */}
      <CtaBand
        desig={t('cta-desig', { defaultValue: 'Selection' })}
        title={t('cta-h2', { defaultValue: 'Prove it once more.' })}
        body={t('cta-body', { defaultValue: 'Selection inquiries are reviewed by the recruiting staff, in confidence. Tell us who you served with and what you did. We will tell you whether there is a place to compete for — and we will not waste your time if there isn\'t.' })}
      >
        <Link className="btn" to="/rmh-pmc/contact" search={{ type: 'Recruiting' }}>
          {t('cta-btn-inquiry', { defaultValue: 'Open a selection inquiry' })} <Arrow />
        </Link>
        <Link className="btn-glass" to="/rmh-pmc/capabilities">
          {t('cta-btn-capabilities', { defaultValue: "See where you'd deploy" })} <Arrow />
        </Link>
      </CtaBand>
    </div>
  );
}
