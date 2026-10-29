/**
 * Renders the real builder player (PlayerScene) with models converted from a game install, so a screenshot
 * shows what the viewer does with them. Loaded by render.mjs with ?cfg=<json>:
 *   { body: "/class_scout.glb", bodygroups: {hat: 1}, parts: [{ key, url, cls }], width, height }
 */
import { createRoot } from 'react-dom/client';
import PlayerScene from '@/components/tf2-hud/loadout/PlayerScene';

interface Config {
  body: string;
  bodygroups: Record<string, number>;
  parts: { key: string; url: string; cls?: string }[];
  width: number;
  height: number;
}

const cfg = JSON.parse(new URLSearchParams(location.search).get('cfg') ?? '{}') as Config;
const el = document.getElementById('root')!;
el.style.cssText = `width:${cfg.width}px;height:${cfg.height}px;background:#1d1b19`;
createRoot(el).render(
  <PlayerScene body={cfg.body} bodygroups={cfg.bodygroups} parts={cfg.parts} />,
);
// PlayerScene gives no "loaded" signal: the harness waits on the canvas and then lets the idle animation run.
(window as unknown as { __started: boolean }).__started = true;
