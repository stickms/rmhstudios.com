/**
 * TF2's main menu / in-game (Esc) menu as the game draws it: the screen built from the HUD's
 * mainmenuoverride.res and gamemenu.res (lib/tf2-game/client/menus/game-menu.ts, the HUD editor's scene
 * builder and painter) on one canvas, and over it a layer of real, transparent buttons exactly where
 * the file's buttons are — mouse, touch, Tab / arrow keys / Enter and the gamepad all work, and each
 * is named for screen readers. Hovering or focusing a button arms it (its `armed` colours, border and
 * picture colour), as in the game.
 *
 * Where the file's buttons would be smaller than a finger (a phone: a 26-unit button is ~21 px on a
 * landscape phone), or before the game's files are there, the screen keeps the file's background and
 * art and lists the entries as 44 px buttons of its own, in the same order and words.
 */
'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { detectTouchFirst } from '@/lib/tf2-game/client/input/touch';
import {
  backgroundImage,
  buildGameMenu,
  CHAPTER_BACKGROUNDS_FILE,
  CHARACTER_BACKGROUNDS_FILE,
  DEFAULT_BACKGROUND,
  parseChapterBackgrounds,
  parseCharacterBackgrounds,
  type MenuCommand,
  type MenuEntry,
} from '@/lib/tf2-game/client/menus/game-menu';
import type { MenuSource } from '@/lib/tf2-game/client/menus/source';
import { cn } from '@/lib/utils';
import { moveFocus } from '../menu-nav';
import MenuCanvas from './MenuCanvas';
import { gameText } from './use-menu-source';
import './menus.css';

const subscribeNoop = () => () => {};
/** The smallest tap target (phone-check). */
const TOUCH_TARGET = 44;

/** One of the game's console backgrounds and character pictures, picked once per page (TF2 picks at random). */
const pick = Math.random();
const pickOf = <T,>(list: readonly T[]): T | undefined => (list.length ? list[Math.floor(pick * list.length) % list.length] : undefined);

export interface GameMenuProps {
  source: MenuSource | null;
  inGame: boolean;
  entries: readonly MenuEntry[];
  onCommand: (command: MenuCommand) => void;
  /** Escape / the gamepad's B (the Esc menu: resume). */
  onBack?: () => void;
  /** The menu's accessible name. */
  title: string;
  /** In game: the match's impulses (the gamepad's d-pad / A / B arrive through the HUD store). */
  subscribeImpulses?: (fn: (action: string) => void) => () => void;
  className?: string;
}

export default function GameMenu({ source, inGame, entries, onCommand, onBack, title, subscribeImpulses, className }: GameMenuProps) {
  const { t } = useTranslation('c-tf2-game');
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<{ w: number; h: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const touch = useSyncExternalStore(subscribeNoop, detectTouchFirst, () => false);
  // A texture arrived (or turned out missing): the plain-panel stand-ins and the icon labels follow.
  const [images, imageArrived] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!source) return undefined;
    source.imageListeners.add(imageArrived);
    return () => {
      source.imageListeners.delete(imageArrived);
    };
  }, [source]);
  const hasImage = useCallback(
    (path: string): boolean | undefined => {
      const tex = source?.images.get(path);
      return tex === undefined ? undefined : tex !== null;
    },
    // `images` re-creates it when a texture arrives, so the menu is rebuilt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, images],
  );

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const measure = () => {
      const w = Math.round(el.clientWidth);
      const h = Math.round(el.clientHeight);
      setScreen((cur) => (cur && cur.w === w && cur.h === h ? cur : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The game's backgrounds (scripts/chapterbackgrounds.txt) and characters (characterbackgrounds.txt).
  const art = useMemo(() => {
    const read = source?.source.readText;
    return {
      background: pickOf(parseChapterBackgrounds(read?.(CHAPTER_BACKGROUNDS_FILE))) ?? DEFAULT_BACKGROUND,
      character: pickOf(parseCharacterBackgrounds(read?.(CHARACTER_BACKGROUNDS_FILE))),
    };
  }, [source]);

  const full = useMemo(() => {
    if (!source || !screen || screen.w < 2 || screen.h < 2) return null;
    return buildGameMenu({
      source: source.source,
      screen,
      inGame,
      entries,
      hover,
      background: !inGame && art.background ? backgroundImage(art.background, screen) : null,
      character: !inGame && art.character ? art.character : null,
      hasImage,
    });
  }, [source, screen, inGame, entries, hover, art, hasImage]);
  // A finger needs 44 px: below that the file's screen is the backdrop and the entries are listed.
  const compact = !full || (touch && full.buttonTall < TOUCH_TARGET) || full.targets.some((x) => x.rect.x < 0 || x.rect.x + x.rect.w > (screen?.w ?? 0));
  const backdrop = useMemo(() => {
    if (!compact || !source || !screen || screen.w < 2) return null;
    return buildGameMenu({
      source: source.source,
      screen,
      inGame,
      entries,
      compact: true,
      background: !inGame && art.background ? backgroundImage(art.background, screen) : null,
      character: null,
    });
  }, [compact, source, screen, inGame, entries, art]);
  const scene = compact ? backdrop?.scene : full?.scene;

  // Focus the first entry when the menu opens (keyboard and gamepad start there).
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current || !rootRef.current) return;
    const first = rootRef.current.querySelector<HTMLElement>('[data-menu-item]');
    if (first) {
      first.focus({ preventScroll: true });
      focused.current = true;
    }
  });

  const handleNav = useCallback(
    (key: string): boolean => {
      const root = rootRef.current;
      if (!root) return false;
      if (key === 'ArrowDown' || key === 'ArrowRight' || key === 'menu_down' || key === 'menu_right') moveFocus(root, 1);
      else if (key === 'ArrowUp' || key === 'ArrowLeft' || key === 'menu_up' || key === 'menu_left') moveFocus(root, -1);
      else if (key === 'menu_accept') {
        const el = document.activeElement as HTMLElement | null;
        if (el && root.contains(el)) el.click();
      } else if ((key === 'Escape' || key === 'menu_back') && onBack) onBack();
      else return false;
      return true;
    },
    [onBack],
  );
  useEffect(() => (subscribeImpulses ? subscribeImpulses((a) => void handleNav(a)) : undefined), [subscribeImpulses, handleNav]);

  const labelOf = (e: MenuEntry): string => gameText(source, e.token, e.text);
  const missing = (image: string | undefined) => !image || source?.images.get(image) === null;

  return (
    <div
      ref={rootRef}
      className={cn('tf2m-menu', inGame && 'tf2m-menu-ingame', className)}
      data-compact={compact ? 'true' : undefined}
      role="navigation"
      aria-label={title}
      onKeyDown={(e) => {
        if (handleNav(e.key)) e.preventDefault();
      }}
    >
      <div ref={stageRef} className="tf2m-stage">
        {scene && source && screen ? (
          <MenuCanvas scene={scene} images={source.images} listeners={source.imageListeners} width={screen.w} height={screen.h} className="tf2m-canvas" />
        ) : null}
        {!compact && full
          ? full.targets.map((target) => {
              const own = entries.find((e) => e.command === target.command)?.text ?? '';
              // An icon button's file label is empty or a glyph (`+`): it is named by what it does.
              const words = /\p{L}{2,}/u.test(target.label);
              const label = words ? target.label : own;
              const named = words ? undefined : own;
              return (
                <button
                  key={target.name}
                  type="button"
                  className="tf2m-hit"
                  data-menu-item
                  data-command={target.command}
                  data-placed={target.placed ? 'true' : undefined}
                  // An icon button whose picture is missing says what it is.
                  data-missing={target.placed && !words && missing(target.image) ? 'true' : undefined}
                  aria-label={named}
                  title={named}
                  style={{ left: target.rect.x, top: target.rect.y, width: target.rect.w, height: target.rect.h }}
                  onClick={() => onCommand(target.command)}
                  onPointerEnter={() => setHover(target.name)}
                  onPointerLeave={() => setHover((h) => (h === target.name ? null : h))}
                  onFocus={() => setHover(target.name)}
                  onBlur={() => setHover((h) => (h === target.name ? null : h))}
                >
                  <span className={words ? 'sr-only' : 'tf2m-hit-name'}>{label}</span>
                </button>
              );
            })
          : null}
      </div>
      {compact ? (
        <div className="tf2m-list" data-ready={source ? 'true' : undefined}>
          {!inGame ? (
            <p className="tf2m-list-title" aria-hidden="true">
              {t('menu_game_title', { defaultValue: 'Team Fortress 2' })}
            </p>
          ) : null}
          {entries.map((e) => (
            <button key={e.command} type="button" className="tf2m-list-btn" data-menu-item data-command={e.command} onClick={() => onCommand(e.command)}>
              {labelOf(e)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
