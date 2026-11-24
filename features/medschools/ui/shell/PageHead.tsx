import type { ReactNode } from 'react';

/**
 * A page's own heading. The top bar owns the back button and the app name, so a page no longer draws `PageLayout`'s
 * title row (and its duplicate back link); it keeps one `<h1>` (set in the display face by `.medapp-main h1`) and an
 * optional one-line sub.
 */
export function PageHead({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <header className="medapp-pagehead">
      <h1>{title}</h1>
      {sub ? <p className="medapp-sub">{sub}</p> : null}
    </header>
  );
}
