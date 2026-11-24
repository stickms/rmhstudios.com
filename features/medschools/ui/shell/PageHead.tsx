import type { ReactNode } from 'react';

/**
 * A page's own heading. The top bar owns the back button and the app name, so a page no longer draws `PageLayout`'s
 * title row (and its duplicate back link); it keeps one `<h1>` (set in the display face by `.medapp-main h1`) and an
 * optional one-line sub. A school page also passes its `crest` (before the name) and its `actions` (after it): the
 * header then lays out as one row that wraps on a phone.
 */
export function PageHead({
  title,
  sub,
  crest,
  actions,
}: {
  title: string;
  sub?: ReactNode;
  crest?: ReactNode;
  actions?: ReactNode;
}) {
  const text = (
    <>
      <h1>{title}</h1>
      {sub ? <p className="medapp-sub">{sub}</p> : null}
    </>
  );
  if (!crest && !actions) return <header className="medapp-pagehead">{text}</header>;
  return (
    <header className="medapp-pagehead medapp-pagehead--school">
      {crest}
      <div className="medapp-pagehead__text">{text}</div>
      {actions ? <div className="medapp-pagehead__actions">{actions}</div> : null}
    </header>
  );
}
