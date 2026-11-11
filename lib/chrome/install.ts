/**
 * Loads the chrome renderer at idle, and only on a page that has a chrome element
 * (Steel 4.3 V4, B1). This file is the only part of lib/chrome on the critical path: the
 * renderer itself is a separate chunk. Components never import either.
 */
interface RouterLike {
  subscribe: (event: 'onResolved', fn: () => void) => unknown;
}

function atIdle(fn: () => void): void {
  const idle = (window as { requestIdleCallback?: Window['requestIdleCallback'] })
    .requestIdleCallback;
  if (idle) idle.call(window, fn, { timeout: 2000 });
  else setTimeout(fn, 200);
}

export function installChrome(router: RouterLike): void {
  const check = () =>
    atIdle(() => {
      if (!document.querySelector('[data-chrome]')) return;
      void import('./index').then((chrome) => {
        // V8: a route change is a content change.
        if (chrome.startChrome()) chrome.refreshChrome();
      });
    });
  check();
  router.subscribe('onResolved', check);
}
