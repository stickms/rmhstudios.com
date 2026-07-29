import { createFileRoute, Outlet } from '@tanstack/react-router';

/**
 * Temple of Joy shell.
 *
 * The display face is declared in the document head rather than as a `<link>`
 * in the component body: a stylesheet link rendered mid-body is only honoured
 * by some engines, and even where it works the font arrives after first paint,
 * so the title visibly swaps face in front of the player. `preconnect` opens
 * the connection while the route chunk is still downloading, and the weight
 * list is trimmed to the four the game actually sets.
 */
export const Route = createFileRoute('/temple-of-joy')({
  head: () => ({
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&display=swap',
      },
    ],
  }),
  component: () => <Outlet />,
});
