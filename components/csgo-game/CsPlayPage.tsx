/**
 * /csgo — Counter-Strike: Global Offensive on Dust II: the game's main menu in the shape of its
 * Panorama UI (CsMainMenu: practice against bots, host a peer-to-peer match for friends, the CS rooms
 * players host, a code; Options) and the running game in the shared GameCanvas, full screen over it.
 * Online play needs an account (the hub refuses otherwise); `?lobby=CODE` joins that room once signed
 * in.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/shared/AppShell';
import GameCanvas from '@/components/tf2-game/GameCanvas';
import { useSession } from '@/components/Providers';
import { useLobbyInviteJoin } from '@/hooks/useLobbyLink';
import { CSGO_MAPS } from '@/lib/tf2-game/assets/game-maps';
import { loadMenuChannel, type MenuChannel } from '@/lib/tf2-game/client/menus/source-gameui';
import { createTf2Client, type Tf2Session } from '@/lib/tf2-game/client/tf2-client';
import { TF2_LIMITS, type BotDifficulty, type CsRoomMode } from '@/lib/tf2-game/net/events';
import { languageForSite } from '@/lib/tf2-hud/localisation';
import CsLoadingScreen from './CsLoadingScreen';
import CsMainMenu from './CsMainMenu';
import '@/components/tf2-game/play.css';

const MAP = CSGO_MAPS[0]?.name ?? 'de_dust2';
const MAP_TITLE = CSGO_MAPS[0]?.title ?? 'Dust II';
/** 5 v 5 with bots filling the teams (offline), 10 players in a hosted room. */
const OFFLINE_BOTS = 9;
const ROOM_PLAYERS = 10;

export default function CsPlayPage() {
  const { t } = useTranslation('c-tf2-game');
  const { data: auth } = useSession();
  const user = (auth as { user?: { id?: string | null; name?: string | null } } | null)?.user;
  const signedIn = !!user?.id;
  const accountName = user?.name || 'Player';
  const [session, setSession] = useState<Tf2Session | null>(null);
  const [run, setRun] = useState(0);
  const [channel, setChannel] = useState<MenuChannel | null>(null);
  useEffect(() => {
    let alive = true;
    const language = languageForSite(document.documentElement.lang || 'en', () => true);
    void loadMenuChannel('csgo', language).then((c) => alive && setChannel(c));
    return () => {
      alive = false;
    };
  }, []);

  const start = useCallback((s: Tf2Session) => {
    setRun((n) => n + 1);
    setSession(s);
  }, []);
  const leave = useCallback(() => setSession(null), []);
  const modeLabel = (s: Tf2Session) => {
    const mode = s.kind === 'offline' ? s.mode : s.kind === 'p2p-host' ? s.room.mode : null;
    if (mode === 'dm') return t('cs_mode_dm', { defaultValue: 'Deathmatch' });
    if (mode === 'de') return t('cs_mode_de', { defaultValue: 'Bomb defusal' });
    return t('play_joining', { defaultValue: 'Joining server' });
  };
  useLobbyInviteJoin(signedIn, (code) => start({ kind: 'p2p-join', code, game: 'csgo' }));

  const offline = (mode: CsRoomMode, difficulty: BotDifficulty) =>
    start({ kind: 'offline', game: 'csgo', mode, map: MAP, botCount: OFFLINE_BOTS, difficulty, maxPlayers: OFFLINE_BOTS + 1, playerName: accountName });
  const host = (mode: CsRoomMode, difficulty: BotDifficulty) =>
    start({
      kind: 'p2p-host',
      playerName: accountName,
      room: {
        game: 'csgo',
        map: MAP,
        mode,
        maxPlayers: ROOM_PLAYERS,
        botCount: ROOM_PLAYERS - 2,
        botDifficulty: difficulty,
        name: t('play_room_default_name', { defaultValue: '{{name}}’s server', name: accountName }).slice(0, TF2_LIMITS.ROOM_NAME_MAX_LENGTH),
      },
    });

  return (
    <AppShell appClassName="tf2hud-theme">
      <main className="app-viewport">
        <h1 className="sr-only">{t('csgo_title', { defaultValue: 'Counter-Strike: Global Offensive' })}</h1>
        <CsMainMenu
          channel={channel}
          signedIn={signedIn}
          mapName={MAP}
          mapTitle={MAP_TITLE}
          onOffline={offline}
          onHost={host}
          onJoin={(code) => start({ kind: 'p2p-join', code, game: 'csgo' })}
        />
      </main>
      {session ? (
        <div className="tf2g-play-layer" key={run}>
          <GameCanvas
            game="csgo"
            sessionId="rmh-csgo"
            title={t('csgo_title', { defaultValue: 'Counter-Strike: Global Offensive' })}
            create={(mount) => createTf2Client({ ...mount, session })}
            onExit={leave}
            loadingScreen={(view) => (
              <CsLoadingScreen
                channel={channel}
                mapName={MAP}
                mapTitle={MAP_TITLE}
                modeLabel={modeLabel(session)}
                view={view}
              />
            )}
          />
        </div>
      ) : null}
    </AppShell>
  );
}
