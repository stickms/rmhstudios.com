/**
 * /games — the games library, drawn as Steam draws its own. A top-level route (not
 * under `_site`): it has no site shell, no globe, no glass — a full page with a
 * Steam-style top bar (the RMH Studios mark goes home) and its own palette
 * (`components/steam/steam.css`). The Library tab itself is the pathless layout
 * `games/_library.tsx`; community pages sit beside it, without the list.
 * Native-material route: see `lib/native-material-routes.ts`.
 */

import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { SteamShell } from '@/components/steam/SteamShell';
import steamCss from '@/components/steam/steam.css?url';

export const Route = createFileRoute('/games')({
  head: () => ({ links: [{ rel: 'stylesheet', href: steamCss }] }),
  component: GamesShell,
  notFoundComponent: SteamNotFound,
  errorComponent: SteamError,
});

function GamesShell() {
  return (
    <SteamShell>
      <Outlet />
    </SteamShell>
  );
}

/** A missing title or page, inside the Steam frame rather than the site's 404 card. */
function SteamNotFound() {
  const { t } = useTranslation('games-hub');
  return (
    <SteamShell>
      <div className="stm-main" style={{ padding: '48px 24px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 400, margin: 0 }}>
          {t('steam-not-found', { defaultValue: 'That page is not in the library.' })}
        </h1>
        <p className="stm-muted">
          {t('steam-not-found-hint', { defaultValue: 'It may have moved, or it never existed.' })}
        </p>
        <Link to="/games" className="stm-btn stm-btn-blue">
          {t('steam-back-to-library', { defaultValue: 'Back to the library' })}
        </Link>
      </div>
    </SteamShell>
  );
}

function SteamError({ reset }: { reset: () => void }) {
  const { t } = useTranslation('games-hub');
  return (
    <SteamShell>
      <div className="stm-main" style={{ padding: '48px 24px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 400, margin: 0 }}>
          {t('steam-error', { defaultValue: 'Something went wrong.' })}
        </h1>
        <p className="stm-muted">{t('steam-error-hint', { defaultValue: 'Try again in a moment.' })}</p>
        <button type="button" className="stm-btn stm-btn-blue" onClick={reset}>
          {t('steam-retry', { defaultValue: 'Try again' })}
        </button>
      </div>
    </SteamShell>
  );
}
