import { createFileRoute, Outlet } from '@tanstack/react-router';

/** Temple of Joy layout — game canvas uses "Cormorant Garamond"; font link
 *  moved to head(), layout is a pure Outlet passthrough. */
export const Route = createFileRoute('/temple-of-joy')({
  head: () => ({
    links: [
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&display=swap' },
    ],
  }),
  component: () => <Outlet />,
});
