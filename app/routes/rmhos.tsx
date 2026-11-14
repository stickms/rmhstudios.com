/**
 * rmhOS route: auth gate + palette shell. The page itself is client-only (v86 and a canvas).
 * The router matches paths case-insensitively, so /rmhOS and /RMHOS land here too.
 */
import { ClientOnly, createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { appRouteHead } from '@/lib/seo-catalog';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import RmhosShell from '@features/rmhos/ui/RmhosShell';
import RmhosApp from '@features/rmhos/ui/RmhosApp';
import rmhosCss from '@features/rmhos/ui/rmhos.css?url';

// Start splits the route component into its own chunk, and v86 is a dynamic import inside
// features/rmhos/engine/vm.ts, so the emulator ships only when /rmhos runs the machine.
const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhos' } });
  return { user: session.user };
});

function RmhosPage() {
  return (
    <RmhosShell>
      <GameErrorBoundary gameName="rmhOS">
        <ClientOnly
          fallback={
            <GameLoadingFallback background="var(--app-bg)" foreground="var(--app-accent)" />
          }
        >
          <RmhosApp />
        </ClientOnly>
      </GameErrorBoundary>
    </RmhosShell>
  );
}

export const Route = createFileRoute('/rmhos')({
  beforeLoad: () => checkAuth(),
  head: () => appRouteHead('rmhos', { links: [{ rel: 'stylesheet', href: rmhosCss }] }),
  component: RmhosPage,
});
