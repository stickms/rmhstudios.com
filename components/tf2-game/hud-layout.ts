/**
 * Where each HUD panel sits, as data in the `.res` vocabulary: `xpos`/`ypos`
 * with the `r` (from the right/bottom) and `c` (from the centre) prefixes,
 * `wide`/`tall` with `f` (fill), all in the virtual 640×480 screen. The
 * defaults are the default TF2 HUD's (`scripts/hudlayout.res` and the panel
 * files in `public/tf2-hud/base`), HL2's `hudlayout.res`, and Portal's.
 *
 * A custom HUD from the HUD editor overrides entries by panel name
 * (`mergeLayout(defaults, parsedHudLayout)`), so the in-game HUD and the
 * editor's preview agree on the numbers. The resolver is the editor's own
 * (`lib/tf2-hud/layout/geometry.ts`: VGUI's proportional, integer maths).
 */

import { parseDim, resolveAxis, resolveSize } from '@/lib/tf2-hud/layout/geometry';
import type { HudGame } from '@/lib/tf2-game/client/hud-state';

export interface PanelLayout {
  xpos: string;
  ypos: string;
  wide: string;
  tall: string;
  zpos?: number;
  visible?: boolean;
}

export type HudLayout = Readonly<Record<string, PanelLayout>>;

const p = (xpos: string, ypos: string, wide: string, tall: string, zpos = 0): PanelLayout => ({
  xpos,
  ypos,
  wide,
  tall,
  zpos,
});

/** TF2's default HUD. */
export const TF2_LAYOUT: HudLayout = {
  HudPlayerClass: p('0', 'r120', '130', '120', 1),
  HudPlayerHealth: p('0', 'r120', '250', '120', 2),
  HudWeaponAmmo: p('r95', 'r55', '94', '45'),
  HudMedicCharge: p('r138', 'r69', '200', '100'),
  HudItemEffectMeter: p('r162', 'r52', '100', '50'),
  HudDemomanPipes: p('r162', 'r52', '100', '50'),
  HudDemomanCharge: p('r80', 'r21', '60', '8', 1),
  HudObjectiveStatus: p('0', '0', 'f0', 'f0'),
  HudKothTimeStatus: p('c-100', '0', '200', '160'),
  HudDeathNotice: p('r640', '18', '628', '468'),
  BuildingStatus_Engineer: p('0', '0', 'f0', 'f0'),
  DisguiseStatus: p('10', 'r70', '500', '200'),
  WinPanel: p('c-150', '215', '300', '300', 4),
  FreezePanel: p('0', '0', 'f0', 'f0'),
  HudTeamGoal: p('c-160', '65', '320', '100'),
  HudChat: p('10', '250', '320', '120'),
  HudMenu: p('10', 'c-130', '190', '200'),
  HudCrosshair: p('0', '0', 'f0', 'f0'),
  HudScope: p('0', '0', 'f0', 'f0'),
};

/** Half-Life 2's hudlayout.res. */
export const HL2_LAYOUT: HudLayout = {
  HudHealth: p('16', '432', '102', '36'),
  HudSuit: p('140', '432', '108', '36'),
  HudSuitPower: p('16', '396', '102', '26'),
  HudAmmo: p('r150', '432', '136', '36'),
  /** HudAmmo moved aside while the weapon has alt ammo (HL2's WeaponUsesSecondaryAmmo animation). */
  HudAmmoWithSecondary: p('r222', '432', '136', '36'),
  HudAmmoSecondary: p('r76', '432', '60', '36'),
  HudHistoryResource: p('r252', '40', '248', '320'),
  HudCloseCaption: p('c-250', '276', '500', '136'),
  HudCrosshair: p('0', '0', 'f0', 'f0'),
};

/** Portal: captions and the crosshair only. */
export const PORTAL_LAYOUT: HudLayout = {
  HudCloseCaption: p('c-250', '276', '500', '136'),
  HudCrosshair: p('0', '0', 'f0', 'f0'),
};

/*
 * Full-screen containers say `f0` where the .res files say 480 (the same thing on
 * a landscape screen, where VGUI's virtual height is always 480; a portrait phone
 * is taller than 480 units).
 */

/**
 * With the touch controls on, the panels the thumbs would cover move: TF2's ammo
 * and meters go top right (the fire cluster owns the bottom right) and the kill
 * feed ends left of them; HL2's suit panels go to the top edge.
 */
export const TOUCH_OVERRIDES: Readonly<Record<HudGame, Readonly<Record<string, Partial<PanelLayout>>>>> = {
  tf2: {
    HudWeaponAmmo: { xpos: 'r95', ypos: '80' },
    // The kill feed starts under the touch controls' top row (44px at y 8, clear for any unit ≥ 0.75px) and
    // stops left of that ammo column (its lines are right-aligned), so a long feed runs under neither.
    HudDeathNotice: { ypos: '70', wide: '530' },
    HudMedicCharge: { xpos: 'r138', ypos: '118' },
    HudItemEffectMeter: { xpos: 'r104', ypos: '128' },
    HudDemomanPipes: { xpos: 'r104', ypos: '128' },
    HudDemomanCharge: { xpos: 'r80', ypos: '114' },
    // The objective strip (points, flags, cart) rides above the thumbs.
    HudObjectiveStatus: { tall: 'f90' },
  },
  hl2: {
    HudHealth: { ypos: '10' },
    HudSuit: { ypos: '10' },
    HudSuitPower: { ypos: '50' },
    HudAmmo: { ypos: '10' },
    HudAmmoWithSecondary: { ypos: '10' },
    HudAmmoSecondary: { ypos: '10' },
    HudHistoryResource: { ypos: '60' },
  },
  portal: {},
  // CS:GO draws its own HUD (no .res panels to move).
  csgo: {},
};

/**
 * The touch layout for this screen.
 *
 * Portrait: the thumb controls take the bottom ~240 CSS px (TouchOverlay's fire / jump / alt-fire
 * cluster), far more of the height in HUD units than in landscape, so the bottom-centre objective
 * strip (flags, points, cart) rides above them.
 *
 * Landscape: the touch controls' top row (scores, chat, voice, menu, …) runs along the top from the
 * left, and the cluster fills the bottom right — on a phone both reach the middle of the screen. The
 * objective panel (the round timer at its top, the strip at its bottom) and the KOTH clocks take the
 * area left of the cluster and below the row instead, and the team-goal banner drops below the row.
 */
export function touchOverrides(game: HudGame, screen: HudScreen, buttonScale = 1): Readonly<Record<string, Partial<PanelLayout>>> {
  const base = TOUCH_OVERRIDES[game];
  if (game !== 'tf2') return base;
  const u = hudScale(screen);
  if (screen.h > screen.w) {
    const units = Math.ceil((TOUCH_THUMB_CLUSTER_PX * buttonScale) / u) + 10;
    return {
      ...base,
      HudObjectiveStatus: { tall: `f${units}` },
      // Portrait is narrower than the feed's 628 units: it spans the screen up to the ammo column instead.
      HudDeathNotice: { xpos: '0', ypos: '70', wide: 'f110' },
    };
  }
  const top = Math.ceil(TOUCH_TOP_ROW_PX / u);
  const right = Math.ceil((TOUCH_THUMB_CLUSTER_WIDTH_PX * buttonScale) / u);
  // The strip stays clear of the class portrait and health (bottom left, 98 units tall).
  const bottom = 120;
  const centre = Math.round((screen.w / u - right) / 2);
  return {
    ...base,
    HudObjectiveStatus: { xpos: '0', ypos: String(top), wide: `f${right}`, tall: `f${top + bottom}` },
    HudKothTimeStatus: { xpos: String(centre - 100), ypos: String(top) },
    HudTeamGoal: { xpos: String(centre - 160), ypos: String(top + 10) },
  };
}

/** The touch controls' landscape top row: 44px buttons at 8px from the top, plus an 8px gap. */
export const TOUCH_TOP_ROW_PX = 60;
/** The width of the bottom-right cluster at button scale 1 (the previous-weapon button's left edge, 286px, plus a margin). */
export const TOUCH_THUMB_CLUSTER_WIDTH_PX = 300;

/** The height of the touch controls' bottom-right cluster at button scale 1 (TouchOverlay's alt-fire top edge, 226px, plus a margin). */
export const TOUCH_THUMB_CLUSTER_PX = 240;

export function defaultLayout(game: HudGame): HudLayout {
  return game === 'hl2' ? HL2_LAYOUT : game === 'portal' ? PORTAL_LAYOUT : TF2_LAYOUT;
}

/** Overrides from a custom HUD (only the keys it sets). */
export function mergeLayout(base: HudLayout, overrides: Readonly<Record<string, Partial<PanelLayout>>>): HudLayout {
  const out: Record<string, PanelLayout> = { ...base };
  for (const [name, o] of Object.entries(overrides)) {
    const cur = out[name];
    if (!cur) continue;
    out[name] = { ...cur, ...o };
  }
  return out;
}

export interface HudScreen {
  w: number;
  h: number;
}

/**
 * Pixels per virtual unit. VGUI uses height / 480 on every screen; a phone in
 * portrait is narrower than the HUD's 640 units allow, so the scale also never
 * leaves fewer than 440 units across (panels pinned to opposite edges would
 * otherwise overlap).
 */
export function hudScale(screen: HudScreen): number {
  if (screen.w <= 0 || screen.h <= 0) return 1;
  return Math.max(0.5, Math.min(screen.h / 480, screen.w / 440));
}

export interface PanelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A panel's rectangle in pixels on `screen`. */
export function resolvePanel(layout: PanelLayout, screen: HudScreen, scale = hudScale(screen)): PanelRect {
  const width = resolveSize(parseDim(layout.wide), screen.w, scale);
  const height = resolveSize(parseDim(layout.tall), screen.h, scale);
  return {
    left: resolveAxis(parseDim(layout.xpos), screen.w, scale, width),
    top: resolveAxis(parseDim(layout.ypos), screen.h, scale, height),
    width,
    height,
  };
}
