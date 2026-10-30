import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { getRequestSession } from '@/lib/auth-session.server';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating (docs/fouc-audit-2026-10-06.md §13).
import BalatroPage from '@/components/balatro/BalatroPage';

/**
 * /balatro — Balatro on LÖVE compiled to WebAssembly.
 *
 * Signed-in only, and kept out of search on purpose: not in the games catalog,
 * excluded from the sitemap (lib/sitemap.ts), disallowed in robots.txt, and
 * `noindex, nofollow` here. The game packs themselves are served only to a
 * session (app/routes/api/balatro/pack.$file.ts).
 */
const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/balatro' } });
  return { userId: session.user.id };
});

function BalatroRoute() {
  return (
    <GameErrorBoundary gameName="Balatro">
      <BalatroPage />
    </GameErrorBoundary>
  );
}

export const Route = createFileRoute('/balatro')({
  beforeLoad: () => checkAuth(),
  head: () => ({
    meta: [
      { title: 'Balatro | RMH Studios' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: BalatroRoute,
});
