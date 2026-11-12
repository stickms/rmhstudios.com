import type { CSSProperties } from 'react';
import { BUILDTIME, RUNTIME } from './optimization-runtime-data';
import { BUILD_SPECS, BUNDLE_SPECS, RENDER_SPECS } from './optimization-data';

export function OptimizationRuntimeSections() {
  return (
    <>
        {/* ─── Runtime ──────────────────────────────────────────────────── */}
        <section
          id="opt-runtime"
          className="sec-section sec-section--hair"
          aria-labelledby="opt-runtime-title"
        >
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">At runtime</p>
              <h2 id="opt-runtime-title" className="sec-section__title sec-reveal">
                Instant, on purpose.
              </h2>
              <p className="sec-section__sub sec-reveal">
                Perceived speed is engineered. These are the techniques that make
                the app feel like it’s already one step ahead of you.
              </p>
            </div>

            <div className="sec-grid">
              {RUNTIME.map((p, i) => {
                const Icon = p.icon;
                return (
                  <article
                    key={p.title}
                    className="surface-card sec-card sec-reveal"
                    style={{ '--sec-delay': `${(i % 3) * 80}ms` } as CSSProperties}
                  >
                    <span className="sec-card__icon">
                      <Icon aria-hidden="true" />
                    </span>
                    <h3 className="sec-card__title">{p.title}</h3>
                    <p className="sec-card__body">{p.body}</p>
                    <span className="sec-card__tag">{p.tag}</span>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── Rendering pipeline ───────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="opt-render-title">
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">The rendering pipeline</p>
              <h2 id="opt-render-title" className="sec-section__title sec-reveal">
                Painted before you blink.
              </h2>
              <p className="sec-section__sub sec-reveal">
                The path from a request to a usable screen is where perceived speed
                is won or lost. Here’s how ours is wired.
              </p>
            </div>
            <div className="surface-card sec-spec sec-reveal">
              {RENDER_SPECS.map((s) => (
                <div className="sec-spec__row" key={s.term}>
                  <div className="sec-spec__term">{s.term}</div>
                  <p className="sec-spec__desc">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── The bundle ───────────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="opt-bundle-title">
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">The bundle</p>
              <h2 id="opt-bundle-title" className="sec-section__title sec-reveal">
                Download only what this screen needs.
              </h2>
              <p className="sec-section__sub sec-reveal">
                The cheapest byte is the one we never send. We stay aggressive
                about what actually reaches your browser.
              </p>
            </div>
            <div className="surface-card sec-spec sec-reveal">
              {BUNDLE_SPECS.map((s) => (
                <div className="sec-spec__row" key={s.term}>
                  <div className="sec-spec__term">{s.term}</div>
                  <p className="sec-spec__desc">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Buildtime ────────────────────────────────────────────────── */}
        <section
          className="sec-section sec-section--hair"
          aria-labelledby="opt-build-title"
        >
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">At build &amp; deploy</p>
              <h2 id="opt-build-title" className="sec-section__title sec-reveal">
                Fast to build. Fast to ship.
              </h2>
              <p className="sec-section__sub sec-reveal">
                Speed isn’t only what users feel — it’s how quickly we can get a
                fix in front of them. So we profile and tune the pipeline too.
              </p>
            </div>

            <div className="sec-features">
              {BUILDTIME.map((f, i) => {
                const Icon = f.icon;
                return (
                  <article
                    key={f.title}
                    className="sec-feature sec-reveal"
                    style={{ '--sec-delay': `${(i % 2) * 90}ms` } as CSSProperties}
                  >
                    <span className="sec-feature__icon">
                      <Icon aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="sec-feature__title">{f.title}</h3>
                      <p className="sec-feature__body">{f.body}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── Build pipeline ───────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="opt-buildpipe-title">
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">Inside the build</p>
              <h2 id="opt-buildpipe-title" className="sec-section__title sec-reveal">
                Forty seconds, measured.
              </h2>
              <p className="sec-section__sub sec-reveal">
                A fast build is a fast feedback loop. Every stage is understood,
                profiled, and tuned.
              </p>
            </div>
            <div className="surface-card sec-spec sec-reveal">
              {BUILD_SPECS.map((s) => (
                <div className="sec-spec__row" key={s.term}>
                  <div className="sec-spec__term">{s.term}</div>
                  <p className="sec-spec__desc">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
    </>
  );
}
