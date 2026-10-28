/**
 * Editing one property of one panel, from wherever the author is looking at it (the inspector, a colour chip on
 * the preview). One place decides what the edit means: a panel in a block either follows the block or, by the
 * author's choice, overrides it; otherwise the value goes into the panel's own file, on the copy of the key that
 * is live for the previewed platform (and the `_minmode` one when previewing minmode).
 */

import { editMemberValue, blockOfNode, readBlocksDoc } from './blocks/actions';
import { isSharable } from './blocks/types';
import { kvSet } from './kv/edit';
import { propsOf } from './kv/props';
import { kvAt } from './kv/query';
import { useTf2HudPrefs } from './prefs';
import { parseCached } from './scene/build';
import type { PanelNode } from './scene/types';
import { COND_ENVS } from './scheme/cond';
import { useEditor } from './store';

type Target = Pick<PanelNode, 'id' | 'file' | 'keyPath'>;

/** The key actually written for `base`: its `_minmode` copy when previewing minmode and the panel has one. */
export function writeKey(base: string, has: (key: string) => boolean, minmode: boolean): string {
  return minmode && has(`${base}_minmode`) ? `${base}_minmode` : base;
}

export function writePanelProp(node: Target, base: string, value: string): void {
  const s = useEditor.getState();
  const text = s.readText(node.file);
  if (text === undefined) return;
  const env = COND_ENVS[s.view.env];

  const inBlock = blockOfNode(readBlocksDoc(), node);
  if (inBlock && isSharable(base)) {
    const pinned = inBlock.member.pinned.some((p) => p.toLowerCase() === base.toLowerCase());
    // A key this panel already overrides is just this panel's.
    if (!pinned) {
      editMemberValue(
        inBlock.block.id,
        inBlock.member,
        base,
        value,
        useTf2HudPrefs.getState().blockScope,
      );
      return;
    }
  }

  const entry = kvAt(parseCached(text), node.keyPath);
  const props = entry ? propsOf(entry, { env, minmode: s.view.minmode }) : undefined;
  const key = props ? writeKey(base, (k) => props.has(k), s.view.minmode) : base;
  s.writeText(
    node.file,
    kvSet(text, [...node.keyPath, key], value, { env }),
    `inspect:${node.id}:${base}`,
  );
}
