/**
 * CS:GO's main menu in the shape of its Panorama UI, drawn from the game's own files where the
 * `csgo-menu` channel publishes them (scripts/tf2-game/menu_ui.py): the main menu's background movie
 * (else Dust II's screenshot), Panorama's fonts and its menu icons. A sidebar holds Play, Settings and
 * Quit; Play opens the play panel — the mode (bomb defusal / deathmatch), how to play (practice with
 * bots, host a match for friends, the community games players host, or a code), the map tile and GO —
 * and Settings the Options sheet (the same controls as every game here) in Panorama's colours.
 *
 * The background movie is decoration: muted, hidden from assistive technology, paused by the browser in
 * a hidden tab. Every control is a real button.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Globe, KeyRound, LogIn, Play, Power, RefreshCw, Server, Settings, X } from 'lucide-react';
import { Link, useNavigate } from '@tanstack/react-router';
import { lobbyReturnPath } from '@/lib/lobby-link';
import { menuAssetUrl, type MenuChannel } from '@/lib/tf2-game/client/menus/source-gameui';
import { loadSettings, saveSettings, type GameSettings } from '@/lib/tf2-game/client/settings';
import { BOT_DIFFICULTIES, TF2_LIMITS, TF2_ROOM_CODE_RE, type BotDifficulty, type CsRoomMode, type RoomListEntry } from '@/lib/tf2-game/net/events';
import { cn } from '@/lib/utils';
import OptionsDialog from '../tf2-game/menus/OptionsDialog';
import { useMenuSource } from '../tf2-game/menus/use-menu-source';
import './cs-menu.css';

export type CsPlaySource = 'offline' | 'host' | 'browse';

export interface CsMainMenuProps {
  channel: MenuChannel | null;
  signedIn: boolean;
  mapName: string;
  mapTitle: string;
  onOffline: (mode: CsRoomMode, difficulty: BotDifficulty) => void;
  onHost: (mode: CsRoomMode, difficulty: BotDifficulty) => void;
  onJoin: (code: string) => void;
}

const registered = new Set<string>();

/** Registers Panorama's font files: family from the file name (`stratum2-bold.ttf` -> Stratum2, 700). */
function usePanoramaFonts(channel: MenuChannel | null) {
  useEffect(() => {
    if (!channel || typeof FontFace === 'undefined') return;
    for (const [path, file] of Object.entries(channel.index.fonts)) {
      if (registered.has(file)) continue;
      registered.add(file);
      const stem = path.split('/').pop()!.replace(/\.(ttf|otf)$/i, '').toLowerCase();
      const family = /stratum/.test(stem) ? 'Stratum2' : stem.split(/[-_]/)[0];
      const weight = /black|heavy/.test(stem) ? '900' : /bold/.test(stem) ? '700' : /medium/.test(stem) ? '500' : /light/.test(stem) ? '300' : '400';
      const face = new FontFace(family, `url(${menuAssetUrl(file, channel.game)})`, { weight, style: /italic/.test(stem) ? 'italic' : 'normal' });
      void face.load().then((f) => document.fonts.add(f)).catch(() => undefined);
    }
  }, [channel]);
}

/** A Panorama icon by name (the first published of `names`), else the given fallback icon. */
function PanoIcon({ channel, names, fallback }: { channel: MenuChannel | null; names: string[]; fallback: ReactNode }) {
  const file = useMemo(() => {
    const icons = channel?.index.icons ?? {};
    for (const n of names) {
      const hit = Object.entries(icons).find(([k]) => k.endsWith(`/icons/ui/${n}.svg`));
      if (hit) return hit[1];
    }
    return null;
  }, [channel, names]);
  return file && channel ? <img className="pano-icon" src={menuAssetUrl(file, channel.game)} alt="" aria-hidden /> : <>{fallback}</>;
}

export default function CsMainMenu({ channel, signedIn, mapName, mapTitle, onOffline, onHost, onJoin }: CsMainMenuProps) {
  const { t } = useTranslation('c-tf2-game');
  const navigate = useNavigate();
  usePanoramaFonts(channel);
  const [panel, setPanel] = useState<null | 'play' | 'settings'>('play');
  const [mode, setMode] = useState<CsRoomMode>('de');
  const [how, setHow] = useState<CsPlaySource>('offline');
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal');
  const source = useMenuSource('csgo');
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings('csgo'));
  const onSettings = useCallback((next: GameSettings) => {
    setSettings(next);
    saveSettings('csgo', next);
  }, []);

  const video = channel?.index.video ? menuAssetUrl(channel.index.video.file, 'csgo') : null;
  const screenshot = useMemo(() => {
    const images = channel?.index.images ?? {};
    const key = Object.keys(images).find((k) => k.includes(mapName)) ?? Object.keys(images)[0];
    return key ? menuAssetUrl(images[key], 'csgo') : null;
  }, [channel, mapName]);
  const logo = useMemo(() => {
    const icons = channel?.index.icons ?? {};
    const key = Object.keys(icons).find((k) => /logo/.test(k));
    return key ? menuAssetUrl(icons[key], 'csgo') : null;
  }, [channel]);

  const modeLabel = (m: CsRoomMode) => (m === 'dm' ? t('cs_mode_dm', { defaultValue: 'Deathmatch' }) : t('cs_mode_de', { defaultValue: 'Bomb defusal' }));
  const howLabel: Record<CsPlaySource, string> = {
    offline: t('cs_offline', { defaultValue: 'Practice against bots' }),
    host: t('cs_host', { defaultValue: 'Host a game' }),
    browse: t('cs_rooms', { defaultValue: 'Games to join' }),
  };
  const difficultyLabel = (d: BotDifficulty) =>
    ({
      easy: t('play_difficulty_easy', { defaultValue: 'Easy' }),
      normal: t('play_difficulty_normal', { defaultValue: 'Normal' }),
      hard: t('play_difficulty_hard', { defaultValue: 'Hard' }),
      expert: t('play_difficulty_expert', { defaultValue: 'Expert' }),
    })[d];

  const go = () => {
    if (how === 'offline') onOffline(mode, difficulty);
    else if (how === 'host') onHost(mode, difficulty);
  };
  const canGo = how === 'offline' || (how === 'host' && signedIn);

  return (
    <div className="pano-root">
      {video ? (
        <video className="pano-bg" src={video} autoPlay muted loop playsInline aria-hidden poster={screenshot ?? undefined} />
      ) : screenshot ? (
        <img className="pano-bg pano-bg-still" src={screenshot} alt="" aria-hidden />
      ) : null}
      <div className="pano-shade" aria-hidden />

      <nav className="pano-sidebar" aria-label={t('play_menu', { defaultValue: 'Main menu' })}>
        <div className="pano-logo">
          {logo ? (
            <img src={logo} alt={t('csgo_title', { defaultValue: 'Counter-Strike: Global Offensive' })} />
          ) : (
            <span>{t('csgo_short', { defaultValue: 'CS:GO' })}</span>
          )}
        </div>
        <SideButton active={panel === 'play'} label={t('cs_play', { defaultValue: 'Play' })} onClick={() => setPanel(panel === 'play' ? null : 'play')}>
          <PanoIcon channel={channel} names={['play', 'play_filled']} fallback={<Play className="size-6" aria-hidden />} />
        </SideButton>
        <SideButton active={panel === 'settings'} label={t('settings', { defaultValue: 'Options' })} onClick={() => setPanel(panel === 'settings' ? null : 'settings')}>
          <PanoIcon channel={channel} names={['settings', 'gear']} fallback={<Settings className="size-6" aria-hidden />} />
        </SideButton>
        <span className="pano-sidebar-gap" />
        <SideButton label={t('menu_quit', { defaultValue: 'Quit' })} onClick={() => void navigate({ to: '/games' })}>
          <PanoIcon channel={channel} names={['power', 'quit', 'exit']} fallback={<Power className="size-6" aria-hidden />} />
        </SideButton>
      </nav>

      <div className="pano-stage">
        {panel === 'play' ? (
          <section className="pano-panel pano-play" aria-label={t('cs_play', { defaultValue: 'Play' })}>
            <header className="pano-panel-head">
              <div className="pano-modes" role="radiogroup" aria-label={t('cs_mode', { defaultValue: 'Mode' })}>
                {(['de', 'dm'] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={mode === m} className="pano-mode" onClick={() => setMode(m)}>
                    {modeLabel(m)}
                  </button>
                ))}
              </div>
              <button type="button" className="pano-close" onClick={() => setPanel(null)} aria-label={t('close', { defaultValue: 'Close' })}>
                <X className="size-5" aria-hidden />
              </button>
            </header>
            <div className="pano-how" role="radiogroup" aria-label={t('cs_how', { defaultValue: 'How to play' })}>
              {(['offline', 'host', 'browse'] as const).map((h) => (
                <button key={h} type="button" role="radio" aria-checked={how === h} className="pano-how-item" onClick={() => setHow(h)}>
                  {h === 'offline' ? <Bot className="size-4" aria-hidden /> : h === 'host' ? <Server className="size-4" aria-hidden /> : <Globe className="size-4" aria-hidden />}
                  {howLabel[h]}
                </button>
              ))}
            </div>

            {how === 'browse' ? (
              <CsRooms signedIn={signedIn} onJoin={onJoin} modeLabel={modeLabel} />
            ) : (
              <div className="pano-maps">
                <div className="pano-map" aria-current="true">
                  {screenshot ? <img src={screenshot} alt="" aria-hidden /> : <span className="pano-map-blank" aria-hidden />}
                  <span className="pano-map-name">{mapTitle}</span>
                </div>
                <div className="pano-play-side">
                  {how === 'host' ? (
                    <p className="pano-note">
                      {t('cs_host_body', { defaultValue: 'The match runs in your browser and friends connect to you directly. Bots fill the empty seats.' })}
                    </p>
                  ) : null}
                  <label className="pano-field">
                    <span>{t('play_difficulty', { defaultValue: 'Difficulty' })}</span>
                    <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as BotDifficulty)}>
                      {BOT_DIFFICULTIES.map((d) => (
                        <option key={d} value={d}>
                          {difficultyLabel(d)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {how === 'host' && !signedIn ? <SignIn /> : null}
                </div>
              </div>
            )}

            {how !== 'browse' ? (
              <footer className="pano-go-row">
                <button type="button" className="pano-go" disabled={!canGo} onClick={go}>
                  {t('cs_go', { defaultValue: 'Go' })}
                </button>
              </footer>
            ) : null}
          </section>
        ) : null}

        {panel === 'settings' ? (
          <section className="pano-panel pano-settings" aria-label={t('settings', { defaultValue: 'Options' })}>
            <header className="pano-panel-head">
              <h2 className="pano-panel-title">{t('settings', { defaultValue: 'Options' })}</h2>
              <button type="button" className="pano-close" onClick={() => setPanel(null)} aria-label={t('close', { defaultValue: 'Close' })}>
                <X className="size-5" aria-hidden />
              </button>
            </header>
            <div className="pano-skin">
              <OptionsDialog game="csgo" settings={settings} onChange={onSettings} source={source} />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function SideButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={cn('pano-side-btn', active && 'pano-side-btn-on')} aria-pressed={active} onClick={onClick} title={label}>
      {children}
      <span className="pano-side-label">{label}</span>
    </button>
  );
}

function SignIn() {
  const { t } = useTranslation('c-tf2-game');
  return (
    <Link to="/login" search={{ callbackURL: lobbyReturnPath('/csgo', null) }} className="pano-signin">
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
  const net = useRef<typeof import('@/lib/tf2-game/net/client') | null>(null);

  useEffect(() => {
    let alive = true;
    let remove: (() => void) | undefined;
    void import('@/lib/tf2-game/net/client').then(async (m) => {
      if (!alive) return;
      net.current = m;
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
    <div className="pano-rooms">
      <div className="pano-rooms-head">
        <span>{t('cs_rooms', { defaultValue: 'Games to join' })}</span>
        <button type="button" className="pano-link" onClick={() => net.current?.tf2.listRooms(0, 'csgo')}>
          <RefreshCw className="size-4" aria-hidden />
          {t('play_refresh', { defaultValue: 'Refresh' })}
        </button>
      </div>
      {rooms === null ? (
        <p className="pano-note">{t('play_status_connecting', { defaultValue: 'Connecting…' })}</p>
      ) : rooms.length === 0 ? (
        <p className="pano-note">{t('cs_rooms_empty', { defaultValue: 'Nobody is hosting right now. Host a game, or practise offline.' })}</p>
      ) : (
        <ul className="pano-room-list">
          {rooms.map((r) => (
            <li key={r.code} className="pano-room">
              <span className="pano-room-name">
                <span>{r.name || r.code}</span>
                <small>
                  {modeLabel(r.mode === 'dm' ? 'dm' : 'de')} · {t('play_room_players', { defaultValue: '{{n}}/{{max}}', n: r.players, max: r.maxPlayers })}
                  {r.host ? ` · ${t('browser_hosted_by_name', { defaultValue: 'Hosted by {{name}}', name: r.host })}` : ''}
                </small>
              </span>
              {signedIn ? (
                <button type="button" className="pano-button" disabled={r.players >= r.maxPlayers} onClick={() => onJoin(r.code)}>
                  {t('play_join', { defaultValue: 'Join' })}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <form
        className="pano-code"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && signedIn) onJoin(code.trim().toUpperCase());
        }}
      >
        <label className="pano-field">
          <span>{t('play_code', { defaultValue: 'Join by code' })}</span>
          <input
            value={code}
            maxLength={TF2_LIMITS.ROOM_CODE_LENGTH}
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={t('play_code_placeholder', { defaultValue: 'ABC234' })}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        {signedIn ? (
          <button type="submit" className="pano-button" disabled={!valid}>
            <KeyRound className="size-4" aria-hidden />
            {t('play_join', { defaultValue: 'Join' })}
          </button>
        ) : (
          <SignIn />
        )}
      </form>
    </div>
  );
}
