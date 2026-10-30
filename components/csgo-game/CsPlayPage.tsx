/**
 * /csgo — Counter-Strike: Global Offensive on Dust II: a lobby (bomb defusal or deathmatch; offline against bots;
 * host a peer-to-peer match for friends; the CS rooms players host; join by code) and the running
 * game in the shared GameCanvas, full screen over it. Online play needs an account (the hub refuses
 * otherwise); `?lobby=CODE` joins that room once signed in. A page of its own in the TF2 Hub's
 * palette (AppShell `tf2hud-theme`): the document scrolls.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bot, Globe, KeyRound, LogIn, RefreshCw, Server } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import AppShell from '@/components/shared/AppShell';
import GameCanvas from '@/components/tf2-game/GameCanvas';
import { useSession } from '@/components/Providers';
import { useLobbyInviteJoin } from '@/hooks/useLobbyLink';
import { lobbyReturnPath } from '@/lib/lobby-link';
import { CSGO_MAPS } from '@/lib/tf2-game/assets/game-maps';
import { createTf2Client, type Tf2Session } from '@/lib/tf2-game/client/tf2-client';
import { BOT_DIFFICULTIES, TF2_LIMITS, TF2_ROOM_CODE_RE, type BotDifficulty, type CsRoomMode, type RoomListEntry } from '@/lib/tf2-game/net/events';
import '@/components/tf2-game/play.css';

const MAP = CSGO_MAPS[0]?.name ?? 'de_dust2';
/** 5 v 5 with bots filling the teams (offline), 10 players in a hosted room. */
const OFFLINE_BOTS = 9;
const ROOM_PLAYERS = 10;

export default function CsPlayPage() {
  const { t } = useTranslation('c-tf2-game');
  const { data: auth } = useSession();
  const user = (auth as { user?: { id?: string | null; name?: string | null } } | null)?.user;
  const signedIn = !!user?.id;
  const accountName = user?.name || 'Player';
  const [mode, setMode] = useState<CsRoomMode>('de');
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal');
  const [session, setSession] = useState<Tf2Session | null>(null);
  const [run, setRun] = useState(0);

  const start = useCallback((s: Tf2Session) => {
    setRun((n) => n + 1);
    setSession(s);
  }, []);
  const leave = useCallback(() => setSession(null), []);
  useLobbyInviteJoin(signedIn, (code) => start({ kind: 'p2p-join', code, game: 'csgo' }));

  const difficultyLabel = (d: BotDifficulty) =>
    ({
      easy: t('play_difficulty_easy', { defaultValue: 'Easy' }),
      normal: t('play_difficulty_normal', { defaultValue: 'Normal' }),
      hard: t('play_difficulty_hard', { defaultValue: 'Hard' }),
      expert: t('play_difficulty_expert', { defaultValue: 'Expert' }),
    })[d];
  const modeLabel = (m: CsRoomMode) =>
    m === 'dm' ? t('cs_mode_dm', { defaultValue: 'Deathmatch' }) : t('cs_mode_de', { defaultValue: 'Bomb defusal' });

  return (
    <AppShell appClassName="tf2hud-theme">
      <main className="app-page min-h-dvh bg-(--app-bg) text-(--app-text)">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pr-[calc(1rem_+_var(--safe-right,0px))] pb-16 pl-[calc(1rem_+_var(--safe-left,0px))] pt-[calc(var(--safe-top,0px)+1rem)]">
          <Link to="/games" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-(--app-text-muted) hover:text-(--app-text)">
            <ArrowLeft className="size-4 rtl-flip" aria-hidden />
            {t('play_back_games', { defaultValue: 'Games' })}
          </Link>
          <header>
            <h1 className="tf2hud-title text-4xl sm:text-5xl">{t('csgo_title', { defaultValue: 'Counter-Strike: Global Offensive' })}</h1>
            <p className="mt-2 text-sm text-(--app-text-muted)">
              {t('cs_subtitle', { defaultValue: 'Default loadouts, plain weapons, one map. Bomb defusal or deathmatch.' })}
            </p>
          </header>

          <section className="grid gap-3 rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle) p-5" aria-labelledby="cs-mode">
            <h2 id="cs-mode" className="text-xs font-semibold uppercase tracking-widest text-(--app-text-dim)">
              {t('cs_mode', { defaultValue: 'Mode' })}
            </h2>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="cs-mode">
              {(['de', 'dm'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={mode === m ? 'tf2g-play-button' : 'tf2g-play-button tf2g-play-button-quiet'}
                >
                  {modeLabel(m)}
                </button>
              ))}
            </div>
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <section className="grid content-start gap-3 rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle) p-5" aria-labelledby="cs-offline">
              <h2 id="cs-offline" className="flex items-center gap-2 text-lg font-semibold">
                <Bot className="size-5" aria-hidden />
                {t('cs_offline', { defaultValue: 'Practice against bots' })}
              </h2>
              <label className="grid gap-1 text-sm">
                <span className="text-(--app-text-muted)">{t('play_difficulty', { defaultValue: 'Difficulty' })}</span>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as BotDifficulty)}
                  className="min-h-11 rounded-(--app-radius-sm) border border-(--app-border) bg-(--app-bg) px-3"
                >
                  {BOT_DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {difficultyLabel(d)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="tf2g-play-button w-fit"
                onClick={() =>
                  start({ kind: 'offline', game: 'csgo', mode, map: MAP, botCount: OFFLINE_BOTS, difficulty, maxPlayers: OFFLINE_BOTS + 1, playerName: accountName })
                }
              >
                {t('cs_play_offline', { defaultValue: 'Play offline' })}
              </button>
            </section>

            <section className="grid content-start gap-3 rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle) p-5" aria-labelledby="cs-host">
              <h2 id="cs-host" className="flex items-center gap-2 text-lg font-semibold">
                <Server className="size-5" aria-hidden />
                {t('cs_host', { defaultValue: 'Host a game' })}
              </h2>
              <p className="text-sm text-(--app-text-muted)">
                {t('cs_host_body', { defaultValue: 'The match runs in your browser and friends connect to you directly. Bots fill the empty seats.' })}
              </p>
              {signedIn ? (
                <button
                  type="button"
                  className="tf2g-play-button w-fit"
                  onClick={() =>
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
                    })
                  }
                >
                  {t('cs_host_start', { defaultValue: 'Host the game' })}
                </button>
              ) : (
                <SignIn />
              )}
            </section>
          </div>

          <CsRooms signedIn={signedIn} onJoin={(code) => start({ kind: 'p2p-join', code, game: 'csgo' })} modeLabel={modeLabel} />
        </div>
      </main>
      {session ? (
        <div className="tf2g-play-layer" key={run}>
          <GameCanvas
            game="csgo"
            sessionId="rmh-csgo"
            title={t('csgo_title', { defaultValue: 'Counter-Strike: Global Offensive' })}
            create={(mount) => createTf2Client({ ...mount, session })}
            onExit={leave}
          />
        </div>
      ) : null}
    </AppShell>
  );
}

function SignIn() {
  const { t } = useTranslation('c-tf2-game');
  return (
    <Link
      to="/login"
      search={{ callbackURL: lobbyReturnPath('/csgo', null) }}
      className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-(--app-radius-sm) border border-(--app-border-bright) px-3 text-sm font-semibold hover:bg-(--app-surface-hover)"
    >
      <LogIn className="size-4" aria-hidden />
      {t('mp_sign_in', { defaultValue: 'Sign in to play online' })}
    </Link>
  );
}

/** The CS rooms players host (the hub's browser, CS:GO only), and join by code. */
function CsRooms({ signedIn, onJoin, modeLabel }: { signedIn: boolean; onJoin: (code: string) => void; modeLabel: (m: CsRoomMode) => string }) {
  const { t } = useTranslation('c-tf2-game');
  const [rooms, setRooms] = useState<RoomListEntry[] | null>(null);
  const [code, setCode] = useState('');
  const [net, setNet] = useState<typeof import('@/lib/tf2-game/net/client') | null>(null);

  useEffect(() => {
    let alive = true;
    let remove: (() => void) | undefined;
    void import('@/lib/tf2-game/net/client').then(async (m) => {
      if (!alive) return;
      setNet(m);
      remove = m.addTf2Handlers({
        onStatus: (s) => s === 'connected' && m.tf2.listRooms(0, 'csgo'),
        onRooms: (page) => alive && setRooms(page.rooms.filter((r) => r.game === 'csgo')),
      });
      try {
        await m.connectTf2();
        m.tf2.listRooms(0, 'csgo');
      } catch {
        if (alive) setRooms([]);
      }
    });
    return () => {
      alive = false;
      remove?.();
    };
  }, []);

  const valid = TF2_ROOM_CODE_RE.test(code.trim().toUpperCase());
  return (
    <section className="grid gap-3 rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle) p-5" aria-labelledby="cs-rooms">
      <div className="flex items-center gap-2">
        <h2 id="cs-rooms" className="flex items-center gap-2 text-lg font-semibold">
          <Globe className="size-5" aria-hidden />
          {t('cs_rooms', { defaultValue: 'Games to join' })}
        </h2>
        <button
          type="button"
          className="ms-auto inline-flex min-h-11 items-center gap-1.5 px-2 text-sm text-(--app-text-muted) hover:text-(--app-text)"
          onClick={() => net?.tf2.listRooms(0, 'csgo')}
        >
          <RefreshCw className="size-4" aria-hidden />
          {t('play_refresh', { defaultValue: 'Refresh' })}
        </button>
      </div>
      {rooms === null ? (
        <p className="text-sm text-(--app-text-muted)">{t('play_status_connecting', { defaultValue: 'Connecting…' })}</p>
      ) : rooms.length === 0 ? (
        <p className="text-sm text-(--app-text-muted)">{t('cs_rooms_empty', { defaultValue: 'Nobody is hosting right now. Host a game, or practise offline.' })}</p>
      ) : (
        <ul className="grid gap-2">
          {rooms.map((r) => (
            <li key={r.code} className="flex flex-wrap items-center gap-3 rounded-(--app-radius-sm) border border-(--app-border) bg-(--app-bg) px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{r.name || r.code}</span>
                <span className="block text-xs text-(--app-text-muted)">
                  {modeLabel(r.mode === 'dm' ? 'dm' : 'de')} · {t('play_room_players', { defaultValue: '{{n}}/{{max}}', n: r.players, max: r.maxPlayers })}
                  {r.host ? ` · ${t('browser_hosted_by_name', { defaultValue: 'Hosted by {{name}}', name: r.host })}` : ''}
                </span>
              </span>
              {signedIn ? (
                <button type="button" className="tf2g-play-button" disabled={r.players >= r.maxPlayers} onClick={() => onJoin(r.code)}>
                  {t('play_join', { defaultValue: 'Join' })}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap items-end gap-2 border-t border-(--app-border) pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && signedIn) onJoin(code.trim().toUpperCase());
        }}
      >
        <label className="grid min-w-40 flex-1 gap-1 text-sm">
          <span className="text-(--app-text-muted)">{t('play_code', { defaultValue: 'Join by code' })}</span>
          <input
            value={code}
            maxLength={TF2_LIMITS.ROOM_CODE_LENGTH}
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={t('play_code_placeholder', { defaultValue: 'ABC234' })}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="min-h-11 rounded-(--app-radius-sm) border border-(--app-border) bg-(--app-bg) px-3 text-base"
          />
        </label>
        {signedIn ? (
          <button type="submit" className="tf2g-play-button" disabled={!valid}>
            <KeyRound className="size-4" aria-hidden />
            {t('play_join', { defaultValue: 'Join' })}
          </button>
        ) : (
          <SignIn />
        )}
      </form>
    </section>
  );
}
