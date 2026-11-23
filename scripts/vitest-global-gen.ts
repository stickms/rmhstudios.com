/**
 * Vitest global setup: bring the untracked generated modules up to date before any test
 * imports them (`app/routeTree.gen.ts`, `lib/prepaint/generated.ts`). They are not in git
 * (see `.gitignore`), so after a merge or a checkout they can be missing or behind the
 * sources. Both writers leave a current file alone.
 */
import { writePrepaint } from './build-prepaint';
import { generateRouteTree } from './gen-route-tree';

export default async function setup(): Promise<void> {
  await Promise.all([generateRouteTree(), writePrepaint()]);
}
