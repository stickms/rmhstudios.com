/**
 * The pause / escape menu: Resume, the menu's views (Options — the Source-style
 * Options dialog, menus/OptionsDialog.tsx — and what the game adds: HUD, …),
 * Change team, Change class (TF2), Disconnect — in the TF2 Hub's app-tier
 * dialog, so it has a real focus trap and Esc closes it. TF2's own Esc menu is
 * drawn from the HUD's mainmenuoverride.res (menus/GameMenu.tsx); it opens these
 * views by id, and their Back returns to it (`onBackToMenu`).
 *
 * Views are a list. Each is `{ id, label, render }`: the main menu shows a
 * button per view, and choosing one shows its `render()` in the same dialog
 * with a Back button. To add one, append to the `views` prop (GameHud builds
 * the list); `initialView` opens straight into a view by id.
 *
 *   <PauseMenu views={[{ id: 'hud', label: 'HUD', wide: true, render: ({ back }) => <HudPauseView … /> }]} … />
 */
'use client';

import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import type { HudGame } from '@/lib/tf2-game/client/hud-state';
import type { GameSettings } from '@/lib/tf2-game/client/settings';
import { Btn, Modal } from '../../tf2-hud/ui';
import OptionsDialog from '../menus/OptionsDialog';
import type { OptionsTab } from '@/lib/tf2-game/client/menus/options';
import { useMenuSource } from '../menus/use-menu-source';
import { useGameSkin } from '../menus/use-game-skin';

/** One view of the pause menu. */
export interface PauseView {
  id: string;
  /** The main menu's button and the view's title. */
  label: string;
  /** A wide dialog (settings, pickers). */
  wide?: boolean;
  /** Leave it off the main menu (reachable through `initialView` only). */
  hidden?: boolean;
  /** The view's body. */
  render?: (ctx: { back: () => void; close: () => void }) => ReactNode;
  /** A main-menu button that does something instead of opening a view (it closes the menu itself). */
  action?: () => void;
}

/** The id of the main menu (the list of views). */
export const PAUSE_MENU = 'menu';

export default function PauseMenu({
  open,
  game,
  settings,
  onSettings,
  onResume,
  onChangeTeam,
  onChangeClass,
  onDisconnect,
  views: extraViews = [],
  initialView = PAUSE_MENU,
  onBackToMenu,
}: {
  open: boolean;
  game: HudGame;
  settings: GameSettings;
  onSettings: (next: GameSettings) => void;
  onResume: () => void;
  onChangeTeam?: () => void;
  onChangeClass?: () => void;
  onDisconnect: () => void;
  /** Views the game adds after Options, in order. */
  views?: readonly PauseView[];
  /** `menu`, `settings`, `advanced` (Options → Multiplayer → Advanced), or the id of one of `views`. */
  initialView?: string;
  /** A view's Back goes to the game's own Esc menu (TF2) instead of this dialog's list. */
  onBackToMenu?: () => void;
}) {
  const { t } = useTranslation('c-tf2-game');
  const source = useMenuSource(game);
  const skin = useGameSkin(game);
  const { data: session } = useSession();
  const accountName = (session as { user?: { name?: string | null } } | null)?.user?.name ?? null;
  // `settings:<tab>` opens Options on that tab (Keyboard, Mouse, …).
  const tabView = /^settings:(\w+)$/.exec(initialView)?.[1] as OptionsTab | undefined;
  const options = (advanced: boolean, tab?: OptionsTab) => (
    <OptionsDialog
      game={game}
      settings={settings}
      onChange={onSettings}
      source={source}
      accountName={accountName}
      initialTab={tab ?? (advanced ? 'multiplayer' : 'keyboard')}
      initialAdvanced={advanced}
    />
  );
  const views: PauseView[] = [
    { id: 'settings', label: t('settings', { defaultValue: 'Options' }), wide: true, render: () => options(false) },
    { id: 'advanced', label: t('settings', { defaultValue: 'Options' }), wide: true, hidden: true, render: () => options(true) },
    ...(tabView
      ? [{ id: `settings:${tabView}`, label: t('settings', { defaultValue: 'Options' }), wide: true, hidden: true, render: () => options(false, tabView) }]
      : []),
    ...extraViews,
  ];
  const [viewId, setViewId] = useState<string>(initialView);
  const view = views.find((v) => v.id === viewId && v.render);
  const back = () => (onBackToMenu ? onBackToMenu() : setViewId(PAUSE_MENU));
  const title = view ? view.label : t('paused', { defaultValue: 'Paused' });
  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setViewId(PAUSE_MENU);
          onResume();
        }
      }}
      title={title}
      wide={view?.wide}
      // Back sits in the title row: a landscape phone keeps the height for the view itself.
      onBack={view ? back : undefined}
      backLabel={t('back', { defaultValue: 'Back' })}
      skin={skin}
    >
      {view ? (
        view.render?.({ back, close: onResume })
      ) : (
        <div className="flex flex-col gap-2">
          <Btn size="md" variant="primary" onClick={onResume}>
            {t('resume', { defaultValue: 'Resume game' })}
          </Btn>
          {views
            .filter((v) => !v.hidden)
            .map((v) => (
              <Btn key={v.id} size="md" onClick={() => (v.action ? v.action() : setViewId(v.id))}>
                {v.label}
              </Btn>
            ))}
          {onChangeTeam ? (
            <Btn size="md" onClick={onChangeTeam}>
              {t('change_team', { defaultValue: 'Change team' })}
            </Btn>
          ) : null}
          {onChangeClass ? (
            <Btn size="md" onClick={onChangeClass}>
              {t('change_class', { defaultValue: 'Change class' })}
            </Btn>
          ) : null}
          <Btn size="md" variant="danger" onClick={onDisconnect}>
            {game === 'tf2' ? t('disconnect', { defaultValue: 'Disconnect' }) : t('quit_game', { defaultValue: 'Quit game' })}
          </Btn>
        </div>
      )}
    </Modal>
  );
}
