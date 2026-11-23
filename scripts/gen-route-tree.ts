/**
 * Generate `app/routeTree.gen.ts` without starting Vite.
 *
 * The file is not tracked (`.gitignore`): it is a function of `app/routes/`, and when it
 * was committed every PR that added a page edited the same import and `FileRoutesBy*`
 * blocks, so two PRs that each added a route conflicted. Vite's TanStack Start plugin
 * writes it on `vite dev` and `vite build`; this script writes the same bytes for the
 * tools that never start Vite (tsc, eslint, vitest, the docs generator).
 *
 * Same generator version as Start (`@tanstack/router-generator`, pinned to the one
 * `@tanstack/start-plugin-core` depends on) and the same options Start derives from
 * `vite.config.ts`: srcDirectory `app`, routes in `app/routes`.
 *
 *     pnpm gen:routes
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Generator, getConfig } from '@tanstack/router-generator';

/** Writes `app/routeTree.gen.ts` (the generator leaves the file alone when nothing changed). */
export async function generateRouteTree(root: string = process.cwd()): Promise<void> {
  const config = getConfig(
    {
      target: 'react',
      routesDirectory: join(root, 'app', 'routes'),
      generatedRouteTree: join(root, 'app', 'routeTree.gen.ts'),
      // The footer Start's plugin appends (start-plugin-core `route-tree-footer`): it
      // registers this app's router type with Start. app/ has no start.ts, so no `config` line.
      routeTreeFileFooter: [
        "import type { getRouter } from './router.tsx'\nimport type { createStart } from '@tanstack/react-start'\ndeclare module '@tanstack/react-start' {\n  interface Register {\n    ssr: true\n    router: Awaited<ReturnType<typeof getRouter>>\n  }\n}",
      ],
    },
    root,
  );
  await new Generator({ config, root }).run();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await generateRouteTree();
  process.stdout.write('wrote app/routeTree.gen.ts\n');
}
