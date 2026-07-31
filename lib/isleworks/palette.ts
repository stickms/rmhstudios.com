/**
 * Isleworks — the colour system.
 *
 * One list, read by both the 3D scene (as hex passed to `THREE.Color`) and the
 * HUD (as CSS custom properties, written out by `isleworks.css`). Keeping them
 * in the same file is the whole point: the palette card for a factory and the
 * roof of that factory are the same mustard, and they stay that way because
 * neither side owns a second copy of the value.
 *
 * The brief is a pastel diorama, so every colour here is desaturated toward
 * white rather than toward grey — pastels read as "toy", greyed colours read as
 * "washed out". Nothing is pure black; the darkest ink is a blue-slate.
 */

import type { BuildingCategory, TerrainType } from './types';

export const TERRAIN_COLORS: Record<TerrainType, string> = {
  grass: '#a8dfa4',
  sand: '#f2e1b3',
  water: '#7fc9e8',
  forest: '#7ec98c',
  rock: '#c3c6d4',
  snow: '#f2f6fb',
};

/** The side face of each tile — a shade down, so the plate reads as solid. */
export const TERRAIN_SIDE_COLORS: Record<TerrainType, string> = {
  grass: '#8ac388',
  sand: '#d8c393',
  water: '#63aecd',
  forest: '#69ac76',
  rock: '#a6a9b8',
  snow: '#d6dee9',
};

/** Category accents — the palette cards, the ghost tint, the map legend. */
export const CATEGORY_COLORS: Record<BuildingCategory, string> = {
  residential: '#ff9f9b',
  commercial: '#6fc6f0',
  industrial: '#e8b45c',
  civic: '#b6a4f0',
  utility: '#8fd8c4',
  transport: '#93a3c4',
  recreation: '#6fd39a',
  decoration: '#f0c9a0',
};

/** Shared material colours used across the building models. */
export const MAT = {
  /* Residential */
  wallCream: '#fdf1e0',
  wallCoral: '#ff9f9b',
  wallPink: '#f7bcd4',
  wallRose: '#f2a3a0',
  roofRed: '#e2685f',
  roofTerracotta: '#e88b6a',
  roofPlum: '#a86e8f',

  /* Commercial */
  glassCyan: '#8fdcf5',
  glassBlue: '#6fb5e8',
  wallLavender: '#c9c2f2',
  wallIce: '#e6f4fb',
  awning: '#f27e7e',

  /* Industrial */
  wallMustard: '#e8c063',
  wallOchre: '#d99b4e',
  wallBrown: '#a8825f',
  metalGrey: '#9aa1b0',
  metalDark: '#6d7488',

  /* Civic */
  wallViolet: '#b6a4f0',
  wallWhite: '#fbfcff',
  roofSlate: '#7b87a8',
  accentGold: '#f5c96b',

  /* Nature */
  leafLight: '#7fd18e',
  leafDeep: '#4fae6c',
  leafTeal: '#5cc4a8',
  trunk: '#a9764f',
  flowerPink: '#f79ec4',
  flowerYellow: '#ffd76b',

  /* Infrastructure */
  asphalt: '#7e879c',
  asphaltDark: '#69728a',
  roadLine: '#f4f7fb',
  concrete: '#d5dae5',
  water: '#7fc9e8',

  /* Utility */
  turbineWhite: '#f4f8fd',
  solarBlue: '#5f80c8',
  tankTeal: '#67c3b6',
  pipeSteel: '#b7bfcf',

  /* Signals */
  warm: '#f9a45c',
  danger: '#ef7370',
  good: '#5ecfa2',
  window: '#ffe9a8',
  windowDark: '#8fa8c4',
} as const;

/** Sky / staging colours. Dusk and night are lerped toward from `day`. */
export const SKY = {
  day: '#bfe6f7',
  dusk: '#f7c7b8',
  night: '#243a63',
  voidTop: '#cdeafa',
  voidBottom: '#8ecbe8',
  ocean: '#6fbfe3',
  oceanDeep: '#3f92bd',
  sun: '#fff4dc',
  moon: '#c9d9ff',
} as const;

/** Citizens are dressed from this list so a crowd reads as many small people. */
export const CITIZEN_COLORS = [
  '#ff9f9b',
  '#6fc6f0',
  '#f5c96b',
  '#b6a4f0',
  '#6fd39a',
  '#f79ec4',
  '#8fd8c4',
  '#f27e7e',
] as const;

/** Car bodies. Deliberately brighter than buildings so motion catches the eye. */
export const VEHICLE_COLORS = [
  '#ef7370',
  '#5fa8e8',
  '#f5c96b',
  '#fbfcff',
  '#7fd18e',
  '#c9a3f2',
] as const;
