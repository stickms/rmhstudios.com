/**
 * RMHbox — the history display lookup, WITH its registrations loaded.
 *
 * Import `getHistoryDisplay` from here, not from `./history-display-registry`,
 * in anything that needs the registered configs. The registrations are a
 * side-effect import, and a bare `import '…'` at the top of a route file stays
 * in the route DEFINITION — which `routeTree.gen.ts` imports statically, so it
 * sat in the shared entry chunk of every page (~8 KB, CSS/JS audit 2026-10-09).
 * Tying it to a binding the route's component uses lets the code-splitter move
 * it into that route's lazy chunk with everything else the component needs.
 */

import './history-display-registrations';

export { getHistoryDisplay } from './history-display-registry';
export type { GameLog } from './history-display-registry';
