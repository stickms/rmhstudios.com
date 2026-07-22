import { useEffect, useRef, type CSSProperties } from 'react';
import {
  Droplets,
  Sun,
  Waves,
  Layers,
  Palette,
  Accessibility,
  ChevronLeft,
  ArrowRight,
  Cpu,
  MonitorSmartphone,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import '@/components/security/security.css';
import { PinnedHero } from '@/components/feed/PinnedHero';

/**
 * /design — a standalone, Apple-styled page telling the Liquid Glass story:
 * the material system behind every surface on rmhstudios.com. Sibling of
 * /security and /optimization (shares their `sec-*` document grammar from
 * security.css). Every claim maps to a real mechanism in this codebase —
 * the shader layer (lib/liquid-gl), the scene light (useGlassLight), the
 * clarity slider, the theme marketplace — so the page stays honest.
 *
 * Motion is progressive enhancement: everything renders visible on the
 * server; scroll-reveal turns on only for visitors without reduced motion.
 */

interface Pillar {
  icon: LucideIcon;
  title: string;
  body: string;
  tag: string;
}

const PILLARS: Pillar[] = [
  {
    icon: Droplets,
    title: 'It really refracts',
    body: 'Edges of glass bend what sits behind them through a genuine lens displacement — on capable browsers, a shader computes the refraction per pixel, chromatic dispersion included. No painted-on gradients pretending to be optics.',
    tag: 'SDF lenses · dispersion',
  },
  {
    icon: Sun,
    title: 'One light, every surface answers',
    body: 'A single scene light lives where your attention is — your cursor on desktop, the tilt of your phone in your hand. Every pane, capsule, and menu catches it on the rim as it passes.',
    tag: 'Pointer · tilt · fresnel',
  },
  {
    icon: Waves,
    title: 'Moves like liquid',
    body: 'Controls do not slide — they flow. The active tab stretches with its own velocity, pinches into a teardrop, and reabsorbs on arrival. Menus bud out of the button you pressed. Posts open by becoming the page.',
    tag: 'Metaballs · morph opens',
  },
  {
    icon: Layers,
    title: 'Depth you can feel',
    body: 'Behind everything, a two-layer aurora drifts on its own time and parallaxes against your movement. Glass is only glass when there is a world behind it.',
    tag: 'Aurora · parallax',
  },
  {
    icon: Palette,
    title: 'Your glass, your way',
    body: 'A clarity slider runs the material from fully opaque to nearly clear. Six built-in themes tint the same glass — and the theme studio lets members craft new tints anyone can buy with RMH coins.',
    tag: 'Clarity · themes · studio',
  },
  {
    icon: Accessibility,
    title: 'Beauty that backs off',
    body: 'Reduced motion stills every animation. Reduced transparency and High Contrast turn the glass solid. The whole system degrades tier by tier — the same interface, never a lesser one.',
    tag: 'A11y-first fallbacks',
  },
];

interface Tier {
  icon: LucideIcon;
  title: string;
  body: string;
}

const TIERS: Tier[] = [
  {
    icon: Cpu,
    title: 'WebGPU & WebGL2',
    body: 'A single lazily-loaded canvas renders the aurora and every liquid body in one pass — capped resolution, paused when hidden, idle-damped to sip power.',
  },
  {
    icon: MonitorSmartphone,
    title: 'Every other browser',
    body: 'The same design renders through layered CSS and SVG filters — blur, glint, and morph included. Different plumbing, one look.',
  },
  {
    icon: Sparkles,
    title: 'Your preferences win',
    body: 'Motion, transparency, and contrast preferences override everything above. The prettiest tier is always the one you asked for.',
  },
];

export function LiquidGlassPage() {
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page || typeof IntersectionObserver === 'undefined') return;

    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    page.setAttribute('data-animate', '');
    const revealables = Array.from(page.querySelectorAll<HTMLElement>('.sec-reveal'));

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );

    revealables.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={pageRef} className="sec-page">
      <a className="sec-skip" href="#lg-main">
        Skip to content
      </a>

      <header>
        <nav className="sec-nav" aria-label="Liquid Glass">
          <div className="sec-nav__inner">
            <a className="sec-nav__back" href="/">
              <ChevronLeft size={15} strokeWidth={2.2} aria-hidden="true" />
              RMH Studios
            </a>
            <span className="sec-nav__sep" aria-hidden="true">
              /
            </span>
            <span className="sec-nav__title">Liquid Glass</span>
            <a className="sec-nav__cta" href="/liquid-glass">
              Open the design lab
              <ArrowRight size={14} aria-hidden="true" />
            </a>
          </div>
        </nav>
      </header>

      <main id="lg-main">
        <PinnedHero
          eyebrow="Design at RMH Studios"
          title={
            <>
              Liquid <span className="text-site-accent">Glass.</span>
            </>
          }
          subtitle="Not a skin. A material. Every surface here is built from one physically-plausible glass — it refracts what is behind it, reflects the light you bring, and moves like something poured, not painted."
          scrollCue="What makes it liquid"
          actions={
            <>
              <a className="sec-btn sec-btn--primary" href="/liquid-glass">
                Explore the design lab
                <ArrowRight aria-hidden="true" />
              </a>
              <a className="sec-btn sec-btn--ghost" href="/studio/themes">
                Open the theme studio
                <ArrowRight aria-hidden="true" />
              </a>
            </>
          }
        />

      <section className="sec-section sec-statement" aria-labelledby="lg-statement-title">
        <div className="sec-shell">
          <h2 id="lg-statement-title" className="sec-statement__text sec-reveal">
            Most “glassmorphism” is fog on plastic. Ours has thickness, a light source, and
            surface tension.
          </h2>
        </div>
      </section>

      <section className="sec-section sec-section--hair" aria-labelledby="lg-pillars-title">
        <div className="sec-shell">
          <div className="sec-section__head">
            <h2 id="lg-pillars-title" className="sec-section__title sec-reveal">
              What makes it liquid
            </h2>
            <p className="sec-section__sub sec-reveal">
              Six behaviors, one material — live on every page you visit.
            </p>
          </div>
          <div className="sec-grid">
            {PILLARS.map((pillar, i) => {
              const Icon = pillar.icon;
              return (
                <article
                  key={pillar.title}
                  className="sec-card sec-reveal"
                  style={{ '--sec-delay': `${(i % 3) * 80}ms` } as CSSProperties}
                >
                  <span className="sec-card__icon">
                    <Icon aria-hidden="true" />
                  </span>
                  <h3 className="sec-card__title">{pillar.title}</h3>
                  <p className="sec-card__body">{pillar.body}</p>
                  <p className="sec-card__tag">{pillar.tag}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="sec-section sec-section--hair" aria-labelledby="lg-tiers-title">
        <div className="sec-shell">
          <div className="sec-section__head">
            <h2 id="lg-tiers-title" className="sec-section__title sec-reveal">
              Rendered to your hardware
            </h2>
            <p className="sec-section__sub sec-reveal">
              The material adapts to what your device and your preferences allow — never the
              other way around.
            </p>
          </div>
          <div className="sec-grid">
            {TIERS.map((tier, i) => {
              const Icon = tier.icon;
              return (
                <article
                  key={tier.title}
                  className="sec-card sec-reveal"
                  style={{ '--sec-delay': `${(i % 3) * 80}ms` } as CSSProperties}
                >
                  <span className="sec-card__icon">
                    <Icon aria-hidden="true" />
                  </span>
                  <h3 className="sec-card__title">{tier.title}</h3>
                  <p className="sec-card__body">{tier.body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="sec-section" aria-labelledby="lg-cta-title">
        <div className="sec-shell">
          <div className="sec-section__head">
            <h2 id="lg-cta-title" className="sec-section__title sec-reveal">
              See it. Then make it yours.
            </h2>
            <p className="sec-section__sub sec-reveal">
              The design lab shows every optic live — refraction on and off, the light, the
              morph — and the theme studio turns the same material into something only you ship.
            </p>
          </div>
          <div className="sec-reveal" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <a className="sec-btn sec-btn--primary" href="/liquid-glass">
              Explore the design lab
              <ArrowRight aria-hidden="true" />
            </a>
            <a className="sec-btn sec-btn--ghost" href="/studio/themes">
              Open the theme studio
              <ArrowRight aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
      </main>
    </div>
  );
}
