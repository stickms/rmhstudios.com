import { Link } from '@tanstack/react-router';
import { Decrypt } from './shared';

export default function CommandPage() {
  return (
    <>
      {/* ══ PAGE HEADER ══ */}
      <section className="pagehead">
        <div className="container pagehead-inner">
          <div className="brief-meta reveal">
            <span className="field"><b>File</b> ▸ <span className="v"><Decrypt text="COMMAND / §0" /></span></span>
            <span className="field"><b>Class</b> ▸ <span className="v"><Decrypt text="RESTRICTED" /></span></span>
            <span className="field"><b>Status</b> ▸ <span className="v"><Decrypt text="UNIFIED CONTROL" /></span></span>
          </div>
          <span className="desig reveal">The Company // Command</span>
          <h1 className="reveal d1">A single command, built for decisive effect.</h1>
          <p className="lede reveal d2">
            RMH PMC is not a staffing agency with a logo. It is one chain of command — operators, an intelligence
            cell, and a logistics tail under unified control — built so that the entire organization can be brought
            to bear on a single task, with the discretion our clients require.
          </p>
        </div>
      </section>

      {/* ══ §01 MISSION / INTRO ══ */}
      <section className="sec">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">§01</div>
            <div className="sechead-body">
              <span className="desig">The Mission</span>
              <h2>Organized around the mission, not the product.</h2>
              <p className="lede">
                Most private security firms are assembled around what they sell — a guard contract, a training package,
                a convoy. We built RMH PMC the other way around: every element exists to serve the mission in front of
                it, and is held under one command until that mission is complete.
              </p>
            </div>
          </div>
          <div className="prose reveal d1" style={{ maxWidth: '70ch' }}>
            <p>
              Most private security firms are assembled around what they sell — a guard contract, a training package,
              a convoy. The work is staffed, billed, and forgotten. We built RMH PMC the other way around: every
              element exists to serve the mission in front of it, and is held under one command until that mission is
              complete.
            </p>
            <p>
              The company is manned almost entirely by veterans of tier-one special operations units — assault,
              reconnaissance, maritime, and aviation. They are not the only people here. They work beside an
              intelligence cell that reads the ground and a logistics tail that keeps them supplied and mobile,
              anywhere, for as long as it takes.
            </p>
            <p>
              Operators, analysts, and planners answer to the same command, on the same task, at the same tempo. That
              unity is the product. It lets us apply lawful, proportionate force with discretion — and to know,
              before we act, exactly what we are acting on.
            </p>
          </div>
        </div>
      </section>

      {/* ══ PULL QUOTE ══ */}
      <section className="sec tight">
        <div className="container">
          <span className="stamp reveal">Eyes Only</span>
          <blockquote className="pullquote reveal d1" style={{ marginTop: 28 }}>
            <span className="lc">Unity of command</span> is not a slogan here. It is the difference between a force and
            a roster of strangers carrying rifles.
          </blockquote>
          <p className="attrib reveal d1">— RMH PMC command doctrine, Section I</p>
        </div>
      </section>

      <hr className="rule" />

      {/* ══ §02 OPERATING PRINCIPLES ══ */}
      <section className="sec">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">§02</div>
            <div className="sechead-body">
              <span className="desig">Operating Principles</span>
              <h2>The standards every task is run against.</h2>
            </div>
          </div>
          <div className="valuegrid">
            <div className="value reveal">
              <div className="vk">Doctrine 01</div>
              <h3>Unity of Command</h3>
              <p>
                One commander owns each task end to end. Operators, intelligence, and logistics move under a single
                intent, so nobody on the ground waits on a committee while the situation changes.
              </p>
            </div>
            <div className="value reveal d1">
              <div className="vk">Doctrine 02</div>
              <h3>Judgment Under Fire</h3>
              <p>
                We select for people who make the right call when the plan dissolves and the radio fails. Doctrine sets
                the floor; trained judgment carries the moment the floor gives way.
              </p>
            </div>
            <div className="value reveal d2">
              <div className="vk">Doctrine 03</div>
              <h3>Discretion</h3>
              <p>
                Our clients hire us to make a problem quieter, not louder. Identities, movements, and methods stay
                compartmented — and the most successful engagements are the ones no one ever reads about.
              </p>
            </div>
            <div className="value reveal">
              <div className="vk">Doctrine 04</div>
              <h3>Lawful Force</h3>
              <p>
                We operate within the laws of armed conflict, applicable sanctions, and the rules of engagement set for
                each task. Force is a last resort, applied proportionately, and never the part of the job we enjoy
                most.
              </p>
            </div>
            <div className="value reveal d1">
              <div className="vk">Doctrine 05</div>
              <h3>Selection Never Stops</h3>
              <p>
                A pedigree gets you an interview, not a place. Operators are reselected on our terms before they deploy
                and assessed continuously after — the standard does not relax once the badge is issued.
              </p>
            </div>
            <div className="value reveal d2">
              <div className="vk">Doctrine 06</div>
              <h3>Liaison</h3>
              <p>
                We maintain cleared relationships with allied national services, so our work is deconflicted,
                sanctions-screened, and informed by collection no private firm could generate alone.
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* ══ §03 COMMAND STRUCTURE / GOC ══ */}
      <section className="sec">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">§03</div>
            <div className="sechead-body">
              <span className="desig">Command Structure</span>
              <h2>One operations center. Eyes on, around the clock.</h2>
              <p className="lede">
                Every deployed element reports to a single global operations center, manned without interruption.
              </p>
            </div>
          </div>

          <div className="frame reveal" style={{ marginBottom: 'clamp(28px,4vw,44px)' }}>
            <div className="plate-head">
              <span>Global Operations Center</span>
              <b>Watch · 24/7</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'clamp(20px,3vw,32px)' }}>
              <svg viewBox="0 0 400 320" width="86%" fill="none" aria-hidden="true">
                <g stroke="#E89A3C" strokeOpacity="0.4" strokeWidth="1">
                  <circle cx="200" cy="160" r="134" />
                  <ellipse cx="200" cy="160" rx="134" ry="48" />
                  <ellipse cx="200" cy="160" rx="134" ry="98" />
                  <ellipse cx="200" cy="160" rx="58" ry="134" />
                  <line x1="66" y1="160" x2="334" y2="160" />
                  <line x1="200" y1="26" x2="200" y2="294" />
                </g>
                {/* command node down to three sections */}
                <g stroke="#F6B45A" strokeOpacity="0.75" strokeWidth="1.3">
                  <line x1="200" y1="160" x2="118" y2="98" />
                  <line x1="200" y1="160" x2="288" y2="112" />
                  <line x1="200" y1="160" x2="232" y2="244" />
                </g>
                <g fill="#F6B45A">
                  <circle cx="118" cy="98" r="4.5" />
                  <circle cx="288" cy="112" r="4.5" />
                  <circle cx="232" cy="244" r="4.5" />
                </g>
                <circle cx="200" cy="160" r="7" fill="#E89A3C" />
                <circle cx="200" cy="160" r="13" stroke="#F6B45A" strokeOpacity="0.7" />
              </svg>
            </div>
          </div>

          <div className="prose reveal d1" style={{ maxWidth: '70ch' }}>
            <p>
              Every deployed element reports to a single global operations center, manned without interruption. The
              same room watches the intelligence picture, tracks every team in the field, and controls the lift that
              sustains them — so a change in one theater is a decision in the command, not a surprise on the ground.
            </p>
            <p>
              Beneath the commander sit three sections that never separate: the operators who close with the task,
              the intelligence cell that shapes it, and the logistics tail that makes it possible. Each carries its
              own staff designator. None of them works alone.
            </p>
            <p style={{ marginTop: 24 }}>
              <Link className="btn-text" to="/rmh-pmc/capabilities" hash="intelligence">
                Inside the intelligence line <span className="arw">→</span>
              </Link>
            </p>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* ══ §04 ETHICS — conspicuously, comically short ══ */}
      <section className="sec tight">
        <div className="container">
          <div className="sechead reveal">
            <div className="secref">§04</div>
            <div className="sechead-body">
              <span className="desig">Ethics</span>
              <h2>On ethics.</h2>
            </div>
          </div>
          <p className="lede reveal d1">We follow the rules of engagement. All of them.</p>
        </div>
      </section>

      <hr className="rule" />

      {/* ══ CTA ══ */}
      <section className="sec tight">
        <div className="container">
          <div className="cta-band reveal">
            <span className="desig center">Engage</span>
            <h2 style={{ marginTop: 16 }}>Put one command behind your hardest problem.</h2>
            <p>
              If the outcome cannot be left to chance, the conversation starts the same way every time: a briefing,
              under non-disclosure, with the people who would actually run the task.
            </p>
            <Link className="btn btn-amber" to="/rmh-pmc/contact">
              Request a briefing <span className="arw">→</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
