/**
 * The HUD harness page: renders `HudPreview` for the scenario in the query
 * string (?s=soldierCp&menu=class&scores=1&touch=1). Not part of the app.
 *
 * `&hud=moved|fonts|base` draws that custom HUD (custom-huds.ts; `base` is the
 * TF2 Default through the custom-HUD pipeline); `&compare=1` puts the game's
 * HUD (left) next to the HUD editor's preview pipeline for the same HUD and
 * state (right), both laid out at 960×540. `&editor=1` opens the in-game HUD
 * editor over the game (inside a memory router, as the editor needs one). `&menu=pause` is TF2's Esc
 * menu (the HUD's mainmenuoverride.res), `settings` / `advanced` / `loadout` / `hud` its views;
 * `?view=mainmenu` is /tf2/play's main menu (menus/Tf2MainMenu). See api.ts for the game's files.
 */
import { createRoot } from 'react-dom/client';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import HudPreview from '@/components/tf2-game/preview/HudPreview';
import type { HudMenu } from '@/components/tf2-game/GameHud';
import { SCENARIOS, type ScenarioName } from '@/components/tf2-game/preview/sample-states';
import { useHudChoice } from '@/components/tf2-game/custom-hud/hud-choice';
import { harnessHud } from './custom-huds';
import EditorPane from './EditorPane';
import Tf2MainMenu from '@/components/tf2-game/menus/Tf2MainMenu';
import { MENU_FILES, SPECTATOR_FILE } from '@/lib/tf2-game/client/custom-hud/menus';
import './harness.css';

const q = new URLSearchParams(location.search);
const menuParam = q.get('menu');
const menu: HudMenu | undefined =
  menuParam === 'class' || menuParam === 'team'
    ? { kind: menuParam }
    : menuParam === 'voice'
      ? { kind: 'voice', menu: 0 }
      : menuParam === 'chat'
        ? { kind: 'chat', team: true }
        : menuParam === 'pause' || menuParam === 'settings' || menuParam === 'hud' || menuParam === 'advanced' || menuParam === 'loadout' || menuParam?.startsWith('settings:')
          ? { kind: 'pause', view: menuParam === 'pause' ? 'menu' : menuParam! }
          : undefined;

const scenario = (q.get('s') ?? 'soldierCp') as ScenarioName;
const hudId = q.get('hud');
const compare = q.get('compare') === '1';
const editor = q.get('editor') === '1';
/** `&compare=1` with a menu: the editor's preview of that menu's file (or the spectator GUI's). */
const editorFiles: readonly string[] | undefined =
  q.get('scores') === '1'
    ? [MENU_FILES.scoreboard]
    : menuParam === 'team' || menuParam === 'class'
      ? [MENU_FILES[menuParam]]
      : scenario === 'joinClass'
        ? [MENU_FILES.class]
        : scenario === 'spectating'
          ? [SPECTATOR_FILE]
          : undefined;

async function main(): Promise<void> {
  await i18next
    .use(initReactI18next)
    .init({ lng: 'en', fallbackLng: 'en', resources: {}, interpolation: { escapeValue: false } });
  if (hudId) {
    const loaded = await harnessHud(hudId);
    if (loaded) await useHudChoice.getState().apply(loaded, { persist: false });
  }
  const root = createRoot(document.getElementById('root')!);
  if (q.get('view') === 'mainmenu') {
    const router = createRouter({
      routeTree: createRootRoute({
        component: () => (
          <div className="app-theme tf2hud-theme" style={{ minHeight: '100%' }}>
            <Tf2MainMenu onStart={() => {}} />
          </div>
        ),
      }),
      history: createMemoryHistory({ initialEntries: ['/tf2/play'] }),
    });
    root.render(<RouterProvider router={router} />);
    return;
  }
  const preview = (
    <HudPreview
      scenario={scenario}
      menu={menu}
      scores={q.get('scores') === '1'}
      touch={q.has('touch') ? q.get('touch') === '1' : undefined}
    />
  );
  const active = useHudChoice.getState().active;
  if (editor) {
    useHudChoice.getState().setEditorOpen(true);
    const router = createRouter({
      routeTree: createRootRoute({
        component: () => (
          <div className="app-theme tf2hud-theme" style={{ width: '100%', height: '100%' }}>
            {preview}
          </div>
        ),
      }),
      history: createMemoryHistory({ initialEntries: ['/tf2/play'] }),
    });
    root.render(<RouterProvider router={router} />);
    return;
  }
  if (!compare || !active) {
    root.render(preview);
    return;
  }
  const W = 960;
  const H = 540;
  const label = {
    position: 'absolute',
    top: 4,
    left: 8,
    color: '#ff0',
    font: '13px monospace',
    zIndex: 100,
  } as const;
  root.render(
    <div style={{ display: 'flex', gap: 0, background: '#000', width: W * 2, height: H }}>
      <div style={{ position: 'relative', width: W, height: H }}>
        <div style={{ position: 'relative', width: W, height: H }}>{preview}</div>
        <span style={label}>game · {active.hud.meta.name}</span>
      </div>
      <div style={{ position: 'relative', width: W, height: H }}>
        <div
          className="tf2hud-backdrop-game"
          style={{ position: 'relative', width: W, height: H, overflow: 'hidden' }}
        >
          <EditorPane hud={active} state={SCENARIOS[scenario]()} w={W} h={H} files={editorFiles} />
        </div>
        <span style={label}>editor preview pipeline</span>
      </div>
    </div>,
  );
}

void main();
