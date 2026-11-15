import type { CSSProperties } from 'react';
import {
  DEPLOY_STEPS,
  MEASURE,
  MILESTONES,
} from './optimization-data';

export function OptimizationResultSections() {
  return (
    <>
      {/* ─── Deploy pipeline ──────────────────────────────────────────── */}
      <section
        className="sec-section sec-section--hair"
        aria-labelledby="opt-deploy-title"
      >
        <div className="sec-shell">
          <div className="sec-section__head">
            <p className="sec-eyebrow sec-reveal">
              Getting
              it
              live
            </p>
            <h2
              id="opt-deploy-title"
              className="sec-section__title sec-reveal"
            >
              From
              commit
              to
              production,
              quickly.
            </h2>
            <p className="sec-section__sub sec-reveal">
              Shipping
              a
              fix
              fast
              is
              part
              of
              performance
              too.
              The
              deploy
              is
              a
              cache-aware,
              mostly-parallel
              pipeline.
            </p>
          </div>
          <ol className="sec-steps">
            {DEPLOY_STEPS.map(
              (
                s,
                i,
              ) => (
                <li
                  className="surface-card sec-step sec-reveal"
                  key={
                    s.title
                  }
                  style={
                    {
                      '--sec-delay': `${(i % 2) * 80}ms`,
                    } as CSSProperties
                  }
                >
                  <span className="sec-step__num">
                    {i +
                      1}
                  </span>
                  <div>
                    <h3 className="sec-step__title">
                      {
                        s.title
                      }
                    </h3>
                    <p className="sec-step__body">
                      {
                        s.body
                      }
                    </p>
                  </div>
                </li>
              ),
            )}
          </ol>
        </div>
      </section>

      {/* ─── Measured over time ───────────────────────────────────────── */}
      <section
        id="opt-milestones"
        className="sec-section sec-section--hair"
        aria-labelledby="opt-milestones-title"
      >
        <div className="sec-shell">
          <div className="sec-section__head">
            <p className="sec-eyebrow sec-reveal">
              Measured
              over
              time
            </p>
            <h2
              id="opt-milestones-title"
              className="sec-section__title sec-reveal"
            >
              We
              optimize
              against
              numbers.
            </h2>
            <p className="sec-section__sub sec-reveal">
              Not
              vibes
              —
              profiles.
              A
              few
              of
              the
              wins
              we’ve
              booked,
              with
              the
              before
              and
              after.
            </p>
          </div>

          <div
            className="surface-card sec-bounty-table-wrap sec-reveal"
            role="region"
            aria-labelledby="opt-milestones-title"
            tabIndex={
              0
            }
          >
            <table className="sec-bounty-table">
              <caption className="sr-only">
                Performance
                improvements
                with
                their
                before
                and
                after
                measurements.
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    Improvement
                  </th>
                  <th scope="col">
                    Before
                  </th>
                  <th scope="col">
                    After
                  </th>
                  <th scope="col">
                    Result
                  </th>
                </tr>
              </thead>
              <tbody>
                {MILESTONES.map(
                  (
                    m,
                  ) => (
                    <tr
                      key={
                        m.metric
                      }
                    >
                      <th scope="row">
                        {
                          m.metric
                        }
                      </th>
                      <td>
                        {
                          m.before
                        }
                      </td>
                      <td className="sec-bounty-table__reward">
                        {
                          m.after
                        }
                      </td>
                      <td>
                        {
                          m.result
                        }
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ─── How we measure ───────────────────────────────────────────── */}
      <section
        className="sec-section sec-section--hair"
        aria-labelledby="opt-measure-title"
      >
        <div className="sec-shell">
          <div className="sec-section__head">
            <p className="sec-eyebrow sec-reveal">
              How
              we
              know
            </p>
            <h2
              id="opt-measure-title"
              className="sec-section__title sec-reveal"
            >
              Measured,
              not
              guessed.
            </h2>
            <p className="sec-section__sub sec-reveal">
              You
              can’t
              improve
              what
              you
              don’t
              watch
              —
              so
              we
              watch,
              in
              production
              and
              in
              the
              pipeline.
            </p>
          </div>
          <ul className="sec-list sec-reveal">
            {MEASURE.map(
              (
                m,
              ) => {
                const Icon =
                  m.icon;
                return (
                  <li
                    key={
                      m.text
                    }
                  >
                    <span className="sec-list__icon">
                      <Icon aria-hidden="true" />
                    </span>
                    <span>
                      {
                        m.text
                      }
                    </span>
                  </li>
                );
              },
            )}
          </ul>
        </div>
      </section>
    </>
  );
}
