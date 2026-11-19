/**
 * RMHCharacters route: palette shell + the client-only app. Open to everyone (characters live in
 * the browser); only the advisor asks for an account.
 */
import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { appRouteHead } from '@/lib/seo-catalog';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import RmhCharactersShell from '@features/rmhcharacters/ui/RmhCharactersShell';
import RmhCharactersApp from '@features/rmhcharacters/ui/RmhCharactersApp';
import rmhcharactersCss from '@features/rmhcharacters/ui/rmhcharacters.css?url';

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
  head: () => appRouteHead('rmhcharacters', { links: [{ rel: 'stylesheet', href: rmhcharactersCss }] }),
  component: RmhCharactersPage,
});
