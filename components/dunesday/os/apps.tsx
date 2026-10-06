'use client';

/**
 * Every program on the Dunesday desktop: its icon, title, default window size,
 * where it appears in the Start menu, and the component that draws it.
 *
 * Components are `lazy()`: the desktop shell ships with the route, and each
 * app's code (a game, Paint, the browser) loads the first time it is opened.
 *
 * Titles are written as literal `t()` calls on purpose — i18next-parser reads
 * source, so a lookup through a key table would never be extracted.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { TFunction } from 'i18next';
import type { IconName } from './icons';
import type { AppId, Win } from './store';

export interface AppProps {
  win: Win;
}

export type StartGroup = 'pinned' | 'dunesday' | 'accessories' | 'games' | 'system' | null;

export interface AppDef {
  id: AppId;
  icon: IconName;
  title: (t: TFunction) => string;
  size: { w: number; h: number };
  minSize?: { w: number; h: number };
  resizable?: boolean;
  /** Only one window of this app at a time (the default). */
  singleton?: boolean;
  /** Content is edge-to-edge (games, browser, console) rather than padded. */
  flush?: boolean;
  start: StartGroup;
  /** Seeded as a desktop shortcut on first boot (name = English title). */
  desktop?: string;
  component: LazyExoticComponent<ComponentType<AppProps>>;
}

const L = (f: () => Promise<{ default: ComponentType<AppProps> }>) => lazy(f);

export const APPS: Record<AppId, AppDef> = {
  welcome: {
    id: 'welcome',
    flush: true,
    icon: 'welcome',
    title: (t) => t('app-welcome', { defaultValue: 'Getting Started' }),
    size: { w: 720, h: 500 },
    start: 'dunesday',
    component: L(() => import('./apps/WelcomeApp')),
  },
  planner: {
    id: 'planner',
    icon: 'planner',
    title: (t) => t('app-planner', { defaultValue: 'Dunesday Planner' }),
    size: { w: 980, h: 640 },
    minSize: { w: 420, h: 360 },
    start: 'pinned',
    desktop: 'Dunesday Planner',
    component: L(() => import('./apps/PlannerApp')),
  },
  calendar: {
    id: 'calendar',
    icon: 'calendar',
    title: (t) => t('app-calendar', { defaultValue: 'Marathon Calendar' }),
    size: { w: 860, h: 620 },
    start: 'dunesday',
    desktop: 'Marathon Calendar',
    component: L(() => import('./apps/CalendarApp')),
  },
  explorer: {
    id: 'explorer',
    icon: 'folder',
    title: (t) => t('app-explorer', { defaultValue: 'Windows Explorer' }),
    size: { w: 900, h: 580 },
    minSize: { w: 360, h: 300 },
    singleton: false,
    flush: true,
    start: 'pinned',
    component: L(() => import('./apps/ExplorerApp')),
  },
  messenger: {
    id: 'messenger',
    icon: 'messenger',
    title: (t) => t('app-messenger', { defaultValue: 'Dunesday Messenger' }),
    size: { w: 420, h: 600 },
    minSize: { w: 320, h: 420 },
    flush: true,
    start: 'pinned',
    desktop: 'Dunesday Messenger',
    component: L(() => import('./apps/MessengerApp')),
  },
  sync: {
    id: 'sync',
    icon: 'sync',
    title: (t) => t('app-sync', { defaultValue: 'Sync Center' }),
    size: { w: 760, h: 620 },
    start: 'dunesday',
    component: L(() => import('./apps/SyncApp')),
  },
  player: {
    id: 'player',
    icon: 'player',
    title: (t) => t('app-player', { defaultValue: 'Dunesday Media Player' }),
    size: { w: 760, h: 480 },
    minSize: { w: 360, h: 360 },
    flush: true,
    start: 'pinned',
    desktop: 'Tonight',
    component: L(() => import('./apps/PlayerApp')),
  },
  notepad: {
    id: 'notepad',
    icon: 'notepad',
    title: (t) => t('app-notepad', { defaultValue: 'Notepad' }),
    size: { w: 640, h: 460 },
    singleton: false,
    flush: true,
    start: 'accessories',
    component: L(() => import('./apps/NotepadApp')),
  },
  paint: {
    id: 'paint',
    icon: 'paint',
    title: (t) => t('app-paint', { defaultValue: 'Paint' }),
    size: { w: 860, h: 600 },
    minSize: { w: 360, h: 360 },
    singleton: false,
    flush: true,
    start: 'accessories',
    component: L(() => import('./apps/PaintApp')),
  },
  photos: {
    id: 'photos',
    icon: 'photos',
    title: (t) => t('app-photos', { defaultValue: 'Windows Photo Viewer' }),
    size: { w: 760, h: 560 },
    singleton: false,
    flush: true,
    start: null,
    component: L(() => import('./apps/PhotosApp')),
  },
  calculator: {
    id: 'calculator',
    icon: 'calculator',
    title: (t) => t('app-calculator', { defaultValue: 'Calculator' }),
    size: { w: 300, h: 420 },
    resizable: false,
    flush: true,
    start: 'accessories',
    component: L(() => import('./apps/CalculatorApp')),
  },
  cmd: {
    id: 'cmd',
    icon: 'cmd',
    title: (t) => t('app-cmd', { defaultValue: 'Command Prompt' }),
    size: { w: 680, h: 420 },
    singleton: false,
    flush: true,
    start: 'accessories',
    component: L(() => import('./apps/CmdApp')),
  },
  taskmgr: {
    id: 'taskmgr',
    icon: 'taskmgr',
    title: (t) => t('app-taskmgr', { defaultValue: 'Windows Task Manager' }),
    size: { w: 480, h: 460 },
    flush: true,
    start: 'system',
    component: L(() => import('./apps/TaskMgrApp')),
  },
  ie: {
    id: 'ie',
    icon: 'ie',
    title: (t) => t('app-ie', { defaultValue: 'Internet Explorer' }),
    size: { w: 1000, h: 680 },
    minSize: { w: 360, h: 320 },
    singleton: false,
    flush: true,
    start: 'pinned',
    desktop: 'Internet Explorer',
    component: L(() => import('./apps/IEApp')),
  },
  minesweeper: {
    id: 'minesweeper',
    icon: 'minesweeper',
    title: (t) => t('app-minesweeper', { defaultValue: 'Minesweeper' }),
    size: { w: 360, h: 460 },
    flush: true,
    start: 'games',
    component: L(() => import('./apps/MinesweeperApp')),
  },
  solitaire: {
    id: 'solitaire',
    icon: 'solitaire',
    title: (t) => t('app-solitaire', { defaultValue: 'Solitaire' }),
    size: { w: 820, h: 600 },
    minSize: { w: 340, h: 420 },
    flush: true,
    start: 'games',
    component: L(() => import('./apps/SolitaireApp')),
  },
  spider: {
    id: 'spider',
    icon: 'spider',
    title: (t) => t('app-spider', { defaultValue: 'Spider Solitaire' }),
    size: { w: 900, h: 620 },
    minSize: { w: 340, h: 420 },
    flush: true,
    start: 'games',
    component: L(() => import('./apps/SpiderApp')),
  },
  personalize: {
    id: 'personalize',
    flush: true,
    icon: 'personalize',
    title: (t) => t('app-personalize', { defaultValue: 'Personalization' }),
    size: { w: 760, h: 600 },
    start: 'system',
    component: L(() => import('./apps/PersonalizeApp')),
  },
  properties: {
    id: 'properties',
    flush: true,
    icon: 'film',
    title: (t) => t('app-properties', { defaultValue: 'Properties' }),
    size: { w: 400, h: 560 },
    resizable: false,
    singleton: false,
    start: null,
    component: L(() => import('./apps/PropertiesApp')),
  },
  aquarium: {
    id: 'aquarium',
    icon: 'aquarium',
    title: (t) => t('app-aquarium', { defaultValue: 'Aquarium' }),
    size: { w: 640, h: 380 },
    flush: true,
    start: 'accessories',
    component: L(() => import('./apps/AquariumApp')),
  },
  about: {
    id: 'about',
    flush: true,
    icon: 'about',
    title: (t) => t('app-about', { defaultValue: 'About Dunesday 7' }),
    size: { w: 460, h: 420 },
    resizable: false,
    start: 'system',
    component: L(() => import('./apps/AboutApp')),
  },
  run: {
    id: 'run',
    flush: true,
    icon: 'run',
    title: (t) => t('app-run', { defaultValue: 'Run' }),
    size: { w: 420, h: 220 },
    resizable: false,
    start: null,
    component: L(() => import('./apps/RunApp')),
  },
  dialog: {
    id: 'dialog',
    flush: true,
    icon: 'info',
    title: (t) => t('app-dialog', { defaultValue: 'Dunesday 7' }),
    size: { w: 400, h: 200 },
    resizable: false,
    singleton: false,
    start: null,
    component: L(() => import('./apps/DialogApp')),
  },
};

/** Shortcuts seeded onto a brand-new desktop. */
export const DESKTOP_SHORTCUTS = Object.values(APPS)
  .filter((a) => a.desktop)
  .map((a) => ({ id: a.id, name: a.desktop as string }));

/** Commands the Run box and the command prompt's `start` understand. */
export const RUN_ALIASES: Record<string, AppId> = {
  explorer: 'explorer',
  notepad: 'notepad',
  mspaint: 'paint',
  paint: 'paint',
  calc: 'calculator',
  cmd: 'cmd',
  taskmgr: 'taskmgr',
  iexplore: 'ie',
  ie: 'ie',
  winmine: 'minesweeper',
  minesweeper: 'minesweeper',
  sol: 'solitaire',
  solitaire: 'solitaire',
  spider: 'spider',
  winver: 'about',
  control: 'personalize',
  planner: 'planner',
  calendar: 'calendar',
  msn: 'messenger',
  wmplayer: 'player',
  aquarium: 'aquarium',
};
