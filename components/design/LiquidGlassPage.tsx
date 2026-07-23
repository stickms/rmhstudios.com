'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { ArrowRight, ChevronLeft, Circle, Grid2X2, Move3D } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Public design-system story. The legacy export name remains internal-only so
 * the route can stay stable while the page itself is completely redesigned.
 */
export function LiquidGlassPage() {
  const { t } = useTranslation('site');
  const pageRef = useRef<HTMLDivElement>(null);

  const principles = [
    {
      icon: Circle,
      number: '01',
      title: t('spatial-principle-focus-title', { defaultValue: 'Content is the interface.' }),
      body: t('spatial-principle-focus-body', {
        defaultValue:
          'Every screen begins with what people came to do. Navigation recedes, hierarchy sharpens, and empty space becomes useful structure.',
      }),
    },
    {
      icon: Grid2X2,
      number: '02',
      title: t('spatial-principle-system-title', { defaultValue: 'One system, everywhere.' }),
      body: t('spatial-principle-system-body', {
        defaultValue:
          'Games, tools, community, and commerce share the same proportions, typography, controls, and interaction logic.',
      }),
    },
    {
      icon: Move3D,
      number: '03',
      title: t('spatial-principle-motion-title', { defaultValue: 'Depth without noise.' }),
      body: t('spatial-principle-motion-body', {
        defaultValue:
          'Motion clarifies relationships. Quiet parallax, route continuity, and precise state changes make the platform feel physical—not busy.',
      }),
    },
  ];

  useEffect(() => {
    const page = pageRef.current;
    if (!page || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    page.dataset.animate = '';
    const elements = Array.from(page.querySelectorAll<HTMLElement>('[data-spatial-reveal]'));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target as HTMLElement;
          target.dataset.visible = '';
          observer.unobserve(target);
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -7% 0px' },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={pageRef} className="spatial-design-page">
      <a className="sr-only focus:not-sr-only" href="#spatial-design-main">
        {t('skip-to-content', { defaultValue: 'Skip to content' })}
      </a>

      <header className="spatial-design-nav">
        <a href="/" className="spatial-design-nav__brand">
          <ChevronLeft aria-hidden />
          <span>{t('rmh-studios', { defaultValue: 'RMH Studios' })}</span>
        </a>
        <p>{t('spatial-system-name', { defaultValue: 'Spatial system / 01' })}</p>
        <a href="/settings/appearance" className="spatial-design-nav__action">
          {t('make-it-yours', { defaultValue: 'Make it yours' })}
          <ArrowRight aria-hidden />
        </a>
      </header>

      <main id="spatial-design-main">
        <section className="spatial-design-hero">
          <div aria-hidden className="spatial-design-hero__art">
            <span />
          </div>
          <div className="spatial-design-hero__copy">
            <p className="spatial-design-kicker">
              {t('design-at-rmh', { defaultValue: 'Design at RMH Studios' })}
            </p>
            <h1>{t('spatial-minimalism', { defaultValue: 'Spatial minimalism.' })}</h1>
            <p className="spatial-design-hero__lede">
              {t('spatial-design-lede', {
                defaultValue:
                  'A quieter foundation for an ambitious platform. Paper, ink, proportion, and motion—nothing without a reason.',
              })}
            </p>
          </div>
          <p className="spatial-design-hero__index" aria-hidden>
            01 — 03
          </p>
        </section>

        <section className="spatial-design-statement" aria-labelledby="design-statement">
          <p className="spatial-design-kicker">
            {t('new-foundation', { defaultValue: 'The new foundation' })}
          </p>
          <h2 id="design-statement" data-spatial-reveal>
            {t('design-statement', {
              defaultValue:
                'Simple does not mean empty. It means every remaining detail carries more weight.',
            })}
          </h2>
        </section>

        <section className="spatial-design-principles" aria-labelledby="design-principles">
          <div className="spatial-design-section-head">
            <p className="spatial-design-kicker">
              {t('operating-principles', { defaultValue: 'Operating principles' })}
            </p>
            <h2 id="design-principles">
              {t('three-rules', { defaultValue: 'Three rules. Every surface.' })}
            </h2>
          </div>

          <div className="spatial-design-principles__grid">
            {principles.map((principle, index) => {
              const Icon = principle.icon;
              return (
                <article
                  key={principle.number}
                  data-spatial-reveal
                  style={{ '--spatial-delay': `${index * 90}ms` } as CSSProperties}
                >
                  <div>
                    <span>{principle.number}</span>
                    <Icon aria-hidden />
                  </div>
                  <h3>{principle.title}</h3>
                  <p>{principle.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="spatial-design-cta" data-spatial-reveal>
          <p className="spatial-design-kicker">
            {t('built-for-everyone', { defaultValue: 'Built for everyone' })}
          </p>
          <h2>{t('design-cta', { defaultValue: 'Quiet by default. Yours by choice.' })}</h2>
          <p>
            {t('design-cta-body', {
              defaultValue:
                'Choose a paper or ink palette, adjust type and density, and reduce motion whenever you want.',
            })}
          </p>
          <a href="/settings/appearance">
            {t('open-appearance', { defaultValue: 'Open appearance settings' })}
            <ArrowRight aria-hidden />
          </a>
        </section>
      </main>

      <footer className="spatial-design-footer">
        <span>{t('rmh-studios', { defaultValue: 'RMH Studios' })}</span>
        <span>{t('spatial-system-version', { defaultValue: 'Spatial system / 2026' })}</span>
      </footer>
    </div>
  );
}
