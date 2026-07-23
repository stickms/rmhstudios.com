import { createFileRoute, Outlet } from '@tanstack/react-router';

/**
 * Passthrough layout for the developer area. Each child owns its own shell:
 * the keys dashboard (`index`) renders `PageLayout`, and the docs wiki
 * (`docs/route.tsx`) renders its own `AnimatedMain` + `ContextRail`. Wrapping a
 * shell here as well would double-wrap the reading column for `index`.
 */
export const Route = createFileRoute('/_site/developer')({
  component: () => <Outlet />,
});
