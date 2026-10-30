/**
 * /tf2/play — TF2's main menu (menus/Tf2MainMenu: the HUD's mainmenuoverride.res, Find a Game, Offline
 * practice, Items, Options, HUD, the console, Quit) inside the TF2 Hub's shell, and the running game in a
 * full-viewport layer over it. `?lobby=CODE` (an invite link) joins
 * that player's peer-to-peer game as soon as the page is up and the visitor is signed in (online play needs an account; the
 * lobby's sign-in prompt keeps the invite through the login detour). `?hud=draft:<id>|cloud:<id>|share:<token>|default`
 * (the HUD editor's "Test in game") makes that HUD the one the game draws.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useLobbyInviteJoin } from '@/hooks/useLobbyLink';
import { useSession } from '@/components/Providers';
import { createTf2Client, type Tf2Session } from '@/lib/tf2-game/client/tf2-client';
import { findTf2Map } from '@/lib/tf2-game/data/maps';
import { HUD_PARAM, parseSelection } from '@/lib/tf2-game/client/custom-hud/selection';
import { useHudChoice } from './custom-hud/hud-choice';
import GameCanvas from './GameCanvas';
import Tf2MainMenu from './menus/Tf2MainMenu';

export default function Tf2PlayPage() {
  const { t } = useTranslation('c-tf2-game');
  const [session, setSession] = useState<Tf2Session | null>(null);
  const [run, setRun] = useState(0);

  const { data: auth } = useSession();
  const signedIn = !!(auth as { user?: { id?: string | null } } | null)?.user?.id;
  useLobbyInviteJoin(signedIn, (code) => setSession({ kind: 'p2p-join', code }));

  // The HUD editor's "Test in game": use that HUD (validated; a HUD is data), then drop the param.
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const hudParam = search[HUD_PARAM];
  useEffect(() => {
    if (hudParam === undefined) return;
    const sel = parseSelection(hudParam);
    const choice = useHudChoice.getState();
    choice.init();
    if (sel) {
      void choice.choose(sel).then((ok) => {
        const name = useHudChoice.getState().active?.hud.meta.name;
        if (ok && name)
          toast.success(
            t('hud_ready', {
              defaultValue: '{{name}} is ready: start a match to play with it',
              name,
            }),
          );
        else if (!ok)
          toast.error(
            t('hud_handoff_failed', {
              defaultValue: 'That HUD could not be loaded. The game keeps its current HUD.',
            }),
          );
      });
    } else {
      toast.error(t('hud_handoff_invalid', { defaultValue: 'That HUD link is not valid.' }));
    }
    void navigate({
      search: ((prev: Record<string, unknown>) => ({ ...prev, [HUD_PARAM]: undefined })) as never,
      replace: true,
    });
  }, [hudParam, navigate, t]);

  const start = useCallback((s: Tf2Session) => {
    setRun((n) => n + 1);
    setSession(s);
  }, []);
  const leave = useCallback(() => setSession(null), []);

  const title =
    session?.kind === 'offline'
      ? (findTf2Map(session.map)?.title ?? session.map)
      : session?.kind === 'p2p-host'
        ? (findTf2Map(session.room.map)?.title ?? session.room.map)
        : t('play_joining', { defaultValue: 'Joining server' });

  return (
    <>
      <Tf2MainMenu onStart={start} active={!session} />
      {session ? (
        <div className="tf2g-play-layer" key={run}>
          <GameCanvas
            game="tf2"
            sessionId="rmh-tf2-hud"
            title={title}
            create={(mount) => createTf2Client({ ...mount, session })}
            onExit={leave}
          />
        </div>
      ) : null}
    </>
  );
}
