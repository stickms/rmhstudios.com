/**
 * What the assistant is told about where the player is looking: the selected panel, a problem from the Problems
 * tab, the scheme. It is built from the player's own project, so it is capped, stripped of control characters and
 * sent as data (never as instructions). It also names the files the answer needs, so the assistant can skip its
 * "which files?" question and go straight to proposing changes.
 */

import { colorSlots, isColorProp } from './color-vars';
import type { Props } from './kv/props';
import type { Scheme } from './scheme/scheme';

/** The most context text sent with one request. */
export const AI_CONTEXT_LIMIT = 1200;
export const SCHEME_PATH = 'resource/clientscheme.res';

export interface AiContext {
  /** Short name shown to the player ("PlayerStatusHealthValue"). */
  label: string;
  /** Text the model is shown, as data. */
  notes: string;
  /** Project files the answer is about, at most the assistant's limit. */
  files: string[];
}

// eslint-disable-next-line no-control-regex -- control characters are removed on purpose
const CONTROL = /[\u0000-\u001f\u007f]+/g;
const clean = (s: string, max = 80): string => s.replace(CONTROL, ' ').trim().slice(0, max);

const LAYOUT_KEYS = ['xpos', 'ypos', 'wide', 'tall', 'zpos'] as const;

export interface PanelFacts {
  name: string;
  control: string;
  file: string;
  keyPath: readonly string[];
}

export function panelContext(args: {
  panel: PanelFacts;
  props: Props;
  scheme: Scheme;
  block?: { name: string; count: number };
}): AiContext {
  const { panel, props, scheme, block } = args;
  const lines = [
    `Selected panel: ${clean(panel.name)} (${clean(panel.control)}) in ${clean(panel.file, 120)}`,
    `Key path: ${panel.keyPath.map((k) => clean(k)).join(' / ')}`,
  ];
  const layout = LAYOUT_KEYS.flatMap((k) =>
    props.has(k) ? [`${k} ${clean(props.get(k) ?? '', 16)}`] : [],
  );
  if (layout.length) lines.push(`Layout (640x480 units): ${layout.join(', ')}`);
  const text = props.get('labeltext') ?? props.get('text');
  if (text) lines.push(`Text: "${clean(text, 60)}"`);
  const font = props.get('font');
  if (font) lines.push(`Font: ${clean(font, 40)}`);

  const slots = colorSlots(props, scheme).slice(0, 6);
  for (const s of slots) {
    const chain = s.hops.length ? `${s.hops.map((h) => h.name).join(' → ')} → ` : '';
    const rgba = s.rgba ? `${s.rgba.r} ${s.rgba.g} ${s.rgba.b} ${s.rgba.a}` : 'unresolved';
    lines.push(`Colour ${s.key} = ${chain}${rgba}`);
  }
  if (block) {
    lines.push(
      `Part of the block "${clean(block.name, 40)}" with ${block.count - 1} other panels that share its look.`,
    );
  }
  const files = [panel.file];
  // A named colour lives in the scheme; changing it changes every panel that uses it.
  if (slots.some((s) => s.kind === 'variable') || props.keys().some(isColorProp))
    files.push(SCHEME_PATH);
  return {
    label: clean(panel.name, 60),
    notes: lines.join('\n').slice(0, AI_CONTEXT_LIMIT),
    files: [...new Set(files)],
  };
}

export function problemContext(issue: {
  path: string;
  code: string;
  message: string;
  line?: number;
}): AiContext {
  const where = issue.line ? ` (line ${issue.line})` : '';
  return {
    label: clean(issue.message, 60),
    notes:
      `Problem found by the editor in ${clean(issue.path, 120)}${where}: ${clean(issue.message, 300)} [${clean(issue.code, 30)}]`.slice(
        0,
        AI_CONTEXT_LIMIT,
      ),
    files: /\.res$/i.test(issue.path) ? [issue.path] : [],
  };
}

export function schemeContext(note: string): AiContext {
  return {
    label: 'Scheme colours',
    notes: clean(note, 300),
    files: [SCHEME_PATH],
  };
}
