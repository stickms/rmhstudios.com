/**
 * The HUD harness page: renders `HudPreview` for the scenario in the query
 * string (?s=soldierCp&menu=class&scores=1&touch=1). Not part of the app.
 */
import { createRoot } from 'react-dom/client';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import HudPreview from '@/components/tf2-game/preview/HudPreview';
import type { HudMenu } from '@/components/tf2-game/GameHud';
import type { ScenarioName } from '@/components/tf2-game/preview/sample-states';
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
        : menuParam === 'pause' || menuParam === 'settings'
          ? { kind: 'pause', view: menuParam === 'settings' ? 'settings' : 'menu' }
          : undefined;

void i18next
  .use(initReactI18next)
  .init({ lng: 'en', fallbackLng: 'en', resources: {}, interpolation: { escapeValue: false } })
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <HudPreview
        scenario={(q.get('s') ?? 'soldierCp') as ScenarioName}
        menu={menu}
        scores={q.get('scores') === '1'}
        touch={q.has('touch') ? q.get('touch') === '1' : undefined}
      />,
    );
  });
