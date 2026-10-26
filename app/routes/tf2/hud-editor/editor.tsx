/**
 * The editor. `?draft=<id>` restores a local draft, `?hud=<id|slug>` opens a
 * saved HUD (owner edits it; anyone else gets a private fork), and `?fork=<id|slug>`
 * starts a new HUD from a workshop one. No params = a fresh TF2 Default HUD.
 */

import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import Tf2HudEditor from '@/components/tf2-hud/Tf2HudEditor';

interface EditorSearch {
  draft?: string;
  hud?: string;
  fork?: string;
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 && v.length <= 128 ? v : undefined;

export const Route = createFileRoute('/tf2/hud-editor/editor')({
  validateSearch: (search: Record<string, unknown>): EditorSearch => ({
    draft: str(search.draft),
    hud: str(search.hud),
    fork: str(search.fork),
  }),
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: EditorRoute,
});

function EditorRoute() {
  const search = Route.useSearch();
  return (
    <GameErrorBoundary gameName="RMH TF2 HUD Editor">
      <Tf2HudEditor {...search} />
    </GameErrorBoundary>
  );
}
