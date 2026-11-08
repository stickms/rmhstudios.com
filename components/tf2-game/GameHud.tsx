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
 *
 * TF2 can draw a custom HUD (pause menu → HUD, or the HUD editor's "Test in
 * game"): its `.res` panels come from the HUD editor's renderer on a canvas
 * (custom-hud/CustomHudLayer), the panels the game makes at run time follow
 * its hudlayout.res, and the full HUD editor can be opened over the match
 * (custom-hud/HudEditorOverlay; it has the keys, and offline play pauses).
 */
'use client';

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { HudGame } from '@/lib/tf2-game/client/hud-state';
import type { HudStore } from '@/lib/tf2-game/client/hud-store';
import type { GameSettings } from '@/lib/tf2-game/client/settings';
import { CLASS_MENU_ORDER, TF_CLASS_ENGINEER, TF_CLASS_SPY, enemyTeam } from '@/lib/tf2-game/core/constants';
import { slotOf, type ImpulseAction } from '@/lib/tf2-game/client/input/actions';
import type { InputState } from '@/lib/tf2-game/client/input/input-state';
import { detectTouchFirst } from '@/lib/tf2-game/client/input/touch';
import { layoutOverrides } from '@/lib/tf2-game/client/custom-hud/layout';
import { PC_ENV } from '@/lib/tf2-hud/scheme/cond';
import { defaultLayout, hudScale, mergeLayout, TF2_LAYOUT, touchOverrides, type HudLayout, type HudScreen } from './hud-layout';
import { HudProvider, NO_INSETS, safeScreen, useHudState, type HudInsets } from './use-hud';
import Tf2Hud from './tf2/Tf2Hud';
import Scoreboard from './tf2/Scoreboard';
import { ClassMenu, TeamMenu, TEAM_MENU_KEYS, classForMenuKey } from './tf2/SelectMenus';
import { Chat, VoiceMenu } from './tf2/Comms';
import { BUILD_SLOTS, BuildMenu, DisguiseMenu } from './tf2/PdaMenus';
import { Captions, Hl2Hud, PortalHud } from './sp/SpHuds';
import PauseMenu, { type PauseView } from './shared/PauseMenu';
import CustomHudLayer, { hudTokens } from './custom-hud/CustomHudLayer';
import CustomHudMenu from './custom-hud/CustomHudMenu';
import { teamMenuHotkeys, type MenuAction } from '@/lib/tf2-game/client/custom-hud/menus';
import { useHudChoice } from './custom-hud/hud-choice';
import TouchOverlay, { type TouchAction } from './touch/TouchOverlay';
import Console, { useConsoleEntry, useConsoleOpen } from './console/Console';
import ServerAdminView from './ServerAdminView';
import GameMenu from './menus/GameMenu';
import { useMenuSource } from './menus/use-menu-source';
import type { MenuCommand, MenuEntry } from '@/lib/tf2-game/client/menus/game-menu';
import NetNotices from './NetNotices';
import './tf2-game.css';

// The HUD picker and the HUD editor load when first opened.
const HudPauseView = lazy(() => import('./custom-hud/HudPauseView'));
const HudEditorOverlay = lazy(() => import('./custom-hud/HudEditorOverlay'));
// The in-game loadout editor loads when first opened (three.js, the item catalog).
const LoadoutPauseView = lazy(() => import('./tf2/LoadoutPauseView'));
// CS:GO's own HUD and buy menu: loaded only for a CS:GO match.
const CsHud = lazy(() => import('@/components/csgo-game/CsHud'));

export type HudMenu =
  | { kind: 'none' }
  | { kind: 'team' }
  | { kind: 'class' }
  | { kind: 'voice'; menu: 0 | 1 | 2 }
  | { kind: 'chat'; team: boolean }
  /** `menu`, `settings`, or a pause view's id (`hud`, …). */
  | { kind: 'pause'; view: string };

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
  /** Page controls the touch controls carry in their top row (full screen, the invite link). */
  touchActions?: readonly TouchAction[];
  /** Captures the pointer again (a cursor panel, the buy menu, closed by a key or a click). */
  onCapture?: () => void;
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
  touchActions,
  onCapture,
}: Omit<GameHudProps, 'layout' | 'forceTouch'> & { touch: boolean }) {
  const { t } = useTranslation('c-tf2-game');
  const state = useHudState();
  const [menu, setMenu] = useState<HudMenu>(initialMenu ?? NONE);
  const [dismissedJoin, setDismissedJoin] = useState(false);
  const [disguiseFriendly, setDisguiseFriendly] = useState(false);
  const [touchScores, setTouchScores] = useState(false);
  const local = state.local;
  const tf2 = game === 'tf2';
  const customHud = useHudChoice((s) => (tf2 ? s.active : null));
  // A HUD's own team menu marks its number keys (`&3` on BLU in TF2's file); otherwise the game's 1–4.
  const hudTeamKeys = useMemo(() => {
    const keys = customHud?.menus.has('team') ? teamMenuHotkeys(customHud.source) : null;
    return keys && keys.size ? keys : null;
  }, [customHud]);
  const editorOpen = useHudChoice((s) => tf2 && s.editorOpen);
  const editorUsed = useHudChoice((s) => tf2 && s.editorKey !== null);
  const setEditorOpen = useHudChoice((s) => s.setEditorOpen);

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

  // The developer console (console/Console.tsx): it has the keys while open; the pause menu opens it.
  const consoleOpen = useConsoleOpen(store, game);
  const devConsole = useConsoleEntry(store, game, settings);

  // Tell the input layer who owns the keys.
  useEffect(() => {
    if (!input) return;
    input.menuOpen = shown.kind === 'voice' || shown.kind === 'team' || shown.kind === 'class' || pda !== null;
    input.suspended = shown.kind === 'chat' || shown.kind === 'pause' || editorOpen || consoleOpen;
  }, [input, shown.kind, pda, editorOpen, consoleOpen]);

  // The pause menu, or the HUD editor over the match: offline play stops, online play goes on.
  // Single-player also pauses while the developer console is up, as Source does.
  const paused = shown.kind === 'pause' || editorOpen || (consoleOpen && !tf2);
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
        const choice = hudTeamKeys ? hudTeamKeys.get(n) : TEAM_MENU_KEYS[n - 1];
        if (choice) {
          store.send({ kind: 'team', team: choice });
          // As TF2 does (HandleCommand_JoinTeam shows the team's class panel): joining a team asks for a class.
          setMenu(choice === 'spectator' ? NONE : { kind: 'class' });
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
    [shown, pda, store, disguiseTeam, hudTeamKeys],
  );

  // Impulses from the input layer (keyboard, gamepad, touch).
  useEffect(() => {
    return store.onImpulse((a: ImpulseAction) => {
      // The HUD editor has the keys.
      if (editorOpen) return;
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
  }, [store, shown, pda, tf2, close, pickMenuItem, editorOpen]);

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

  // The pause menu's views beyond Options (others append here).
  const hasAdmin = tf2 && !!state.admin;
  const pauseViews = useMemo<PauseView[]>(() => {
    if (!tf2) return [];
    const views: PauseView[] = [];
    if (editorUsed) {
      views.push({
        id: 'hud-editor',
        label: t('hud_back_to_editor', { defaultValue: 'Back to the HUD editor' }),
        action: () => {
          setMenu(NONE);
          setEditorOpen(true);
        },
      });
    }
    views.push({
      id: 'hud',
      label: t('hud', { defaultValue: 'HUD' }),
      wide: true,
      render: ({ back }) => (
        <Suspense fallback={<p className="text-sm text-(--app-text-muted)">{t('hud_loading', { defaultValue: 'Loading…' })}</p>}>
          <HudPauseView
            onBack={back}
            onEdit={() => {
              setMenu(NONE);
              setEditorOpen(true);
            }}
          />
        </Suspense>
      ),
    });
    // Server: the room's administration (players — kick, make host / owner — the map, the settings, the
    // door, a server message) for the peer-to-peer host or a hub room's owner; every device reaches it here.
    if (hasAdmin) {
      views.push({
        id: 'server',
        label: t('admin_server', { defaultValue: 'Server' }),
        wide: true,
        render: () => <ServerAdminView />,
      });
    }
    return views;
  }, [tf2, t, editorUsed, setEditorOpen, hasAdmin]);

  // TF2's Esc menu: the HUD's mainmenuoverride.res / gamemenu.res with this match's entries (menus/GameMenu).
  const menuSource = useMenuSource(game);
  const canClass = tf2 && !!local && local.team >= 2;
  const escEntries = useMemo<MenuEntry[]>(() => {
    if (!tf2) return [];
    const list: MenuEntry[] = [{ command: 'resume', token: '#GameUI_GameMenu_ResumeGame', text: t('resume', { defaultValue: 'Resume game' }), image: 'glyph_multiplayer' }];
    if (editorUsed) list.push({ command: 'editor', text: t('hud_back_to_editor', { defaultValue: 'Back to the HUD editor' }), image: 'glyph_workshop_edit' });
    if (hasAdmin) list.push({ command: 'server', text: t('admin_server', { defaultValue: 'Server' }), image: 'glyph_server' });
    list.push({ command: 'team', token: '#Valve_Change_Team', text: t('change_team', { defaultValue: 'Change team' }), image: 'glyph_coop' });
    if (canClass) list.push({ command: 'class', token: '#Valve_Change_Class', text: t('change_class', { defaultValue: 'Change class' }), image: 'glyph_items' });
    list.push(
      { command: 'loadout', token: '#MMenu_CharacterSetup', text: t('loadout', { defaultValue: 'Loadout' }), image: 'glyph_items' },
      { command: 'hud', text: t('hud', { defaultValue: 'HUD' }), image: 'glyph_steamworkshop' },
      { command: 'options', token: '#GameUI_GameMenu_Options', text: t('settings', { defaultValue: 'Options' }), image: 'glyph_options' },
      { command: 'advanced', token: '#MMenu_Tooltip_AdvOptions', text: t('menu_advanced_options', { defaultValue: 'Advanced options' }), image: 'glyph_options' },
    );
    if (devConsole.enabled) list.push({ command: 'console', token: '#GameUI_Console', text: t('console', { defaultValue: 'Console' }), image: 'glyph_server' });
    list.push({ command: 'disconnect', token: '#GameUI_GameMenu_Disconnect', text: t('disconnect', { defaultValue: 'Disconnect' }), image: 'glyph_disconnect' });
    return list;
  }, [tf2, t, editorUsed, hasAdmin, canClass, devConsole.enabled]);
  const onEscCommand = useCallback(
    (c: MenuCommand) => {
      switch (c) {
        case 'resume':
          setMenu(NONE);
          break;
        case 'editor':
          setMenu(NONE);
          setEditorOpen(true);
          break;
        case 'team':
          setMenu({ kind: 'team' });
          break;
        case 'class':
          setMenu({ kind: 'class' });
          break;
        case 'console':
          setMenu(NONE);
          devConsole.open();
          break;
        case 'disconnect':
          onDisconnect();
          break;
        case 'options':
          setMenu({ kind: 'pause', view: 'settings' });
          break;
        case 'advanced':
        case 'loadout':
        case 'hud':
        case 'server':
          setMenu({ kind: 'pause', view: c });
          break;
        default:
          break;
      }
    },
    [setEditorOpen, devConsole, onDisconnect],
  );
  const toEscMenu = useCallback(() => setMenu({ kind: 'pause', view: 'menu' }), []);
  const escMenuOpen = tf2 && shown.kind === 'pause' && shown.view === 'menu';
  const loadoutOpen = tf2 && shown.kind === 'pause' && shown.view === 'loadout';

  // Menus a custom HUD restyles (it ships their .res) are drawn from it, as in TF2; the rest stay the game's.
  const hudMenus = customHud?.menus;
  const hudFallbackTokens = useMemo(() => hudTokens(t), [t]);
  const onHudMenu = useCallback(
    (a: MenuAction) => {
      if (a.kind === 'team') {
        store.send({ kind: 'team', team: a.team });
        // As TF2 does: joining a team asks for a class.
        setMenu(a.team === 'spectator' ? NONE : { kind: 'class' });
        setDismissedJoin(false);
      } else if (a.kind === 'class') {
        store.send({ kind: 'class', cls: a.cls });
        setMenu(NONE);
      } else if (a.kind === 'loadout') setMenu({ kind: 'pause', view: 'loadout' });
      else close();
    },
    [store, close],
  );

  return (
    <>
      {tf2 ? (
        <Tf2Hud
          state={state}
          hideCrosshair={(shown.kind !== 'none' && shown.kind !== 'chat') || pda !== null}
          custom={!!customHud}
          customBuildings={customHud?.drawsBuildings}
          customSpectator={customHud?.drawsSpectator}
          customLayer={customHud ? <CustomHudLayer hud={customHud} store={store} /> : null}
        />
      ) : null}
      {game === 'hl2' && state.hl2 ? <Hl2Hud hl2={state.hl2} alive={(state.hl2.health ?? 0) > 0} /> : null}
      {game === 'portal' && state.portal ? <PortalHud portal={state.portal} fade={state.fade} /> : null}
      {game === 'csgo' && state.cs ? (
        <Suspense fallback={null}>
          <CsHud state={state} store={store} input={input} onCapture={onCapture} />
        </Suspense>
      ) : null}
      {game !== 'tf2' ? <Captions captions={state.captions} /> : null}
      {/* Before every menu, so menus paint above it; its move/look zones stand down while one is open. */}
      {touch && input && shown.kind !== 'pause' && !editorOpen ? (
        <TouchOverlay
          game={game}
          input={input}
          store={store}
          local={local}
          settings={settings}
          menuOpen={shown.kind !== 'none' || pda !== null || touchScores}
          onToggleScores={() => setTouchScores((v) => !v)}
          actions={touchActions}
        />
      ) : null}
      {tf2 ? (
        <Chat
          lines={state.chat}
          now={state.now}
          input={shown.kind === 'chat' ? (shown.team ? 'team' : 'all') : null}
          onSend={(text, teamOnly) => store.send({ kind: 'chat', text, teamOnly })}
          onClose={() => setMenu(NONE)}
          touch={touch}
        />
      ) : null}
      {tf2 && shown.kind === 'voice' ? <VoiceMenu menu={shown.menu} onPick={(i) => pickMenuItem(i + 1)} onClose={() => setMenu(NONE)} /> : null}
      {tf2 && local && pda && local.engineer && pda !== 'disguise' ? (
        <BuildMenu engineer={local.engineer} team={local.team} destroy={pda === 'destroy'} onPick={(i) => pickMenuItem(i + 1)} onClose={() => {}} touch={touch} />
      ) : null}
      {tf2 && local && pda === 'disguise' ? (
        <DisguiseMenu
          disguiseTeam={disguiseTeam}
          onPick={(cls) => store.send({ kind: 'disguise', cls, team: disguiseTeam })}
          onToggleTeam={() => setDisguiseFriendly((v) => !v)}
          onClose={() => {}}
          touch={touch}
        />
      ) : null}
      {tf2 && scoresHeld && shown.kind === 'none' ? (
        customHud && hudMenus?.has('scoreboard') ? (
          <CustomHudMenu hud={customHud} kind="scoreboard" state={state} fallbackTokens={hudFallbackTokens} onAction={onHudMenu} onClose={close} />
        ) : (
          <Scoreboard rows={state.scoreboard} match={state.match} localTeam={local?.team ?? 0} />
        )
      ) : null}
      {tf2 && shown.kind === 'team' && customHud && hudMenus?.has('team') ? (
        <CustomHudMenu hud={customHud} kind="team" state={state} fallbackTokens={hudFallbackTokens} onAction={onHudMenu} onClose={close} />
      ) : tf2 && shown.kind === 'team' ? (
        <TeamMenu rows={state.scoreboard} current={local?.team ?? 0} onPick={(team) => pickMenuItem(TEAM_MENU_KEYS.indexOf(team) + 1)} onClose={close} />
      ) : null}
      {tf2 && shown.kind === 'class' && local && customHud && hudMenus?.has('class') ? (
        <CustomHudMenu
          hud={customHud}
          kind="class"
          state={state}
          team={local.team >= 2 ? local.team : 2}
          fallbackTokens={hudFallbackTokens}
          onAction={onHudMenu}
          onClose={close}
        />
      ) : tf2 && shown.kind === 'class' && local ? (
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
      {escMenuOpen ? (
        <GameMenu
          source={menuSource}
          inGame
          entries={escEntries}
          onCommand={onEscCommand}
          onBack={() => setMenu(NONE)}
          title={t('paused', { defaultValue: 'Paused' })}
          subscribeImpulses={store.onImpulse as (fn: (a: string) => void) => () => void}
        />
      ) : null}
      {loadoutOpen ? (
        <Suspense fallback={<p className="tf2m-loadout-note">{t('hud_loading', { defaultValue: 'Loading…' })}</p>}>
          <LoadoutPauseView onClose={toEscMenu} />
        </Suspense>
      ) : null}
      <PauseMenu
        key={shown.kind === 'pause' ? shown.view : 'closed'}
        open={shown.kind === 'pause' && !escMenuOpen && !loadoutOpen}
        game={game}
        settings={settings}
        onSettings={onSettingsChange}
        onResume={() => setMenu(NONE)}
        onChangeTeam={tf2 ? () => setMenu({ kind: 'team' }) : undefined}
        onChangeClass={tf2 && local && local.team >= 2 ? () => setMenu({ kind: 'class' }) : undefined}
        onDisconnect={onDisconnect}
        onBackToMenu={tf2 ? toEscMenu : undefined}
        views={
          devConsole.enabled
            ? [
                ...pauseViews,
                {
                  id: 'console',
                  label: t('console', { defaultValue: 'Console' }),
                  action: () => {
                    setMenu(NONE);
                    devConsole.open();
                  },
                },
              ]
            : pauseViews
        }
        initialView={shown.kind === 'pause' ? shown.view : 'menu'}
      />
      {tf2 ? <NetNotices /> : null}
      <Console game={game} store={store} input={input} settings={settings} onSettingsChange={onSettingsChange} />
      {editorOpen ? (
        <Suspense fallback={null}>
          <HudEditorOverlay store={store} />
        </Suspense>
      ) : null}
    </>
  );
}

/** Reads the safe-area insets from a probe positioned by them (CSS `env()` has no JS reader). */
function readInsets(root: HTMLElement, probe: HTMLElement): HudInsets {
  const a = root.getBoundingClientRect();
  const b = probe.getBoundingClientRect();
  const px = (v: number) => Math.max(0, Math.round(v));
  return { top: px(b.top - a.top), right: px(a.right - b.right), bottom: px(a.bottom - b.bottom), left: px(b.left - a.left) };
}

export default function GameHud(props: GameHudProps) {
  const { game, store, settings, layout, forceTouch } = props;
  const root = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<HudScreen>({ w: 1280, h: 720 });
  const [safe, setSafe] = useState<HudInsets>(NO_INSETS);
  useEffect(() => {
    const el = root.current;
    const pr = probe.current;
    if (!el) return;
    const measure = () => {
      setScreen({ w: el.clientWidth, h: el.clientHeight });
      if (pr) {
        const next = readInsets(el, pr);
        setSafe((cur) =>
          cur.top === next.top && cur.right === next.right && cur.bottom === next.bottom && cur.left === next.left ? cur : next,
        );
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // The insets change with the orientation even when the game area keeps its size.
    if (pr) ro.observe(pr);
    return () => ro.disconnect();
  }, []);
  const touch = useTouchControls(settings.touch.mode, forceTouch);
  // The remembered HUD choice (TF2 only); a custom HUD moves the game's own panels with its hudlayout.res.
  useEffect(() => {
    if (game === 'tf2') useHudChoice.getState().init();
  }, [game]);
  const customHud = useHudChoice((s) => (game === 'tf2' ? s.active : null));
  const hudLayout = useMemo(
    () => (customHud ? layoutOverrides(customHud.files.readText, PC_ENV, Object.keys(TF2_LAYOUT)) : null),
    [customHud],
  );
  const inner = safeScreen(screen, safe);
  const value = useMemo(
    () => {
      const own = layout ?? defaultLayout(game);
      const base = hudLayout ? mergeLayout(own, hudLayout) : own;
      const placed = touch ? mergeLayout(base, touchOverrides(game, safeScreen(screen, safe), settings.touch.buttonScale)) : base;
      return { store, layout: placed, screen, settings, safe };
    },
    [store, layout, game, screen, settings, touch, hudLayout, safe],
  );
  const theme = game === 'hl2' ? ' tf2g-hl2-theme' : game === 'portal' ? ' tf2g-portal-theme' : '';
  const u = hudScale(inner);
  return (
    <div
      ref={root}
      className={`tf2g-hud app-theme tf2hud-theme${theme}`}
      // --u-menu: the unit the menus a finger picks from use on touch (never under 1px, so a class card is 46px wide).
      style={{ '--u': `${u}px`, '--u-menu': `${touch ? Math.max(u, 1) : u}px` } as CSSProperties}
      data-game={game}
      data-calm={settings.reducedFlashing}
      data-touch={touch ? 'true' : undefined}
      data-jelly="off"
      data-jelly-zone="playfield"
    >
      <div ref={probe} className="tf2g-safe-probe" aria-hidden="true" />
      <HudProvider value={value}>
        <HudBody {...props} touch={touch} />
      </HudProvider>
    </div>
  );
}
