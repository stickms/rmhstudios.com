/**
 * Hold a client navigation until a route's own stylesheet has loaded.
 *
 * A route that links its sheet from `head()` (`import css from './x.css?url'`) gets a plain
 * `<link rel="stylesheet">` that does not gate React's commit: on a client navigation the new page
 * renders and paints a frame (or several, on a slow link) before the sheet arrives, so it flashes
 * unstyled and then snaps into place. Awaiting this from the route's `loader` keeps the old page on
 * screen until the sheet is ready, so the new page's first paint is already styled. The router's
 * own pending component takes over if that is slow (`RoutePending`, 400 ms).
 *
 * Client-only: on the server (and on a hard load, where the link is in the HTML and blocks paint)
 * it resolves at once. It never rejects, and gives up after {@link TIMEOUT_MS} so a stalled
 * request can delay a page but never hold it.
 */
const TIMEOUT_MS = 4000;

export function awaitStylesheet(href: string): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();

  let link: HTMLLinkElement | undefined;
  for (const el of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    if (el.getAttribute('href') === href) {
      link = el;
      break;
    }
  }
  // `.sheet` is set once the stylesheet has been fetched and parsed.
  if (link?.sheet) return Promise.resolve();

  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  const el = link;
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      el.removeEventListener('load', done);
      el.removeEventListener('error', done);
      resolve();
    };
    const timer = setTimeout(done, TIMEOUT_MS);
    el.addEventListener('load', done);
    el.addEventListener('error', done);
  });
}
