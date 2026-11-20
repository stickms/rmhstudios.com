/**
 * RMHCharacters route: auth gate + palette shell + the client-only app. Sign-in is required because
 * characters are saved to the account (features/rmhcharacters/engine/store.ts).
 */
import { ClientOnly, createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { appRouteHead } from '@/lib/seo-catalog';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import RmhCharactersShell from '@features/rmhcharacters/ui/RmhCharactersShell';
import RmhCharactersApp from '@features/rmhcharacters/ui/RmhCharactersApp';
import rmhcharactersCss from '@features/rmhcharacters/ui/rmhcharacters.css?url';

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhcharacters' } });
  return { user: session.user };
});

function RmhCharactersPage() {
  return (
    <RmhCharactersShell>
      <GameErrorBoundary gameName="RMHCharacters">
        <ClientOnly fallback={<GameLoadingFallback background="var(--app-bg)" foreground="var(--app-accent)" />}>
          <RmhCharactersApp />
        </ClientOnly>
      </GameErrorBoundary>
    </RmhCharactersShell>
  );
}

export const Route = createFileRoute('/rmhcharacters')({
  beforeLoad: () => checkAuth(),
  head: () => appRouteHead('rmhcharacters', { links: [{ rel: 'stylesheet', href: rmhcharactersCss }] }),
  component: RmhCharactersPage,
});
