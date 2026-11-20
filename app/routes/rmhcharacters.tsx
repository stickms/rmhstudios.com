/**
 * RMHCharacters route: palette shell + the client-only app.
 *
 * Sign-in is required (characters are saved to the account), but it is enforced inside the app,
 * not by a server redirect: a redirect sends every signed-out request to /login, and link-preview
 * crawlers are always signed out, so a pasted /rmhcharacters unfurled as the generic login card.
 * Rendering the page for everyone lets the head below (title, description, the app's OG card)
 * reach them; a signed-out visitor sees a sign-in screen instead of the roster, and the character
 * endpoints refuse them on their own (401).
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
