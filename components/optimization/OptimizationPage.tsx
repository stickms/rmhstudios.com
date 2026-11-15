// Reuse the security page's liquid-glass "store style" design system verbatim
// so the two standalone pages are visually identical (same `sec-*` classes).
import '@/components/security/security.css';
import { OptimizationNav } from './OptimizationNav';
import { OptimizationHero } from './OptimizationHero';
import { OptimizationRuntimeSections } from './OptimizationRuntimeSections';
import { OptimizationResultSections } from './OptimizationResultSections';
import { OptimizationClosingSections } from './OptimizationClosingSections';
import { OptimizationFooter } from './OptimizationFooter';
import { useScrollReveal } from './useScrollReveal';

/**
 * /optimization — a standalone page describing how RMH Studios makes the app
 * fast, from runtime to build/deploy. Every number below is real and measured:
 * the runtime wins come from the shipped router config + perf commits, and the
 * build/deploy figures come from the profiled audits in docs/opti/*.
 *
 * Shares SecurityPage's design system and its progressive-enhancement motion
 * model (content renders visible server-side; scroll-reveal only enhances for
 * visitors who haven't asked for reduced motion).
 */

export function OptimizationPage() {
  const pageRef =
    useScrollReveal();

  return (
    <div
      className="sec-page"
      ref={
        pageRef
      }
    >
      <a
        className="sec-skip"
        href="#opt-main"
      >
        Skip
        to
        content
      </a>

      <OptimizationNav />

      <main id="opt-main">
        <OptimizationHero />
        <OptimizationRuntimeSections />
        <OptimizationResultSections />
        <OptimizationClosingSections />
      </main>

      <OptimizationFooter />
    </div>
  );
}

export default OptimizationPage;
