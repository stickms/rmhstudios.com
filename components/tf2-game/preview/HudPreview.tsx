/**
 * A HUD over a stand-in backdrop, fed a sample state — for the screenshot
 * harness (scripts/tf2-game/hud-harness) and for looking at the HUD without a
 * running game. Nothing here talks to a server.
 */
'use client';

import { useMemo, useState } from 'react';
import { createHudStore } from '@/lib/tf2-game/client/hud-store';
import { createInputState } from '@/lib/tf2-game/client/input/input-state';
import { defaultSettings, type GameSettings } from '@/lib/tf2-game/client/settings';
import GameHud, { type HudMenu } from '../GameHud';
import { SCENARIOS, type ScenarioName } from './sample-states';

export default function HudPreview({
  scenario,
  menu,
  scores,
  touch,
}: {
  scenario: ScenarioName;
  menu?: HudMenu;
  scores?: boolean;
  touch?: boolean;
}) {
  const state = useMemo(() => SCENARIOS[scenario](), [scenario]);
  const store = useMemo(() => {
    const s = createHudStore({ game: state.game });
    s.publish(state, true);
    return s;
  }, [state]);
  const input = useMemo(() => createInputState(), []);
  const [settings, setSettings] = useState<GameSettings>(() => ({ ...defaultSettings(state.game), showFps: true }));
  return (
    <div className="tf2hud-backdrop-game" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <GameHud
        game={state.game}
        store={store}
        input={input}
        settings={settings}
        onSettingsChange={setSettings}
        onDisconnect={() => {}}
        initialMenu={menu}
        forceScores={scores}
        forceTouch={touch}
      />
    </div>
  );
}
