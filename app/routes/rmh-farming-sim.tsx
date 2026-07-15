import { createFileRoute, Outlet } from '@tanstack/react-router';

/** RMH Farming Sim layout — game canvas uses "Press Start 2P"; font link moved
 *  to head(), layout is a pure Outlet passthrough. */
export const Route = createFileRoute('/rmh-farming-sim')({
  head: () => ({
    links: [
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap' },
    ],
  }),
  component: () => <Outlet />,
});
