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
      title: t('spatial-principle-focus-title', { defaultValue: 'Content is the interface.' }),
    },
    {
      icon: Grid2X2,
      title: t('spatial-principle-system-title', { defaultValue: 'One system, everywhere.' }),
    },
    {
      icon: Move3D,
      title: t('spatial-principle-motion-title', { defaultValue: 'Depth without noise.' }),
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
            <h1>{t('spatial-minimalism', { defaultValue: 'Spatial minimalism.' })}</h1>
            <p className="spatial-design-hero__lede">
              {t('spatial-design-lede', {
                defaultValue: 'Space, proportion, and motion—nothing without a reason.',
              })}
            </p>
          </div>
        </section>

        <section className="spatial-design-statement" aria-labelledby="design-statement">
          <h2 id="design-statement" data-spatial-reveal>
            {t('design-statement', {
              defaultValue:
                'Simple does not mean empty. It means every remaining detail carries more weight.',
            })}
          </h2>
        </section>

        <section className="spatial-design-principles" aria-labelledby="design-principles">
          <div className="spatial-design-section-head">
            <h2 id="design-principles">
              {t('three-rules', { defaultValue: 'One language. Every surface.' })}
            </h2>
          </div>

          <div className="spatial-design-principles__grid">
            {principles.map((principle, index) => {
              const Icon = principle.icon;
              return (
                <article
                  key={principle.title}
                  data-spatial-reveal
                  style={{ '--spatial-delay': `${index * 90}ms` } as CSSProperties}
                >
                  <div>
                    <Icon aria-hidden />
                  </div>
                  <h3>{principle.title}</h3>
                </article>
              );
            })}
          </div>
        </section>

        <section className="spatial-design-cta site-inverse" data-spatial-reveal>
          <h2>{t('design-cta', { defaultValue: 'Quiet by default. Yours by choice.' })}</h2>
          <a href="/settings/appearance">
            {t('open-appearance', { defaultValue: 'Appearance' })}
            <ArrowRight aria-hidden />
          </a>
        </section>
      </main>

      <footer className="spatial-design-footer">
        <span>{t('rmh-studios', { defaultValue: 'RMH Studios' })}</span>
      </footer>
    </div>
  );
}
