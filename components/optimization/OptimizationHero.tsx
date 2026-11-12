import type { CSSProperties } from 'react';
import {
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PinnedHero } from '@/components/feed/PinnedHero';
import { STATS } from './optimization-runtime-data';

export function OptimizationHero() {
  return (
    <>
        {/* ─── Hero — the signature pinned scroll-narrative ──────────────── */}
        <PinnedHero
          eyebrow="Speed & optimization"
          title={
            <>
              Speed you can <span className="text-site-accent">feel.</span>
            </>
          }
          subtitle="Fast isn’t a setting we flipped on — it’s hundreds of small decisions, from the first byte the server sends to the last second of a deploy. Here’s how we keep RMH Studios quick."
          scrollCue="The runtime"
          actions={
            <>
              <Button asChild variant="default" size="lg">
                <a href="#opt-runtime">
                How it stays fast
                <ArrowRight aria-hidden="true" />
              </a>
              </Button>
              <Button asChild variant="default" size="lg">
                <a href="#opt-milestones">
                The measured wins
              </a>
              </Button>
            </>
          }
        />

        {/* ─── Trust bar ────────────────────────────────────────────────── */}
        <section className="sec-stats" aria-label="Performance at a glance">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className="surface-card sec-stat sec-reveal"
              style={{ '--sec-delay': `${i * 70}ms` } as CSSProperties}
            >
              <p className="sec-stat__num">{s.num}</p>
              <p className="sec-stat__label">{s.label}</p>
            </div>
          ))}
        </section>

        {/* ─── Statement ────────────────────────────────────────────────── */}
        <section className="sec-section sec-statement" aria-labelledby="opt-statement-title">
          <div className="sec-shell">
            <p className="sec-eyebrow sec-reveal">The philosophy</p>
            <h2 id="opt-statement-title" className="sec-statement__text sec-reveal">
              Every millisecond <b>is a decision.</b>
            </h2>
          </div>
        </section>
    </>
  );
}
