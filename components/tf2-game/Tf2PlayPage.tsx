/**
 * /tf2/play — the server browser inside the TF2 Hub's shell, and the running
 * game in a full-viewport layer over it. `?lobby=CODE` (an invite link) joins
 * that room as soon as the page is up.
 */
'use client';

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLobbyInviteJoin } from '@/hooks/useLobbyLink';
import { createTf2Client, type Tf2Session } from '@/lib/tf2-game/client/tf2-client';
import { findTf2Map } from '@/lib/tf2-game/data/maps';
import GameCanvas from './GameCanvas';
import Tf2Lobby from './Tf2Lobby';

export default function Tf2PlayPage() {
  const { t } = useTranslation('c-tf2-game');
  const [session, setSession] = useState<Tf2Session | null>(null);
  const [run, setRun] = useState(0);

  useLobbyInviteJoin(true, (code) => setSession({ kind: 'online-join', code }));

  const start = useCallback((s: Tf2Session) => {
    setRun((n) => n + 1);
    setSession(s);
  }, []);
  const leave = useCallback(() => setSession(null), []);

  const title =
    session?.kind === 'offline'
      ? (findTf2Map(session.map)?.title ?? session.map)
      : session?.kind === 'online-create'
        ? (findTf2Map(session.room.map)?.title ?? session.room.map)
        : t('play_joining', { defaultValue: 'Joining server' });

  return (
    <>
      <Tf2Lobby onStart={start} />
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
