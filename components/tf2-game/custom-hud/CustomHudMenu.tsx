/**
 * A menu drawn from the custom HUD's own file, as TF2 draws it: the scoreboard
 * (`scoreboard.res`), team select (`teammenu.res`) or class select
 * (`classselection.res`) — used in place of the game's own menu only when the
 * selected HUD ships that file (`PreparedHud.menus`).
 *
 * The panels come from the HUD editor's scene builder and painter
 * (lib/tf2-game/client/custom-hud/menus.ts) on one canvas, so the menu looks
 * exactly as the editor previews it, with the live game's numbers in it. The
 * canvas is decoration for assistive tech; over it lies a layer of real,
 * transparent buttons exactly where the HUD's buttons are: mouse, touch,
 * keyboard (Tab / arrows / Enter, and the number keys GameHud handles) and
 * gamepad (`useMenuNav`) all work, and each button is named for screen
 * readers. Hovering or focusing one arms it (its armed colours and, in the
 * class menu, the team-coloured picture) like the game's buttons.
 *
 * Painting happens when the menu's inputs change (a menu is open for seconds,
 * and rebuilding it costs a few ms) and when a texture arrives — no frame loop.
 */
'use client';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { gameSurfaceDpr } from '@/lib/display-scale';
import { paintScene } from '@/lib/tf2-hud/scene/paint';
import type { Scene } from '@/lib/tf2-hud/scene/types';
import { withFallbackTokens, type PreparedHud } from '@/lib/tf2-game/client/custom-hud/renderer';
import {
  buildMenu,
  classPortraitFor,
  type HudMenuKind,
  type MenuAction,
  type MenuTarget,
} from '@/lib/tf2-game/client/custom-hud/menus';
import type { HudState } from '@/lib/tf2-game/client/hud-state';
import { CLASS_NAMES } from '@/lib/tf2-game/core/constants';
import { useMenuNav } from '../menu-nav';
import { useClassNames, useTeamNames } from '../strings';
import { NO_INSETS, safeScreen, useHudContext } from '../use-hud';
import Scoreboard from '../tf2/Scoreboard';

/** What the menu's inputs are, as a string: the menu is rebuilt only when it changes. */
function inputKey(kind: HudMenuKind, state: HudState, team: number | undefined): string {
  const m = state.match;
  const l = state.local;
  const rows = state.scoreboard
    .map(
      (r) =>
        `${r.id}:${r.name}:${r.team}:${r.cls}:${r.score}:${r.kills}:${r.deaths}:${r.assists}:${r.ping}:${+r.dead}:${+r.bot}:${+r.dominated}:${+r.nemesis}`,
    )
    .join('|');
  const clock = m.timer ? Math.ceil(m.timer.remaining) : -1;
  return [
    kind,
    team,
    l?.team,
    l?.cls,
    l?.name,
    m.map,
    m.redScore,
    m.blueScore,
    m.redFlagCaps,
    m.blueFlagCaps,
    m.mode,
    clock,
    rows,
  ].join('\u0001');
}

/** The scene with stand-ins where a class button's own picture is missing (see `classPortraitFor`). */
function withPortraits(scene: Scene, hud: PreparedHud, team: number): Scene {
  let changed = false;
  const nodes = scene.nodes.map((n) => {
    let ops = n.ops;
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      if (op.t !== 'image' || hud.images.get(op.path) !== null) continue;
      const stand = classPortraitFor(op.path, team);
      if (!stand) continue;
      if (ops === n.ops) ops = [...n.ops];
      ops[i] = { ...op, path: stand, native: false };
      changed = true;
    }
    return ops === n.ops ? n : { ...n, ops };
  });
  return changed ? { ...scene, nodes } : scene;
}

export default function CustomHudMenu({
  hud,
  kind,
  state,
  team,
  fallbackTokens,
  onAction,
  onClose,
}: {
  hud: PreparedHud;
  kind: HudMenuKind;
  state: HudState;
  /** The class menu's team. */
  team?: number;
  /** The game's built-in stand-ins for `#Token`s no file defines. */
  fallbackTokens: ReadonlyMap<string, string>;
  onAction: (action: MenuAction) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('c-tf2-game');
  const teams = useTeamNames();
  const classNames = useClassNames();
  const { screen, safe = NO_INSETS } = useHudContext();
  const inner = safeScreen(screen, safe);
  const menuScreen = useMemo(
    () => ({ w: Math.round(inner.w), h: Math.round(inner.h) }),
    [inner.w, inner.h],
  );
  const [hover, setHover] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [images, imageArrived] = useReducer((n: number) => n + 1, 0);
  const interactive = kind !== 'scoreboard';

  const source = useMemo(
    () => withFallbackTokens(hud.source, fallbackTokens),
    [hud, fallbackTokens],
  );
  const key = inputKey(kind, state, team);
  const stateRef = useRef(state);
  stateRef.current = state;
  const built = useMemo(
    () => buildMenu({ kind, state: stateRef.current, source, screen: menuScreen, hover, team }),
    // `key` stands for the parts of `state` the menu reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, key, source, menuScreen, hover, team],
  );

  // A texture the menu names arrived: paint again.
  useEffect(() => {
    hud.imageListeners.add(imageArrived);
    return () => {
      hud.imageListeners.delete(imageArrived);
    };
  }, [hud]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = gameSurfaceDpr(window);
    const w = Math.round(menuScreen.w * dpr);
    const h = Math.round(menuScreen.h * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scene = kind === 'class' ? withPortraits(built.scene, hud, team ?? 2) : built.scene;
    // Run-time content (3D models, avatars) has no stand-in box in game, and missing textures draw nothing.
    paintScene(g, scene, { images: hud.images, skipDynamic: () => true, hideMissing: true });
  }, [built, hud, kind, team, menuScreen, images]);

  useMenuNav(rootRef, interactive, onClose, { grid: true });

  const label = (target: MenuTarget): string => {
    const a = target.action;
    if (a.kind === 'team')
      return a.team === 'blue'
        ? teams[3]
        : a.team === 'red'
          ? teams[2]
          : a.team === 'spectator'
            ? teams[1]
            : t('team_auto', { defaultValue: 'Auto-assign' });
    if (a.kind === 'class')
      return classNames[a.cls === 'random' ? 0 : CLASS_NAMES.indexOf(a.cls)] ?? '';
    if (a.kind === 'loadout') return t('loadout', { defaultValue: 'Loadout' });
    return t('menu_close', { defaultValue: 'Close' });
  };
  const count = (target: MenuTarget): number | null => {
    const a = target.action;
    if (a.kind === 'class' && a.cls !== 'random') {
      const cls = CLASS_NAMES.indexOf(a.cls);
      return state.scoreboard.filter((r) => r.team === team && r.cls === cls).length;
    }
    if (a.kind === 'team' && (a.team === 'blue' || a.team === 'red')) {
      const tm = a.team === 'blue' ? 3 : 2;
      return state.scoreboard.filter((r) => r.team === tm).length;
    }
    return null;
  };

  const frame: CSSProperties = {
    top: safe.top,
    left: safe.left,
    width: menuScreen.w,
    height: menuScreen.h,
  };
  const title =
    kind === 'team'
      ? t('team_menu', { defaultValue: 'Choose a team' })
      : kind === 'class'
        ? t('class_menu', { defaultValue: 'Choose a class' })
        : t('scores_title', { defaultValue: 'Scoreboard' });

  return (
    <div
      ref={rootRef}
      className="tf2g-custom-menu"
      data-kind={kind}
      data-hud={hud.hud.meta.name}
      role={interactive ? 'region' : undefined}
      aria-label={interactive ? title : undefined}
    >
      {/* The HUD's own menus draw their backdrop (a 3D room in TF2); a dim stands in for the world behind. */}
      <div className="tf2g-dim" aria-hidden="true" />
      <canvas
        ref={canvasRef}
        className="tf2g-custom-menu-canvas"
        style={frame}
        aria-hidden="true"
      />
      {interactive ? (
        <div className="tf2g-custom-menu-hits" style={frame}>
          {built.targets.map((target) => {
            const n = count(target);
            const name = label(target);
            // Named on screen where the HUD's picture is missing, and on the team doors (their 3D models are not drawn).
            const missing = target.image
              ? hud.images.get(target.image) === null && !classPortraitFor(target.image, team ?? 2)
              : target.action.kind === 'team';
            return (
              <button
                key={target.id}
                type="button"
                className="tf2g-custom-menu-btn"
                data-menu-item
                data-current={target.current}
                data-missing={missing ? true : undefined}
                aria-current={target.current ? 'true' : undefined}
                aria-label={n !== null ? `${name} (${n})` : name}
                aria-keyshortcuts={target.hotkey !== undefined ? String(target.hotkey) : undefined}
                style={{
                  left: target.rect.x,
                  top: target.rect.y,
                  width: target.rect.w,
                  height: target.rect.h,
                }}
                onClick={() => onAction(target.action)}
                onPointerEnter={() => setHover(target.name)}
                onPointerLeave={() => setHover((h) => (h === target.name ? null : h))}
                onFocus={() => setHover(target.name)}
                onBlur={() => setHover((h) => (h === target.name ? null : h))}
              >
                {/* Shown only where the HUD's picture for this button is missing (CSS), so it still reads. */}
                <span aria-hidden="true">{name}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="tf2g-select-close"
            aria-label={t('menu_close', { defaultValue: 'Close' })}
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      ) : (
        // The scoreboard's numbers, for screen readers (the canvas is a picture of them).
        <div className="sr-only">
          <Scoreboard
            rows={state.scoreboard}
            match={state.match}
            localTeam={state.local?.team ?? 0}
          />
        </div>
      )}
    </div>
  );
}
