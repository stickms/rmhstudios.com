/** Which panels the game draws 3D content into, and what content. Shared by the preview and its 3D layer. */

import { TF2_CLASSES, type Tf2Class } from '../fixtures';

/** Panels the game draws a class model into. */
export const PLAYER_PANELS = /^(ctfplayermodelpanel|cmodelpanel|cbasemodelpanel)$/i;
/** Panels the game draws an item into: a 3D model, or its icon in the store. */
export const ITEM_PANELS = /^(citemmodelpanel|cembeddeditemmodelpanel|cstorepreviewitempanel)$/i;
export const ICON_PANELS = /^(cstorepreviewitemicon|cmodelimagepanel)$/i;

export const isModelPanel = (control: string): boolean =>
  PLAYER_PANELS.test(control) || ITEM_PANELS.test(control) || ICON_PANELS.test(control);

/** A class named in a panel's name ("scout_model", "ClassModelPanel_Medic"), else `fallback`. */
export function classHint(name: string, fallback: Tf2Class): Tf2Class {
  const lower = name.toLowerCase();
  return TF2_CLASSES.find((c) => lower.includes(c)) ?? fallback;
}
