import type { CSSProperties } from 'react';
import {
  Wand2,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ADVANCED, OPT_FAQ } from './optimization-data';

export function OptimizationClosingSections() {
  return (
    <>
        {/* ─── Advanced / proprietary ───────────────────────────────────── */}
        <section
          className="sec-section sec-section--hair"
          aria-labelledby="opt-advanced-title"
        >
          <div className="sec-shell">
            <div className="sec-section__head sec-section__head--center">
              <p className="sec-eyebrow sec-reveal">Under the hood</p>
              <h2 id="opt-advanced-title" className="sec-section__title sec-reveal">
                The clever bits.
              </h2>
              <p className="sec-section__sub sec-reveal">
                A few techniques we built ourselves because nothing off-the-shelf
                did quite what we needed.
              </p>
            </div>

            <div className="sec-features">
              {ADVANCED.map((a, i) => (
                <article
                  key={a.title}
                  className="sec-feature sec-reveal"
                  style={{ '--sec-delay': `${(i % 2) * 90}ms` } as CSSProperties}
                >
                  <span className="sec-feature__icon">
                    <Wand2 aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="sec-feature__title">{a.title}</h3>
                    <p className="sec-feature__body">{a.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FAQ ──────────────────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="opt-faq-title">
          <div className="sec-shell">
            <div className="sec-section__head sec-section__head--center">
              <p className="sec-eyebrow sec-reveal">Questions, answered</p>
              <h2 id="opt-faq-title" className="sec-section__title sec-reveal">
                The things people ask.
              </h2>
            </div>
            <div className="sec-faq sec-reveal">
              {OPT_FAQ.map((f) => (
                <details className="surface-card sec-faq__item" key={f.q}>
                  <summary className="sec-faq__q">{f.q}</summary>
                  <p className="sec-faq__a">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Closing ──────────────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="opt-closing-title">
          <div className="sec-shell">
            <div className="surface-panel sec-disclosure sec-reveal">
              <div className="sec-disclosure__glow" aria-hidden="true" />
              <div className="sec-disclosure__inner">
                <p className="sec-eyebrow">Never finished</p>
                <h2 id="opt-closing-title" className="sec-disclosure__title">
                  The fastest version is the next one.
                </h2>
                <p className="sec-disclosure__body">
                  Performance isn’t a milestone we passed — it’s a habit. We keep
                  profiling, keep trimming, and keep the numbers honest. The bar
                  only moves one way.
                </p>
                <Button asChild variant="default" size="lg">
                  <a href="/security">
                  How we keep you secure
                  <ArrowRight aria-hidden="true" />
                </a>
                </Button>
              </div>
            </div>
          </div>
        </section>
    </>
  );
}
