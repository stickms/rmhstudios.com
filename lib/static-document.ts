/**
 * Static documents: pages whose first load ships no JavaScript.
 *
 * A route opts in with `staticData: { staticDocument: true }`. When the server
 * renders such a route as the document (a first load, a reload, a link from
 * another site), the root drops everything that boots the client app: the
 * entry module, its modulepreloads and the router's `<Scripts />` (the
 * hydration bootstrap, the dehydrated state and scroll restoration). The inline
 * pre-paint script and the JSON-LD stay, so the page keeps its edition, its
 * locale direction and its structured data. Links are plain `<a href>`, so
 * leaving the page is an ordinary navigation into the full app.
 *
 * Reaching the same route by client-side navigation is unchanged: the app is
 * already running and renders it like any other page.
 *
 * Only a page that reads the same with scripting off may opt in: no control
 * that needs a handler, no content fetched after mount. Two small inline
 * scripts the router writes into the stream (scroll restoration and its
 * dehydrated state, about 2 KB) stay; without the app they do nothing.
 * testing/integration/static-documents.test.ts finds every opted-in route,
 * fetches it from the built server and fails on any module script or
 * modulepreload.
 */
import { useMatches } from '@tanstack/react-router';

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** Server-render this route as a document with no client JavaScript (lib/static-document.ts). */
    staticDocument?: boolean;
  }
}

/** True while the matched routes include a static document. */
export function useIsStaticDocument(): boolean {
  return useMatches({
    select: (matches) => matches.some((m) => m.staticData?.staticDocument === true),
  });
}
