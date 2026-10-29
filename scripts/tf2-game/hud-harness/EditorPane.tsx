/**
 * The HUD editor's preview pipeline for a HUD and a game state, for the
 * harness's side-by-side shots (not part of the app): what Preview.tsx does —
 * `buildScene` with the editor's own test-state logic (`varsFromState`,
 * `gateFor`, `progressFor`) and `paintScene` — on the files the game shows
 * for that state, laid out at the pane's size.
 */
import { useEffect, useRef } from 'react';
import { varsFromState } from '@/lib/tf2-hud/fixtures';
import { gateFor, progressFor } from '@/lib/tf2-hud/game-state';
import { buildScene } from '@/lib/tf2-hud/scene/build';
import { paintScene } from '@/lib/tf2-hud/scene/paint';
import { toTestState } from '@/lib/tf2-game/client/custom-hud/adapter';
import { inGameFiles } from '@/lib/tf2-game/client/custom-hud/bindings';
import type { PreparedHud } from '@/lib/tf2-game/client/custom-hud/renderer';
import type { HudState } from '@/lib/tf2-game/client/hud-state';

export default function EditorPane({
  hud,
  state,
  w,
  h,
  files,
}: {
  hud: PreparedHud;
  state: HudState;
  w: number;
  h: number;
  /** The files to preview (a menu's file); default: the in-game HUD's files for the state. */
  files?: readonly string[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const test = toTestState(state);
    const draw = () => {
      const scene = buildScene(
        {
          readText: hud.files.readText,

          scheme: hud.source.scheme,
          env: hud.source.env,
          screen: { w, h },
          minmode: false,
          showHidden: false,
          forceShown: new Set(),
          forceHidden: new Set(),
          vars: varsFromState(test),
          strings: hud.source.strings,
          progress: test.progress / 100,
          gate: gateFor(test),
          progressFor: progressFor(test),
          player: { playerClass: test.playerClass, team: test.team },
        },
        files ?? inGameFiles(state, test, { buildings: hud.drawsBuildings }),
      );
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext('2d');
      if (!g) return;
      g.clearRect(0, 0, w, h);
      paintScene(g, scene, { images: hud.images });
    };
    draw();
    const prev = hud.onImage;
    hud.onImage = () => {
      prev?.();
      draw();
    };
    return () => {
      hud.onImage = prev;
    };
  }, [hud, state, w, h, files]);
  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', inset: 0, width: w, height: h }}
      aria-hidden="true"
    />
  );
}
