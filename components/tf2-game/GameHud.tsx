/**
 * The in-game UI root for all three games. The client loop mounts it over the
 * game canvas, inside the play page's game container:
 *
 *   const store = createHudStore({ game: 'tf2' });
 *   const input = createInputState();
 *   <div className="relative h-full w-full">            // the game container
 *     <canvas … />
 *     <GameHud game="tf2" store={store} input={input}
 *              settings={settings} onSettingsChange={save} onDisconnect={leave} />
 *   </div>
 *
 * and each frame: `store.publish(buildHudState(source, log, { now }))` (it
 * throttles itself to 30 Hz) and `for (const a of drainImpulses(input))
 * store.dispatchImpulse(a)`; commands come back through `store.onCommand`.
 *
 * GameHud owns the menus (team, class, chat, voice, PDA, pause/settings, the
 * scoreboard), routes impulses to them, and tells the input layer when keys
 * belong to a menu (`input.menuOpen`: number keys pick items) or to text and
 * the pause menu (`input.suspended`: the game sees nothing). It also mounts
 * the touch controls on touch-first devices.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { HudGame } from '@/lib/tf2-game/client/hud-state';
import type { HudStore } from '@/lib/tf2-game/client/hud-store';
import type { GameSettings } from '@/lib/tf2-game/client/settings';
import { CLASS_MENU_ORDER, TF_CLASS_ENGINEER, TF_CLASS_SPY, enemyTeam } from '@/lib/tf2-game/core/constants';
import { slotOf, type ImpulseAction } from '@/lib/tf2-game/client/input/actions';
import type { InputState } from '@/lib/tf2-game/client/input/input-state';
import { detectTouchFirst } from '@/lib/tf2-game/client/input/touch';
import { defaultLayout, hudScale, mergeLayout, TOUCH_OVERRIDES, type HudLayout, type HudScreen } from './hud-layout';
import { HudProvider, useHudState } from './use-hud';
import Tf2Hud from './tf2/Tf2Hud';
import Scoreboard from './tf2/Scoreboard';
import { ClassMenu, TeamMenu, TEAM_MENU_KEYS, classForMenuKey } from './tf2/SelectMenus';
import { Chat, VoiceMenu } from './tf2/Comms';
import { BUILD_SLOTS, BuildMenu, DisguiseMenu } from './tf2/PdaMenus';
import { Captions, Hl2Hud, PortalHud } from './sp/SpHuds';
import PauseMenu from './shared/PauseMenu';
import TouchOverlay from './touch/TouchOverlay';
import './tf2-game.css';

export type HudMenu =
  | { kind: 'none' }
  | { kind: 'team' }
  | { kind: 'class' }
  | { kind: 'voice'; menu: 0 | 1 | 2 }
  | { kind: 'chat'; team: boolean }
  | { kind: 'pause'; view: 'menu' | 'settings' };

export interface GameHudProps {
  game: HudGame;
  store: HudStore;
  /** The input state the devices write; omitted in previews. */
  input?: InputState;
  settings: GameSettings;
  onSettingsChange: (next: GameSettings) => void;
  onDisconnect: () => void;
  /** A custom HUD's layout (defaults to the game's own). */
  layout?: HudLayout;
  /** Previews: start with a menu open / the scoreboard held / the touch overlay on. */
  initialMenu?: HudMenu;
  forceScores?: boolean;
  forceTouch?: boolean;
}

const NONE: HudMenu = { kind: 'none' };

const subscribeNoop = () => () => {};

/** Whether the touch controls should show (setting, or a touch-first device). */
function useTouchControls(mode: GameSettings['touch']['mode'], force?: boolean): boolean {
  const touchFirst = useSyncExternalStore(subscribeNoop, detectTouchFirst, () => false);
  if (force !== undefined) return force;
  return mode === 'on' || (mode === 'auto' && touchFirst);
}

function HudBody({
  game,
  input,
  settings,
  onSettingsChange,
  onDisconnect,
  initialMenu,
  forceScores,
  touch,
  store,
}: Omit<GameHudProps, 'layout' | 'forceTouch'> & { touch: boolean }) {
  const { t } = useTranslation('c-tf2-game');
  const state = useHudState();
  const [menu, setMenu] = useState<HudMenu>(initialMenu ?? NONE);
  const [dismissedJoin, setDismissedJoin] = useState(false);
  const [disguiseFriendly, setDisguiseFriendly] = useState(false);
  const [touchScores, setTouchScores] = useState(false);
  const local = state.local;
  const tf2 = game === 'tf2';

  // The join flow: no team → team menu; a team but no class → class menu (until dismissed).
  const joinMenu: HudMenu | null =
    tf2 && local && !dismissedJoin ? (local.team === 0 ? { kind: 'team' } : local.team >= 2 && local.cls === 0 ? { kind: 'class' } : null) : null;
  const shown: HudMenu = menu.kind !== 'none' ? menu : (joinMenu ?? NONE);

  // PDA menus follow the active weapon: the Engineer's build (slot 3) / destroy (slot 4) PDAs, the Spy's disguise kit (slot 3).
  const pda: 'build' | 'destroy' | 'disguise' | null =
    tf2 && local?.alive && shown.kind === 'none'
      ? local.cls === TF_CLASS_ENGINEER && local.activeSlot === 3
        ? 'build'
        : local.cls === TF_CLASS_ENGINEER && local.activeSlot === 4
          ? 'destroy'
          : local.cls === TF_CLASS_SPY && local.activeSlot === 3
            ? 'disguise'
            : null
      : null;

  const joinOpen = joinMenu !== null;
  const close = useCallback(() => {
    if (menu.kind === 'none' && joinOpen) setDismissedJoin(true);
    setMenu(NONE);
  }, [menu.kind, joinOpen]);

  // Tell the input layer who owns the keys.
  useEffect(() => {
    if (!input) return;
    input.menuOpen = shown.kind === 'voice' || shown.kind === 'team' || shown.kind === 'class' || pda !== null;
    input.suspended = shown.kind === 'chat' || shown.kind === 'pause';
  }, [input, shown.kind, pda]);

  const paused = shown.kind === 'pause';
  useEffect(() => {
    store.send({ kind: 'pause', paused });
  }, [store, paused]);

  const disguiseTeam = local ? (disguiseFriendly ? local.team : enemyTeam(local.team)) : 2;

  const pickMenuItem = useCallback(
    (n: number) => {
      if (shown.kind === 'voice') {
        if (n >= 1 && n <= 8) store.send({ kind: 'voice', menu: shown.menu, item: n - 1 });
        setMenu(NONE);
      } else if (shown.kind === 'team') {
        const choice = TEAM_MENU_KEYS[n - 1];
        if (choice) {
          store.send({ kind: 'team', team: choice });
          setMenu(NONE);
          setDismissedJoin(false);
        }
      } else if (shown.kind === 'class') {
        const cls = classForMenuKey(n);
        if (cls) {
          store.send({ kind: 'class', cls });
          setMenu(NONE);
        }
      } else if (pda === 'build' || pda === 'destroy') {
        const slot = BUILD_SLOTS[n - 1];
        if (slot) store.send({ kind: 'build', action: pda, objectType: slot.objectType, objectMode: slot.objectMode });
      } else if (pda === 'disguise') {
        const cls = CLASS_MENU_ORDER[n - 1];
        if (cls) store.send({ kind: 'disguise', cls, team: disguiseTeam });
      }
    },
    [shown, pda, store, disguiseTeam],
  );

  // Impulses from the input layer (keyboard, gamepad, touch).
  useEffect(() => {
    return store.onImpulse((a: ImpulseAction) => {
      const slot = slotOf(a);
      if (a === 'menu') {
        if (shown.kind !== 'none') close();
        else setMenu({ kind: 'pause', view: 'menu' });
        return;
      }
      if (shown.kind === 'pause' || shown.kind === 'chat') return;
      if (slot && (shown.kind !== 'none' || pda)) {
        pickMenuItem(slot);
        return;
      }
      if (!tf2) return;
      switch (a) {
        case 'say':
          setMenu({ kind: 'chat', team: false });
          break;
        case 'say_team':
          setMenu({ kind: 'chat', team: true });
          break;
        case 'voice_menu_1':
        case 'voice_menu_2':
        case 'voice_menu_3': {
          const m = (Number(a.slice(-1)) - 1) as 0 | 1 | 2;
          setMenu(shown.kind === 'voice' && shown.menu === m ? NONE : { kind: 'voice', menu: m });
          break;
        }
        case 'medic':
          store.send({ kind: 'voice', menu: 0, item: 0 });
          break;
        case 'changeclass':
          setMenu({ kind: 'class' });
          break;
        case 'changeteam':
          setMenu({ kind: 'team' });
          break;
        case 'taunt':
          store.send({ kind: 'extra', command: 'taunt', args: [] });
          break;
        case 'dropitem':
          store.send({ kind: 'extra', command: 'dropitem', args: [] });
          break;
        case 'lastdisguise':
          store.send({ kind: 'lastdisguise' });
          break;
        default:
          break;
      }
    });
  }, [store, shown, pda, tf2, close, pickMenuItem]);

  // Keys with no binding action: 0 (cancel / random class) and - (the disguise kit's team) while a menu has the keys.
  useEffect(() => {
    if (shown.kind === 'none' && !pda) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Digit0') {
        if (shown.kind === 'class') pickMenuItem(0);
        else if (shown.kind === 'voice') setMenu(NONE);
      } else if (e.code === 'Minus' && pda === 'disguise') setDisguiseFriendly((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown.kind, pda, pickMenuItem]);

  const scoresHeld =
    forceScores ||
    touchScores ||
    (!!input && (input.held.key.has('showscores') || input.held.pad.has('showscores') || input.held.touch.has('showscores'))) ||
    state.match.roundState === 'game_over';

  return (
    <>
      {tf2 ? <Tf2Hud state={state} hideCrosshair={(shown.kind !== 'none' && shown.kind !== 'chat') || pda !== null} /> : null}
      {game === 'hl2' && state.hl2 ? <Hl2Hud hl2={state.hl2} alive={(state.hl2.health ?? 0) > 0} /> : null}
      {game === 'portal' && state.portal ? <PortalHud portal={state.portal} fade={state.fade} /> : null}
      {game !== 'tf2' ? <Captions captions={state.captions} /> : null}
      {/* Before every menu, so menus paint above it; its move/look zones stand down while one is open. */}
      {touch && input && shown.kind !== 'pause' ? (
        <TouchOverlay
          game={game}
          input={input}
          store={store}
          local={local}
          settings={settings}
          menuOpen={shown.kind !== 'none' || pda !== null || touchScores}
          onToggleScores={() => setTouchScores((v) => !v)}
        />
      ) : null}
      {tf2 ? (
        <Chat
          lines={state.chat}
          now={state.now}
          input={shown.kind === 'chat' ? (shown.team ? 'team' : 'all') : null}
          onSend={(text, teamOnly) => store.send({ kind: 'chat', text, teamOnly })}
          onClose={() => setMenu(NONE)}
        />
      ) : null}
      {tf2 && shown.kind === 'voice' ? <VoiceMenu menu={shown.menu} onPick={(i) => pickMenuItem(i + 1)} onClose={() => setMenu(NONE)} /> : null}
      {tf2 && local && pda && local.engineer && pda !== 'disguise' ? (
        <BuildMenu engineer={local.engineer} team={local.team} destroy={pda === 'destroy'} onPick={(i) => pickMenuItem(i + 1)} onClose={() => {}} />
      ) : null}
      {tf2 && local && pda === 'disguise' ? (
        <DisguiseMenu
          disguiseTeam={disguiseTeam}
          onPick={(cls) => store.send({ kind: 'disguise', cls, team: disguiseTeam })}
          onToggleTeam={() => setDisguiseFriendly((v) => !v)}
          onClose={() => {}}
        />
      ) : null}
      {tf2 && scoresHeld && shown.kind === 'none' ? <Scoreboard rows={state.scoreboard} match={state.match} localTeam={local?.team ?? 0} /> : null}
      {tf2 && shown.kind === 'team' ? (
        <TeamMenu rows={state.scoreboard} current={local?.team ?? 0} onPick={(team) => pickMenuItem(TEAM_MENU_KEYS.indexOf(team) + 1)} onClose={close} />
      ) : null}
      {tf2 && shown.kind === 'class' && local ? (
        <ClassMenu
          team={local.team >= 2 ? local.team : 2}
          rows={state.scoreboard}
          current={local.cls}
          onPick={(cls) => {
            store.send({ kind: 'class', cls });
            setMenu(NONE);
          }}
          onClose={close}
        />
      ) : null}
      {settings.showFps ? (
        <span className="tf2g-fps">{t('fps', { defaultValue: '{{n}} fps', n: Math.round(state.fps) })}</span>
      ) : null}
      <PauseMenu
        key={shown.kind === 'pause' ? shown.view : 'closed'}
        open={shown.kind === 'pause'}
        game={game}
        settings={settings}
        onSettings={onSettingsChange}
        onResume={() => setMenu(NONE)}
        onChangeTeam={tf2 ? () => setMenu({ kind: 'team' }) : undefined}
        onChangeClass={tf2 && local && local.team >= 2 ? () => setMenu({ kind: 'class' }) : undefined}
        onDisconnect={onDisconnect}
        initialView={shown.kind === 'pause' ? shown.view : 'menu'}
      />
    </>
  );
}

export default function GameHud(props: GameHudProps) {
  const { game, store, settings, layout, forceTouch } = props;
  const root = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<HudScreen>({ w: 1280, h: 720 });
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => setScreen({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const touch = useTouchControls(settings.touch.mode, forceTouch);
  const value = useMemo(
    () => {
      const base = layout ?? defaultLayout(game);
      return { store, layout: touch ? mergeLayout(base, TOUCH_OVERRIDES[game]) : base, screen, settings };
    },
    [store, layout, game, screen, settings, touch],
  );
  const theme = game === 'hl2' ? ' tf2g-hl2-theme' : game === 'portal' ? ' tf2g-portal-theme' : '';
  return (
    <div
      ref={root}
      className={`tf2g-hud app-theme tf2hud-theme${theme}`}
      style={{ '--u': `${hudScale(screen)}px` } as CSSProperties}
      data-game={game}
      data-calm={settings.reducedFlashing}
      data-jelly="off"
      data-jelly-zone="playfield"
    >
      <HudProvider value={value}>
        <HudBody {...props} touch={touch} />
      </HudProvider>
    </div>
  );
}
