/**
 * /tf2/play's main menu, as TF2 draws its own: the HUD's mainmenuoverride.res and gamemenu.res
 * (menus/GameMenu.tsx — the player's custom HUD's when it ships them, as in TF2) with this game's
 * entries — Find a Game (the server browser, Quick Play, hosting peer-to-peer or on the hub), Offline
 * practice (map, bots, difficulty), Items (the loadout screen), Options (and TF2's Advanced Options),
 * HUD (the HUD picker), the developer console when it is enabled, and Quit (back to the TF2 Hub).
 *
 * Find a Game and Offline practice are pages of their own (Tf2Lobby: the document scrolls); Items is
 * the loadout screen; Options and HUD open over the menu. An invite (`?lobby=CODE`) opens Find a Game
 * at once (the play page joins it as soon as the player is signed in; signed out, the sign-in prompt
 * is there and keeps the invite through the login).
 *
 * The menu owns a HUD store of its own (no match is running): the console (`gameConsoleFor`) and the
 * views written for the game (the HUD picker, the loadout's AI bar) find their context through it.
 */
'use client';

import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { useLobbyInvite } from '@/hooks/useLobbyLink';
import { createHudStore } from '@/lib/tf2-game/client/hud-store';
import { detectTouchFirst } from '@/lib/tf2-game/client/input/touch';
import type { MenuCommand, MenuEntry } from '@/lib/tf2-game/client/menus/game-menu';
import { devConsoleEnabled, loadSettings, saveSettings, type GameSettings } from '@/lib/tf2-game/client/settings';
import type { Tf2Session } from '@/lib/tf2-game/client/tf2-client';
import { gameConsoleFor } from '@/lib/tf2-game/console/runtime';
import { useCatalog } from '@/lib/tf2-loadout/use-catalog';
import { Modal } from '../../tf2-hud/ui';
import Console from '../console/Console';
import { defaultLayout } from '../hud-layout';
import Tf2Lobby from '../Tf2Lobby';
import { HudProvider } from '../use-hud';
import GameMenu from './GameMenu';
import OptionsDialog from './OptionsDialog';
import { useMenuSource } from './use-menu-source';
import '../tf2-game.css';

const HudPauseView = lazy(() => import('../custom-hud/HudPauseView'));
const LoadoutScreen = lazy(() => import('./LoadoutScreen'));

type Panel = null | 'find' | 'offline' | 'loadout' | 'options' | 'advanced' | 'hud';

const subscribeNoop = () => () => {};

export default function Tf2MainMenu({
  onStart,
  active = true,
}: {
  onStart: (session: Tf2Session) => void;
  /** False while a match runs over the page: the menu's console and keys stand down. */
  active?: boolean;
}) {
  const { t } = useTranslation('c-tf2-game');
  const navigate = useNavigate();
  const invite = useLobbyInvite();
  const { data: session } = useSession();
  const accountName = (session as { user?: { name?: string | null } } | null)?.user?.name ?? null;
  const [panel, setPanel] = useState<Panel>(invite ? 'find' : null);
  useEffect(() => {
    if (invite) setPanel('find');
  }, [invite]);
  const source = useMenuSource('tf2');
  const touch = useSyncExternalStore(subscribeNoop, detectTouchFirst, () => false);

  // The player's settings: the Options dialog and the console write them, the next match reads them.
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings('tf2'));
  const onSettings = useCallback((next: GameSettings) => {
    setSettings(next);
    saveSettings('tf2', next);
  }, []);

  // A store of the menu's own: the console and the game's views find their context through it.
  const store = useMemo(() => createHudStore({ game: 'tf2' }), []);
  const hud = useMemo(
    () => ({ store, layout: defaultLayout('tf2'), screen: { w: 1280, h: 720 }, settings }),
    [store, settings],
  );
  const con = useMemo(() => gameConsoleFor(store, 'tf2', { settings }), [store]); // eslint-disable-line react-hooks/exhaustive-deps
  const consoleOn = con.forcedOn || devConsoleEnabled(settings, touch);

  const entries = useMemo<MenuEntry[]>(() => {
    const list: MenuEntry[] = [
      { command: 'find', token: '#MMenu_FindAGame', text: t('menu_find', { defaultValue: 'Find a game' }), image: 'glyph_multiplayer' },
      { command: 'offline', token: '#GameUI_GameMenu_OfflinePractice', text: t('play_offline_title', { defaultValue: 'Offline practice' }), image: 'glyph_practice' },
      { command: 'loadout', token: '#MMenu_CharacterSetup', text: t('menu_items', { defaultValue: 'Items' }), image: 'glyph_items' },
      { command: 'options', token: '#GameUI_GameMenu_Options', text: t('settings', { defaultValue: 'Options' }), image: 'glyph_options' },
      { command: 'advanced', token: '#MMenu_Tooltip_AdvOptions', text: t('menu_advanced_options', { defaultValue: 'Advanced options' }), image: 'glyph_options' },
      { command: 'hud', text: t('hud', { defaultValue: 'HUD' }), image: 'glyph_steamworkshop' },
    ];
    if (consoleOn) list.push({ command: 'console', token: '#GameUI_Console', text: t('console', { defaultValue: 'Console' }), image: 'glyph_server' });
    list.push({ command: 'quit', token: '#GameUI_GameMenu_Quit', text: t('menu_quit', { defaultValue: 'Quit' }), image: 'glyph_quit' });
    return list;
  }, [t, consoleOn]);

  const onCommand = useCallback(
    (c: MenuCommand) => {
      switch (c) {
        case 'find':
        case 'offline':
        case 'loadout':
        case 'options':
        case 'advanced':
        case 'hud':
          setPanel(c);
          break;
        case 'console':
          con.setOpen(true);
          break;
        case 'quit':
          void navigate({ to: '/tf2' });
          break;
        default:
          break;
      }
    },
    [con, navigate],
  );
  const back = useCallback(() => setPanel(null), []);

  if (panel === 'find' || panel === 'offline') return <Tf2Lobby onStart={onStart} view={panel} onBack={back} />;

  return (
    <HudProvider value={hud}>
      <div className={panel === 'loadout' ? 'relative min-h-dvh bg-(--app-bg) text-(--app-text)' : 'app-viewport relative bg-(--app-bg) text-(--app-text)'}>
        {panel === 'loadout' ? (
          <MenuLoadout source={source} onClose={back} />
        ) : (
          <GameMenu key={active ? 'on' : 'off'} source={source} inGame={false} entries={entries} onCommand={onCommand} title={t('menu_title', { defaultValue: 'Main menu' })} />
        )}
        <Modal
          open={panel === 'options' || panel === 'advanced'}
          onOpenChange={(o) => !o && back()}
          title={t('settings', { defaultValue: 'Options' })}
          wide
        >
          <OptionsDialog
            game="tf2"
            settings={settings}
            onChange={onSettings}
            source={source}
            accountName={accountName}
            initialTab={panel === 'advanced' ? 'multiplayer' : 'keyboard'}
            initialAdvanced={panel === 'advanced'}
          />
        </Modal>
        <Modal open={panel === 'hud'} onOpenChange={(o) => !o && back()} title={t('hud', { defaultValue: 'HUD' })} wide>
          <Suspense fallback={<p className="text-sm text-(--app-text-muted)">{t('hud_loading', { defaultValue: 'Loading…' })}</p>}>
            <HudPauseView onBack={back} onEdit={() => void navigate({ to: '/tf2/hud-editor' })} />
          </Suspense>
        </Modal>
        {/* The developer console over the menu (its own key, ` , works here too). */}
        {active ? (
          <div className="tf2g-hud app-theme tf2hud-theme" data-game="tf2" data-jelly="off">
            <Console game="tf2" store={store} settings={settings} onSettingsChange={onSettings} />
          </div>
        ) : null}
      </div>
    </HudProvider>
  );
}

function MenuLoadout({ source, onClose }: { source: ReturnType<typeof useMenuSource>; onClose: () => void }) {
  const { t } = useTranslation('c-tf2-game');
  const cat = useCatalog();
  if (cat.status !== 'ready') {
    return (
      <p role={cat.status === 'error' ? 'alert' : 'status'} className="tf2m-loadout-note">
        {cat.status === 'error'
          ? t('loadout_catalog_error', { defaultValue: 'Could not load the item catalog.' })
          : t('loadout_catalog_loading', { defaultValue: 'Loading the item catalog…' })}{' '}
        {cat.status === 'error' ? (
          <button type="button" className="inline-flex items-center underline pointer-coarse:min-h-11 pointer-coarse:min-w-11" onClick={cat.retry}>
            {t('loadout_retry', { defaultValue: 'Retry' })}
          </button>
        ) : null}
      </p>
    );
  }
  return (
    <Suspense fallback={<p className="tf2m-loadout-note">{t('hud_loading', { defaultValue: 'Loading…' })}</p>}>
      <LoadoutScreen idx={cat.index} match={null} source={source} onClose={onClose} />
    </Suspense>
  );
}
