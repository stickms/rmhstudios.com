/**
 * RMH PMC command — the company file. The page head is the one stage; the
 * mission, the doctrine quote, the operating principles, the command structure
 * and the (short) ethics follow on paper.
 */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Arrow, CtaBand, PageHead, SecHead } from './shared';

export default function CommandPage() {
  const { t } = useTranslation('c-rmh-pmc');

  const doctrines = [
    { l: t('d01-label', { defaultValue: 'Doctrine 01' }), n: t('d01-title', { defaultValue: 'Unity of Command' }), b: t('d01-body', { defaultValue: 'One commander owns each task end to end. Operators, intelligence, and logistics move under a single intent, so nobody on the ground waits on a committee while the situation changes.' }) },
    { l: t('d02-label', { defaultValue: 'Doctrine 02' }), n: t('d02-title', { defaultValue: 'Judgment Under Fire' }), b: t('d02-body', { defaultValue: 'We select for people who make the right call when the plan dissolves and the radio fails. Doctrine sets the floor; trained judgment carries the moment the floor gives way.' }) },
    { l: t('d03-label', { defaultValue: 'Doctrine 03' }), n: t('d03-title', { defaultValue: 'Discretion' }), b: t('d03-body', { defaultValue: 'Our clients hire us to make a problem quieter, not louder. Identities, movements, and methods stay compartmented — and the most successful engagements are the ones no one ever reads about.' }) },
    { l: t('d04-label', { defaultValue: 'Doctrine 04' }), n: t('d04-title', { defaultValue: 'Lawful Force' }), b: t('d04-body', { defaultValue: 'We operate within the laws of armed conflict, applicable sanctions, and the rules of engagement set for each task. Force is a last resort, applied proportionately, and never the part of the job we enjoy most.' }) },
    { l: t('d05-label', { defaultValue: 'Doctrine 05' }), n: t('d05-title', { defaultValue: 'Selection Never Stops' }), b: t('d05-body', { defaultValue: 'A pedigree gets you an interview, not a place. Operators are reselected on our terms before they deploy and assessed continuously after — the standard does not relax once the badge is issued.' }) },
    { l: t('d06-label', { defaultValue: 'Doctrine 06' }), n: t('d06-title', { defaultValue: 'Liaison' }), b: t('d06-body', { defaultValue: 'We maintain cleared relationships with allied national services, so our work is deconflicted, sanctions-screened, and informed by collection no private firm could generate alone.' }) },
  ];

  return (
    <div className="pg-command">
      <PageHead
        seed={5}
        meta={[
          [t('field-file', { defaultValue: 'File' }), 'COMMAND / §0'],
          [t('field-class', { defaultValue: 'Class' }), 'RESTRICTED'],
          [t('field-status', { defaultValue: 'Status' }), 'UNIFIED CONTROL'],
        ]}
        desig={t('desig-company-command', { defaultValue: 'The Company // Command' })}
        title={t('headline', { defaultValue: 'A single command, built for decisive effect.' })}
        lede={t('lede-intro', { defaultValue: 'RMH PMC is not a staffing agency with a logo. It is one chain of command — operators, an intelligence cell, and a logistics tail under unified control — built so that the entire organization can be brought to bear on a single task, with the discretion our clients require.' })}
      />

      {/* ══ §01 MISSION ══ */}
      <section className="sec">
        <div className="wrap split">
          <SecHead
            className="rv"
            desig={<>§01 · {t('s01-desig-command-page', { defaultValue: 'The Mission' })}</>}
            title={t('s01-heading-command-page', { defaultValue: 'Organized around the mission, not the product.' })}
          />
          <div className="rv">
            <p className="body">
              {t('s01-prose-1', { defaultValue: 'Most private security firms are assembled around what they sell — a guard contract, a training package, a convoy. The work is staffed, billed, and forgotten. We built RMH PMC the other way around: every element exists to serve the mission in front of it, and is held under one command until that mission is complete.' })}
            </p>
            <p className="body">
              {t('s01-prose-2', { defaultValue: 'The company is manned almost entirely by veterans of tier-one special operations units — assault, reconnaissance, maritime, and aviation. They are not the only people here. They work beside an intelligence cell that reads the ground and a logistics tail that keeps them supplied and mobile, anywhere, for as long as it takes.' })}
            </p>
            <p className="body">
              {t('s01-prose-3', { defaultValue: 'Operators, analysts, and planners answer to the same command, on the same task, at the same tempo. That unity is the product. It lets us apply lawful, proportionate force with discretion — and to know, before we act, exactly what we are acting on.' })}
            </p>
          </div>
        </div>
      </section>

      {/* ══ THE DOCTRINE, QUOTED ══ */}
      <section className="sec">
        <div className="wrap">
          <figure className="rv">
            <span className="stamp">{t('stamp-eyes-only', { defaultValue: 'Eyes Only' })}</span>
            <blockquote className="quote">
              <span className="steel">{t('pullquote-lc', { defaultValue: 'Unity of command' })}</span>{' '}
              {t('pullquote-body', { defaultValue: 'is not a slogan here. It is the difference between a force and a roster of strangers carrying rifles.' })}
            </blockquote>
            <figcaption className="meta quote-by">{t('pullquote-attrib', { defaultValue: '— RMH PMC command doctrine, Section I' })}</figcaption>
          </figure>
        </div>
      </section>

      {/* ══ §02 OPERATING PRINCIPLES ══ */}
      <section className="sec">
        <div className="wrap">
          <SecHead
            className="rv"
            desig={<>§02 · {t('s02-desig-command-page', { defaultValue: 'Operating Principles' })}</>}
            title={t('s02-heading-command-page', { defaultValue: 'The standards every task is run against.' })}
          />
          <div className="grid-3">
            {doctrines.map((d) => (
              <article key={d.l} className="card-text rv">
                <span className="meta">{d.l}</span>
                <h3 className="h3">{d.n}</h3>
                <p>{d.b}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ══ §03 COMMAND STRUCTURE ══ */}
      <section className="sec">
        <div className="wrap split">
          <div className="rv">
            <SecHead
              desig={<>§03 · {t('s03-desig-command-page', { defaultValue: 'Command Structure' })}</>}
              title={t('s03-heading-command-page', { defaultValue: 'One operations center. Eyes on, around the clock.' })}
            />
            <p className="meta" style={{ marginTop: 28 }}>
              <span className="ink">{t('goc-label', { defaultValue: 'Global Operations Center' })}</span> · {t('goc-watch', { defaultValue: 'Watch · 24/7' })}
            </p>
          </div>
          <div className="rv">
            <p className="body">
              {t('s03-prose-1', { defaultValue: 'Every deployed element reports to a single global operations center, manned without interruption. The same room watches the intelligence picture, tracks every team in the field, and controls the lift that sustains them — so a change in one theater is a decision in the command, not a surprise on the ground.' })}
            </p>
            <p className="body">
              {t('s03-prose-2', { defaultValue: 'Beneath the commander sit three sections that never separate: the operators who close with the task, the intelligence cell that shapes it, and the logistics tail that makes it possible. Each carries its own staff designator. None of them works alone.' })}
            </p>
            <p className="more">
              <Link className="link-arw" to="/rmh-pmc/capabilities" hash="intelligence">
                {t('s03-link', { defaultValue: 'Inside the intelligence line' })} <Arrow />
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ══ §04 ETHICS — conspicuously, comically short ══ */}
      <section className="sec">
        <div className="wrap">
          <SecHead
            className="rv"
            desig={<>§04 · {t('s04-desig-command-page', { defaultValue: 'Ethics' })}</>}
            title={t('s04-heading-command-page', { defaultValue: 'On ethics.' })}
            lede={t('s04-lede-command-page', { defaultValue: 'We follow the rules of engagement. All of them.' })}
          />
        </div>
      </section>

      <CtaBand
        desig={t('cta-desig-command-page', { defaultValue: 'Engage' })}
        title={t('cta-heading-command-page', { defaultValue: 'Put one command behind your hardest problem.' })}
        body={t('cta-body-command-page', { defaultValue: 'If the outcome cannot be left to chance, the conversation starts the same way every time: a briefing, under non-disclosure, with the people who would actually run the task.' })}
      >
        <Link className="btn" to="/rmh-pmc/contact">
          {t('cta-btn', { defaultValue: 'Request a briefing' })} <Arrow />
        </Link>
      </CtaBand>
    </div>
  );
}
