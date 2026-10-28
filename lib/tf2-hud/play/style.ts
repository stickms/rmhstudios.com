/** Hover colours for Play mode: a button the pointer is over takes its `armed*` colours, as in the game. */

import { mergeProps, propsFromMap, type Props } from '../kv/props';

export interface ArmedPanel {
  file: string;
  /** The entry's key. */
  name: string;
}

/** `props` as the game draws a button the pointer is on. */
export function armedProps(props: Props): Props {
  const over: Record<string, string> = {};
  const fg = props.get('armedfgcolor_override');
  const bg = props.get('armedbgcolor_override');
  if (fg) {
    over.defaultfgcolor_override = fg;
    over.fgcolor_override = fg;
  }
  if (bg) {
    over.defaultbgcolor_override = bg;
    over.bgcolor_override = bg;
  }
  return Object.keys(over).length ? mergeProps(props, propsFromMap(over)) : props;
}

export function armedStyle(
  armed: ArmedPanel | null,
): ((file: string, name: string, props: Props) => Props) | undefined {
  if (!armed) return undefined;
  return (file, name, props) =>
    file === armed.file && name === armed.name ? armedProps(props) : props;
}
