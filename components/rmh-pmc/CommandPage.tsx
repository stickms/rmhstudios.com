import { Link } from '@tanstack/react-router';

export default function CommandPage() {
  return (
    <>
      {/* PAGE HEADER */}
      <section className="pagehead">
        <div className="container pagehead-inner">
          <span className="desig reveal">The Company // Command</span>
          <h1 className="reveal d1">A single command, built for decisive effect.</h1>
          <p className="lede reveal d2">
            RMH PMC is not a staffing agency with a logo. It is one chain of command — operators, an intelligence
            cell, and a logistics tail under unified control — built so that the entire organization can be brought
            to bear on a single task, with the discretion our clients require.
          </p>
        </div>
      </section>

      {/* MISSION / INTRO */}
      <section className="section">
        <div className="container">
          <div className="feature">
            <div className="reveal">
              <span className="desig">The Mission</span>
              <h3>Organized around the mission, not the product.</h3>
            </div>
            <div className="prose reveal d1">
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
        </div>
      </section>

      {/* PULL QUOTE */}
      <section className="section tight">
        <div className="container">
          <blockquote className="pullquote reveal">
            <span className="lc">Unity of command</span> is not a slogan here. It is the difference between a force and
            a roster of strangers carrying rifles.
          </blockquote>
          <p className="attrib reveal d1">— RMH PMC command doctrine, Section I</p>
        </div>
      </section>

      <hr className="rule" />

      {/* OPERATING PRINCIPLES */}
      <section className="section">
        <div className="container">
          <div className="shead reveal">
            <span className="desig">Operating Principles</span>
            <h2>The standards every task is run against.</h2>
          </div>
          <div className="valuegrid">
            <div className="value reveal">
              <h3>Unity of Command</h3>
              <p>
                One commander owns each task end to end. Operators, intelligence, and logistics move under a single
                intent, so nobody on the ground waits on a committee while the situation changes.
              </p>
            </div>
            <div className="value reveal d1">
              <h3>Judgment Under Fire</h3>
              <p>
                We select for people who make the right call when the plan dissolves and the radio fails. Doctrine sets
                the floor; trained judgment carries the moment the floor gives way.
              </p>
            </div>
            <div className="value reveal d2">
              <h3>Discretion</h3>
              <p>
                Our clients hire us to make a problem quieter, not louder. Identities, movements, and methods stay
                compartmented — and the most successful engagements are the ones no one ever reads about.
              </p>
            </div>
            <div className="value reveal">
              <h3>Lawful Force</h3>
              <p>
                We operate within the laws of armed conflict, applicable sanctions, and the rules of engagement set for
                each task. Force is a last resort, applied proportionately, and never the part of the job we enjoy
                most.
              </p>
            </div>
            <div className="value reveal d1">
              <h3>Selection Never Stops</h3>
              <p>
                A pedigree gets you an interview, not a place. Operators are reselected on our terms before they deploy
                and assessed continuously after — the standard does not relax once the badge is issued.
              </p>
            </div>
            <div className="value reveal d2">
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

      {/* COMMAND STRUCTURE / GOC */}
      <section className="section">
        <div className="container">
          <div className="feature flip">
            <div className="feature-media ticks reveal" aria-hidden="true">
              <svg viewBox="0 0 400 320" width="86%" fill="none">
                <g stroke="#E08A2B" strokeOpacity="0.4" strokeWidth="1">
                  <circle cx="200" cy="160" r="134" />
                  <ellipse cx="200" cy="160" rx="134" ry="48" />
                  <ellipse cx="200" cy="160" rx="134" ry="98" />
                  <ellipse cx="200" cy="160" rx="58" ry="134" />
                  <line x1="66" y1="160" x2="334" y2="160" />
                  <line x1="200" y1="26" x2="200" y2="294" />
                </g>
                {/* command node down to three sections */}
                <g stroke="#F4A646" strokeOpacity="0.75" strokeWidth="1.3">
                  <line x1="200" y1="160" x2="118" y2="98" />
                  <line x1="200" y1="160" x2="288" y2="112" />
                  <line x1="200" y1="160" x2="232" y2="244" />
                </g>
                <g fill="#F4A646">
                  <circle cx="118" cy="98" r="4.5" />
                  <circle cx="288" cy="112" r="4.5" />
                  <circle cx="232" cy="244" r="4.5" />
                </g>
                <circle cx="200" cy="160" r="7" fill="#E08A2B" />
                <circle cx="200" cy="160" r="13" stroke="#F4A646" strokeOpacity="0.7" />
              </svg>
            </div>
            <div className="reveal d1">
              <span className="desig">Command Structure</span>
              <h3>One operations center. Eyes on, around the clock.</h3>
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
              <Link className="btn-text" to="/rmh-pmc/capabilities" hash="intelligence">
                Inside the intelligence line <span className="arw">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* ETHICS — conspicuously, comically short */}
      <section className="section tight">
        <div className="container">
          <div className="shead reveal">
            <span className="desig">Ethics</span>
            <h2>On ethics.</h2>
          </div>
          <p className="lede reveal d1">We follow the rules of engagement. All of them.</p>
        </div>
      </section>

      <hr className="rule" />

      {/* CTA */}
      <section className="section tight">
        <div className="container">
          <div className="cta-band reveal">
            <span className="desig center">Engage</span>
            <h2 style={{ marginTop: 18 }}>Put one command behind your hardest problem.</h2>
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
