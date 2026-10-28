/**
 * The inspector's block strip: which block the selected panel belongs to and what an edit does to it
 * (the whole block, or only this panel), or an offer to make a block when look-alike panels sit near it.
 */
'use client';

import { Boxes, Unlink } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createFromSuggestion, currentDrift, removeFromBlock } from '@/lib/tf2-hud/blocks/actions';
import { suggestSimilar } from '@/lib/tf2-hud/blocks/suggest';
import {
  sameMember,
  type Block,
  type BlockMember,
  type BlocksDoc,
} from '@/lib/tf2-hud/blocks/types';
import { useTf2HudPrefs } from '@/lib/tf2-hud/prefs';
import { COND_ENVS } from '@/lib/tf2-hud/scheme/cond';
import type { PanelNode } from '@/lib/tf2-hud/scene/types';
import { useEditor } from '@/lib/tf2-hud/store';
import { useSceneContext } from './scene-context';
import { Btn, Pill, SelectField } from './ui';

export default function BlockBar({
  node,
  doc,
  inBlock,
}: {
  node: PanelNode;
  doc: BlocksDoc;
  inBlock?: { block: Block; member: BlockMember };
}) {
  const { t } = useTranslation('c-tf2-hud');
  const { scene } = useSceneContext();
  const scope = useTf2HudPrefs((s) => s.blockScope);
  const setPref = useTf2HudPrefs((s) => s.set);
  const focusBlock = useEditor((s) => s.focusBlock);
  const view = useEditor((s) => s.view);
  const readText = useEditor((s) => s.readText);

  const similar = useMemo(() => {
    if (inBlock || !scene) return undefined;
    const opts = { env: COND_ENVS[view.env], minmode: view.minmode };
    return suggestSimilar(scene, { read: readText }, opts, doc.blocks).find((s) =>
      s.nodeIds.includes(node.id),
    );
    // The scene already changes whenever the files do.
  }, [inBlock, scene, doc.blocks, view.env, view.minmode, readText, node.id]);

  if (inBlock) {
    const { block, member } = inBlock;
    const drifted = currentDrift(block.id).filter((d) => sameMember(d.member, member)).length;
    return (
      <div className="mt-2 space-y-1.5 rounded-(--app-radius-sm) border border-(--app-border) bg-(--app-surface-hover) p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Boxes className="size-3.5 text-(--app-accent-text)" aria-hidden />
          <button
            type="button"
            className="min-w-0 truncate text-xs font-semibold text-(--app-accent-text) hover:underline"
            onClick={() => {
              focusBlock(block.id);
              setPref('rightOpen', true);
              setPref('rightTab', 'blocks');
            }}
          >
            {block.name}
          </button>
          <span className="text-[11px] text-(--app-text-dim)">
            {t('block-panels', {
              defaultValue_one: '{{count}} panel',
              defaultValue_other: '{{count}} panels',
              count: block.members.length,
            })}
          </span>
          {member.pinned.length ? (
            <Pill tone="info">
              {t('block-overrides', {
                defaultValue_one: '{{count}} overridden',
                defaultValue_other: '{{count}} overridden',
                count: member.pinned.length,
              })}
            </Pill>
          ) : null}
          {drifted ? (
            <Pill tone="warning">
              {t('block-drift', {
                defaultValue_one: '{{count}} differs',
                defaultValue_other: '{{count}} differ',
                count: drifted,
              })}
            </Pill>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <SelectField
            aria-label={t('block-scope', { defaultValue: 'Edits change' })}
            value={scope}
            onChange={(e) => setPref('blockScope', e.target.value as 'block' | 'panel')}
          >
            <option value="block">
              {t('scope-block', { defaultValue: 'Edits change the whole block' })}
            </option>
            <option value="panel">
              {t('scope-panel', { defaultValue: 'Edits change only this panel' })}
            </option>
          </SelectField>
          <Btn
            size="xs"
            icon={Unlink}
            onClick={() => removeFromBlock(block.id, member)}
            title={t('remove-from-block', { defaultValue: 'Remove this panel from the block' })}
          >
            {t('leave-block', { defaultValue: 'Leave' })}
          </Btn>
        </div>
      </div>
    );
  }

  if (!similar) return null;
  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-(--app-radius-sm) border border-(--app-border) bg-(--app-surface-hover) p-2">
      <p className="text-xs text-(--app-text-muted)">
        {t('similar-nearby', {
          defaultValue_one: '{{count}} look-alike panel here. Edit them together?',
          defaultValue_other: '{{count}} look-alike panels here. Edit them together?',
          count: similar.members.length,
        })}
      </p>
      <Btn size="xs" icon={Boxes} onClick={() => createFromSuggestion(similar)}>
        {t('make-block', { defaultValue: 'Make block' })}
      </Btn>
    </div>
  );
}
