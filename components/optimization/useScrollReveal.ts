import { useEffect, useRef } from 'react';

/**
 * Progressive-enhancement scroll reveal: content renders visible server-side;
 * once mounted, `.sec-reveal` nodes fade in as they enter the viewport.
 */
export function useScrollReveal() {
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page || typeof IntersectionObserver === 'undefined') return;

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
  return pageRef;
}
