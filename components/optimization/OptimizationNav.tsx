import {
  ChevronLeft,
  ArrowRight,
} from 'lucide-react';


export function OptimizationNav() {
  return (
      <header>
        <nav className="glass-chrome sec-nav" aria-label="Optimization">
          <div className="sec-nav__inner">
            <a className="sec-nav__back" href="/">
              <ChevronLeft size={15} strokeWidth={2.2} aria-hidden="true" />
              RMH Studios
            </a>
            <span className="sec-nav__sep" aria-hidden="true">
              /
            </span>
            <span className="sec-nav__title">Speed</span>
            <a className="sec-nav__cta" href="#opt-milestones">
              See the numbers
              <ArrowRight size={14} aria-hidden="true" />
            </a>
          </div>
        </nav>
      </header>
  );
}
