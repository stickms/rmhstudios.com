import { createFileRoute, Outlet } from '@tanstack/react-router';

/** Kowloon Knockout layout — the game canvas uses "Press Start 2P"; the font
 *  link now lives in head() and the layout is a pure Outlet passthrough. */
export const Route = createFileRoute('/kowloon-knockout')({
  head: () => ({
    links: [
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap' },
    ],
  }),
  component: () => <Outlet />,
});
