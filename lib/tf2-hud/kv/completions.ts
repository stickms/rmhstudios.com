/**
 * Completion vocabulary for the code editor: the property names and enum
 * values VGUI panels understand, plus anything the scheme defines (fonts,
 * colours, borders) for the keys that take them.
 */

import type { Scheme } from '../scheme/scheme';

export const CONTROL_NAMES = [
  'EditablePanel',
  'Panel',
  'Frame',
  'CExLabel',
  'Label',
  'ImagePanel',
  'CTFImagePanel',
  'ScalableImagePanel',
  'CIconPanel',
  'CExButton',
  'CExImageButton',
  'Button',
  'ImageButton',
  'CheckButton',
  'RadioButton',
  'ComboBox',
  'TextEntry',
  'ContinuousProgressBar',
  'CAvatarImagePanel',
  'CModelPanel',
] as const;

export const PROPERTY_NAMES = [
  'ControlName',
  'fieldName',
  'xpos',
  'ypos',
  'zpos',
  'wide',
  'tall',
  'visible',
  'enabled',
  'labelText',
  'textAlignment',
  'font',
  'fgcolor',
  'fgcolor_override',
  'bgcolor_override',
  'PaintBackgroundType',
  'paintbackground',
  'border',
  'image',
  'scaleImage',
  'drawcolor',
  'fillcolor',
  'wrap',
  'centerwrap',
  'textinsetx',
  'textinsety',
  'use_proportional_insets',
  'proportionaltoparent',
  'pin_to_sibling',
  'pin_corner_to_sibling',
  'pin_to_sibling_corner',
  'xpos_minmode',
  'ypos_minmode',
  'wide_minmode',
  'tall_minmode',
  'dulltext',
  'brighttext',
  'autoResize',
  'pinCorner',
  'tabPosition',
  'command',
  'fg_image',
  'bg_image',
] as const;

export const ALIGNMENTS = [
  'west',
  'east',
  'center',
  'north',
  'south',
  'north-west',
  'north-east',
  'south-west',
  'south-east',
] as const;

const BOOLEAN_KEYS = new Set([
  'visible',
  'enabled',
  'wrap',
  'centerwrap',
  'scaleimage',
  'dulltext',
  'brighttext',
  'paintbackground',
  'use_proportional_insets',
  'proportionaltoparent',
  'autoresize',
]);

export function valueCompletions(key: string, scheme: Scheme): string[] {
  const k = key.toLowerCase();
  if (k === 'controlname') return [...CONTROL_NAMES];
  if (k === 'textalignment') return [...ALIGNMENTS];
  if (BOOLEAN_KEYS.has(k)) return ['0', '1'];
  if (k === 'paintbackgroundtype') return ['0', '1', '2'];
  if (k === 'font' || k.endsWith('font')) return [...scheme.fonts.keys()];
  if (k.includes('color') || k.startsWith('fgcolor') || k.startsWith('bgcolor')) {
    return [...scheme.colors.keys(), ...scheme.base.keys()].filter((c) => !/^\d/.test(c));
  }
  if (k === 'border' || k.startsWith('border_')) return [...scheme.borders.keys()];
  if (k === 'xpos' || k === 'ypos') return ['0', 'c0', 'r0'];
  if (k === 'wide' || k === 'tall') return ['f0', '0'];
  return [];
}
