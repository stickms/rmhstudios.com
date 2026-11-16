/**
 * RMH PMC command — the company file, built the way the home page is: paper
 * sections alternate with stage scenes. The pull quote and the operating
 * principles are pinned scenes (pages/command.css); the rest is paper.
 */
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Arrow, CtaBand, Decrypt, Hud, Scene, Words, cssVars } from './shared';

/** A centred section header with the section mark (§01…) beside the designator. */
function Head({ mark, desig, title, lede }: { mark: string; desig: string; title: string; lede?: string }) {
  return (
    <header className="sechead">
      <span className="desig">
        <span>{mark}</span>
        <span className="cmd-desig">{desig}</span>
      </span>
      <h2 className="h2">{title}</h2>
      {lede ? <p className="lede">{lede}</p> : null}
    </header>
  );
}

/** A heavy staff gauge: one bar per link in the chain. */
const RANK = [26, 38, 50, 64, 80, 100, 80, 64, 50, 38, 26];

/** The words of a quotation, each carrying `--i` so the scene can light them one after another. */
function LitWords({ text, start }: { text: string; start: number }) {
  return (
    <>
      {text.split(' ').map((word, i) => (
        <span key={i}>
          <span className="qw" style={cssVars({ '--i': start + i })}>
            {word}
          </span>{' '}
        </span>
      ))}
    </>
  );
}

export default function CommandPage() {
  const { t } = useTranslation('c-rmh-pmc');

  const quoteLead = t('pullquote-lc', { defaultValue: 'Unity of command' });
  const quoteBody = t('pullquote-body', { defaultValue: 'is not a slogan here. It is the difference between a force and a roster of strangers carrying rifles.' });
  const leadCount = quoteLead.split(' ').length;
  const quoteCount = leadCount + quoteBody.split(' ').length;

  const doctrines = [
    { l: t('d01-label', { defaultValue: 'Doctrine 01' }), n: t('d01-title', { defaultValue: 'Unity of Command' }), b: t('d01-body', { defaultValue: 'One commander owns each task end to end. Operators, intelligence, and logistics move under a single intent, so nobody on the ground waits on a committee while the situation changes.' }) },
    { l: t('d02-label', { defaultValue: 'Doctrine 02' }), n: t('d02-title', { defaultValue: 'Judgment Under Fire' }), b: t('d02-body', { defaultValue: 'We select for people who make the right call when the plan dissolves and the radio fails. Doctrine sets the floor; trained judgment carries the moment the floor gives way.' }) },
    { l: t('d03-label', { defaultValue: 'Doctrine 03' }), n: t('d03-title', { defaultValue: 'Discretion' }), b: t('d03-body', { defaultValue: 'Our clients hire us to make a problem quieter, not louder. Identities, movements, and methods stay compartmented — and the most successful engagements are the ones no one ever reads about.' }) },
    { l: t('d04-label', { defaultValue: 'Doctrine 04' }), n: t('d04-title', { defaultValue: 'Lawful Force' }), b: t('d04-body', { defaultValue: 'We operate within the laws of armed conflict, applicable sanctions, and the rules of engagement set for each task. Force is a last resort, applied proportionately, and never the part of the job we enjoy most.' }) },
    { l: t('d05-label', { defaultValue: 'Doctrine 05' }), n: t('d05-title', { defaultValue: 'Selection Never Stops' }), b: t('d05-body', { defaultValue: 'A pedigree gets you an interview, not a place. Operators are reselected on our terms before they deploy and assessed continuously after — the standard does not relax once the badge is issued.' }) },
    { l: t('d06-label', { defaultValue: 'Doctrine 06' }), n: t('d06-title', { defaultValue: 'Liaison' }), b: t('d06-body', { defaultValue: 'We maintain cleared relationships with allied national services, so our work is deconflicted, sanctions-screened, and informed by collection no private firm could generate alone.' }) },
  ];

  const field = (label: ReactNode, value: string) => (
    <span className="field">
      <b>{label}</b> ▸ <span className="v"><Decrypt text={value} /></span>
    </span>
  );

  return (
    <div className="pg-command">
      {/* ══ PAGE HEADER — one chain of command, a rank of bars ══ */}
      <section className="pagehead stage cmd-head">
        <Hud />
        <div className="pagehead-obj" aria-hidden="true">
          <div className="cmd-rank">
            <div className="obj-bars cmd-bars" style={cssVars({ '--bh': 'clamp(150px, 21vw, 260px)' })}>
              {RANK.map((h, i) => (
                <i key={i} style={cssVars({ '--h': h, '--i': i })} />
              ))}
            </div>
          </div>
        </div>
        <div className="wrap">
          <div className="metaline">
            {field(t('field-file', { defaultValue: 'File' }), 'COMMAND / §0')}
            {field(t('field-class', { defaultValue: 'Class' }), 'RESTRICTED')}
            {field(t('field-status', { defaultValue: 'Status' }), 'UNIFIED CONTROL')}
          </div>
          <span className="desig">{t('desig-company-command', { defaultValue: 'The Company // Command' })}</span>
          <h1 className="display">
            <Words text={t('headline', { defaultValue: 'A single command, built for decisive effect.' })} />
          </h1>
          <p className="lede ld">
            {t('lede-intro', { defaultValue: 'RMH PMC is not a staffing agency with a logo. It is one chain of command — operators, an intelligence cell, and a logistics tail under unified control — built so that the entire organization can be brought to bear on a single task, with the discretion our clients require.' })}
          </p>
        </div>
      </section>

      {/* ══ §01 MISSION — paper ══ */}
      <section className="sec mission">
        <div className="wrap">
          <Head
            mark="§01"
            desig={t('s01-desig-command-page', { defaultValue: 'The Mission' })}
            title={t('s01-heading-command-page', { defaultValue: 'Organized around the mission, not the product.' })}
            lede={t('s01-lede-command-page', { defaultValue: 'Most private security firms are assembled around what they sell — a guard contract, a training package, a convoy. We built RMH PMC the other way around: every element exists to serve the mission in front of it, and is held under one command until that mission is complete.' })}
          />
          <div className="measure mission-prose">
            <p className="body rv">
              {t('s01-prose-1', { defaultValue: 'Most private security firms are assembled around what they sell — a guard contract, a training package, a convoy. The work is staffed, billed, and forgotten. We built RMH PMC the other way around: every element exists to serve the mission in front of it, and is held under one command until that mission is complete.' })}
            </p>
            <p className="body rv d1">
              {t('s01-prose-2', { defaultValue: 'The company is manned almost entirely by veterans of tier-one special operations units — assault, reconnaissance, maritime, and aviation. They are not the only people here. They work beside an intelligence cell that reads the ground and a logistics tail that keeps them supplied and mobile, anywhere, for as long as it takes.' })}
            </p>
            <p className="body rv d2">
              {t('s01-prose-3', { defaultValue: 'Operators, analysts, and planners answer to the same command, on the same task, at the same tempo. That unity is the product. It lets us apply lawful, proportionate force with discretion — and to know, before we act, exactly what we are acting on.' })}
            </p>
          </div>
        </div>
      </section>

      {/* ══ PULL QUOTE — the words light up as you scroll ══ */}
      <Scene len={2.2} className="stage qt" pinClassName="qt-pin">
        <div className="qt-rings" aria-hidden="true">
          <span className="obj-ring qt-ring qt-ring--a" />
          <span className="obj-ring qt-ring qt-ring--b" />
        </div>
        <div className="qt-veil" aria-hidden="true" />
        <div className="qt-body">
          <span className="stamp">{t('stamp-eyes-only', { defaultValue: 'Eyes Only' })}</span>
          <blockquote className="qt-quote" style={cssVars({ '--n': quoteCount })}>
            <span className="qt-lc">
              <LitWords text={quoteLead} start={0} />
            </span>
            <LitWords text={quoteBody} start={leadCount} />
          </blockquote>
          <p className="qt-by sc-in" style={cssVars({ '--a': 74, '--b': 90 })}>
            {t('pullquote-attrib', { defaultValue: '— RMH PMC command doctrine, Section I' })}
          </p>
        </div>
        <Hud />
      </Scene>

      {/* ══ §02 OPERATING PRINCIPLES — six glass doctrines ride a chrome band ══ */}
      <Scene len={3.2} steps={doctrines.length} className="stage pr" pinClassName="pr-pin">
        <div className="pr-head">
          <Head
            mark="§02"
            desig={t('s02-desig-command-page', { defaultValue: 'Operating Principles' })}
            title={t('s02-heading-command-page', { defaultValue: 'The standards every task is run against.' })}
          />
        </div>
        <div className="pr-stage">
          <div className="pr-band" aria-hidden="true">
            <span className="obj-rail pr-rail pr-rail--thin" />
            <span className="obj-rail pr-rail" />
            <span className="obj-rail pr-rail pr-rail--thin" />
          </div>
          <div className="sx pr-sx">
            <div className="pr-track sc-x" style={cssVars({ '--a': 3, '--b': 97 })}>
              {doctrines.map((d, i) => (
                <article key={d.l} className="pr-card glass glass--lens">
                  <div className="pr-top">
                    <span className="pr-label">{d.l}</span>
                    <span className="pr-num steel" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <h3 className="h3 pr-title">{d.n}</h3>
                  <p className="pr-body">{d.b}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
        <div className="pr-foot" aria-hidden="true">
          <i className="scene-rail" />
        </div>
        <Hud steps={doctrines.length} />
      </Scene>

      {/* ══ §03 COMMAND STRUCTURE — the operations center, a glass plate over the globe ══ */}
      <section className="sec cs">
        <div className="wrap">
          <Head
            mark="§03"
            desig={t('s03-desig-command-page', { defaultValue: 'Command Structure' })}
            title={t('s03-heading-command-page', { defaultValue: 'One operations center. Eyes on, around the clock.' })}
            lede={t('s03-lede', { defaultValue: 'Every deployed element reports to a single global operations center, manned without interruption.' })}
          />
          <div className="cs-split">
            <div className="cs-instr rv-scale">
              <div className="well cs-well" aria-hidden="true">
                <div className="cs-globe">
                  <span className="obj-ring chrome cs-ring" />
                  <span className="obj-orb chrome cs-orb" data-chrome-live="" />
                  <span className="obj-orb chrome cs-node" style={cssVars({ '--ang': '-142deg' })} />
                  <span className="obj-orb chrome cs-node" style={cssVars({ '--ang': '-34deg' })} />
                  <span className="obj-orb chrome cs-node" style={cssVars({ '--ang': '30deg' })} />
                </div>
              </div>
              <div className="cs-plate glass glass--lens">
                <span className="cs-plate-k">{t('goc-label', { defaultValue: 'Global Operations Center' })}</span>
                <b className="cs-plate-v">
                  <span className="led" aria-hidden="true" />
                  {t('goc-watch', { defaultValue: 'Watch · 24/7' })}
                </b>
              </div>
            </div>
            <div className="cs-prose rv">
              <p className="body">
                {t('s03-prose-1', { defaultValue: 'Every deployed element reports to a single global operations center, manned without interruption. The same room watches the intelligence picture, tracks every team in the field, and controls the lift that sustains them — so a change in one theater is a decision in the command, not a surprise on the ground.' })}
              </p>
              <p className="body">
                {t('s03-prose-2', { defaultValue: 'Beneath the commander sit three sections that never separate: the operators who close with the task, the intelligence cell that shapes it, and the logistics tail that makes it possible. Each carries its own staff designator. None of them works alone.' })}
              </p>
              <p className="cs-link">
                <Link className="link-arw" to="/rmh-pmc/capabilities" hash="intelligence">
                  {t('s03-link', { defaultValue: 'Inside the intelligence line' })} <Arrow />
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr className="rule rv-rule" />

      {/* ══ §04 ETHICS — conspicuously, comically short ══ */}
      <section className="sec eth">
        <div className="wrap">
          <Head
            mark="§04"
            desig={t('s04-desig-command-page', { defaultValue: 'Ethics' })}
            title={t('s04-heading-command-page', { defaultValue: 'On ethics.' })}
            lede={t('s04-lede-command-page', { defaultValue: 'We follow the rules of engagement. All of them.' })}
          />
        </div>
      </section>

      {/* ══ CTA ══ */}
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
