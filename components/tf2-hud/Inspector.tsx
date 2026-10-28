/**
 * Inspector — typed editing of the selected panel's properties. Every control
 * writes the underlying `.res` text (so the code view and preview stay in step),
 * editing the copy of a repeated key that is live for the previewed platform.
 */
'use client';

import { Code2, Eye, EyeOff, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { kvRemove, kvSet } from '@/lib/tf2-hud/kv/edit';
import { PROPERTY_NAMES } from '@/lib/tf2-hud/kv/completions';
import { propsOf, activeEntries } from '@/lib/tf2-hud/kv/props';
import { kvAt } from '@/lib/tf2-hud/kv/query';
import { varsFromState } from '@/lib/tf2-hud/fixtures';
import { pinOf } from '@/lib/tf2-hud/layout/geometry';
import {
  HUD_LAYOUT_FILE,
  parseCached,
  substituteLabel,
  TEXT_KEYS,
} from '@/lib/tf2-hud/scene/build';
import { setSchemeColor } from '@/lib/tf2-hud/scheme/edit';
import { explainDim } from '@/lib/tf2-hud/scheme/inspect';
import { COND_ENVS } from '@/lib/tf2-hud/scheme/cond';
import { blockOfNode, resetOverride, useBlocksDoc } from '@/lib/tf2-hud/blocks/actions';
import { panelContext } from '@/lib/tf2-hud/ai-context';
import { writePanelProp } from '@/lib/tf2-hud/panel-edit';
import { isSharable } from '@/lib/tf2-hud/blocks/types';
import { useEditor } from '@/lib/tf2-hud/store';
import { useLocalisation } from '@/lib/tf2-hud/use-scene';
import ImageThumb from './ImageThumb';
import { useSceneContext } from './scene-context';
import BlockBar from './BlockBar';
import { BOOL_KEYS, PropControl, propKind } from './PropControl';
import { Btn, EmptyNote, IconBtn, PanelHead, Pill, SelectField, TextField } from './ui';

const LAYOUT = ['xpos', 'ypos', 'wide', 'tall', 'zpos'] as const;
const TEXT = [
  'labelText',
  'font',
  'textAlignment',
  'wrap',
  'centerwrap',
  'textinsetx',
  'textinsety',
] as const;
const LOOK = [
  'fgcolor',
  'fgcolor_override',
  'bgcolor_override',
  'border',
  'PaintBackgroundType',
] as const;
const IMAGE = ['image', 'scaleImage', 'drawcolor', 'fillcolor'] as const;
const FLAGS = ['visible', 'enabled'] as const;
const KNOWN = new Set<string>(
  [...LAYOUT, ...TEXT, ...LOOK, ...IMAGE, ...FLAGS, 'ControlName', 'fieldName'].map((k) =>
    k.toLowerCase(),
  ),
);

export default function Inspector() {
  const { t } = useTranslation('c-tf2-hud');
  const { scene, scheme } = useSceneContext();
  const selectedId = useEditor((s) => s.selectedId);
  const view = useEditor((s) => s.view);
  const readText = useEditor((s) => s.readText);
  const writeText = useEditor((s) => s.writeText);
  const jump = useEditor((s) => s.jump);
  const toggleForce = useEditor((s) => s.toggleForce);
  const forceHidden = useEditor((s) => s.forceHidden);
  const test = useEditor((s) => s.test);
  const strings = useLocalisation();
  const setFocusProp = useEditor((s) => s.setFocusProp);
  const askAssistant = useEditor((s) => s.askAssistant);
  const node = scene?.nodes.find((n) => n.id === selectedId);
  const [adding, setAdding] = useState('');
  const blocksDoc = useBlocksDoc();

  const env = COND_ENVS[view.env];
  const text = node ? readText(node.file) : undefined;
  const kv = useMemo(() => {
    if (!node || text === undefined) return undefined;
    const entry = kvAt(parseCached(text), node.keyPath);
    return entry ? { entry, props: propsOf(entry, { env, minmode: view.minmode }) } : undefined;
  }, [node, text, env, view.minmode]);

  if (!node || !kv || text === undefined) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PanelHead title={t('inspector', { defaultValue: 'Inspector' })} />
        <EmptyNote>
          {t('inspector-empty', {
            defaultValue:
              'Click a panel in the preview, or pick one from the outline, to edit its properties.',
          })}
        </EmptyNote>
      </div>
    );
  }

  const { entry, props } = kv;
  const keyFor = (base: string) =>
    view.minmode && props.has(`${base}_minmode`) ? `${base}_minmode` : base;
  const get = (base: string) => props.get(keyFor(base));
  const inBlock = blockOfNode(blocksDoc, node);
  const pinnedHere = (key: string) =>
    inBlock?.member.pinned.some((p) => p.toLowerCase() === key.toLowerCase()) ?? false;
  // Where an edit goes (the whole block, only this panel, or just the file) is decided once, in panel-edit.
  const set = (base: string, value: string) => writePanelProp(node, base, value);
  const remove = (key: string) =>
    writeText(node.file, kvRemove(text, [...node.keyPath, key], { env }));

  const present = (keys: readonly string[]) =>
    keys.filter((k) => props.has(k) || LAYOUT.includes(k as never));

  const writeScheme = (name: string, literal: string) => {
    const schemeText = readText('resource/clientscheme.res');
    if (schemeText !== undefined) {
      writeText('resource/clientscheme.res', setSchemeColor(schemeText, name, literal));
    }
  };
  const screenH = scene?.screen.h ?? 1080;
  const scale = screenH / 480;
  const parentRect = (node.parentId && scene?.nodes.find((n) => n.id === node.parentId)?.rect) || {
    x: 0,
    y: 0,
    w: scene?.screen.w ?? 1920,
    h: screenH,
  };
  const pin = pinOf(props);

  const field = (key: string) => {
    const lower = key.toLowerCase();
    const value = get(key) ?? '';
    let detail: string | undefined;
    let detailNode: React.ReactNode;
    const isDim = lower === 'xpos' || lower === 'ypos' || lower === 'wide' || lower === 'tall';
    const focusOn = () => setFocusProp({ nodeId: node.id, key: lower as 'xpos' });
    const control = (
      <PropControl
        propKey={key}
        value={value}
        onChange={(v) => set(key, v)}
        scheme={scheme}
        screenH={screenH}
        onCreateSchemeColor={writeScheme}
        placeholder={LAYOUT.includes(key as never) ? '0' : undefined}
        textProps={
          isDim
            ? {
                className: 'font-mono',
                onFocus: focusOn,
                onBlur: () => setFocusProp(null),
                onPointerEnter: focusOn,
                onPointerLeave: () =>
                  document.activeElement?.tagName !== 'INPUT' && setFocusProp(null),
              }
            : undefined
        }
      />
    );
    if (propKind(key) === 'text') {
      if (isDim) {
        const e = explainDim(
          lower as 'xpos',
          value,
          scale,
          lower === 'xpos' || lower === 'wide' ? parentRect.w : parentRect.h,
          pin && (lower === 'xpos' || lower === 'ypos') ? { sibling: pin.sibling } : undefined,
        );
        detail = e.text;
      } else if (TEXT_KEYS.has(lower.replace(/_(lodef|minmode)$/, '')) && value) {
        const shown = substituteLabel(value, varsFromState(test), strings);
        if (shown !== value) detail = `→ ${shown}`;
      } else if (lower === 'image' && value) {
        detailNode = <ImageThumb value={value} />;
      }
    }
    return (
      <div key={key} className="space-y-0.5">
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
          <span className="flex min-w-0 items-center gap-1 text-xs text-(--app-text-muted)">
            <span className="truncate" title={keyFor(key)}>
              {key}
              {keyFor(key) !== key ? <span className="text-(--app-text-dim)"> ·min</span> : null}
            </span>
            {inBlock && isSharable(key) && pinnedHere(key) ? (
              <button
                type="button"
                className="inline-flex shrink-0 items-center text-(--app-info)"
                title={t('override-reset', {
                  defaultValue: 'Overrides the block. Click to follow the block again.',
                })}
                aria-label={t('override-reset-label', {
                  defaultValue: 'Follow the block again: {{key}}',
                  key,
                })}
                onClick={() => resetOverride(inBlock.block.id, inBlock.member, key)}
              >
                <RotateCcw className="size-3" aria-hidden />
              </button>
            ) : inBlock && isSharable(key) && key in inBlock.block.shared ? (
              <span
                className="size-1.5 shrink-0 rounded-full bg-(--app-accent)"
                title={t('follows-block', { defaultValue: 'Follows the block' })}
              />
            ) : null}
          </span>
          {control}
        </div>
        {detail ? (
          <p className="ps-[7rem] text-[11px] leading-snug text-(--app-text-dim)">{detail}</p>
        ) : null}
        {detailNode ? <div className="ps-[7rem]">{detailNode}</div> : null}
      </div>
    );
  };

  const section = (title: string, keys: readonly string[], always = false) => {
    const list = always ? [...keys] : present(keys);
    if (!list.length) return null;
    return (
      <div className="space-y-1.5">
        <h3 className="tf2hud-panel-head pt-2">{title}</h3>
        {list.map(field)}
      </div>
    );
  };

  const extra = activeEntries(entry, env).filter(
    (c) => c.value && !KNOWN.has(c.key.text.toLowerCase()),
  );
  const shown = node.shown && !forceHidden.has(node.id);
  const missingProps = PROPERTY_NAMES.filter((k) => !props.has(k));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHead
        title={node.name}
        actions={
          <>
            <IconBtn
              icon={shown ? Eye : EyeOff}
              label={
                shown
                  ? t('hide-in-preview', { defaultValue: 'Hide in preview' })
                  : t('show-in-preview', { defaultValue: 'Show in preview' })
              }
              onClick={() => toggleForce(node.id, !shown)}
            />
            <IconBtn
              icon={Sparkles}
              label={t('ask-ai-panel', { defaultValue: 'Ask the assistant about this panel' })}
              onClick={() =>
                askAssistant({
                  context: panelContext({
                    panel: node,
                    props,
                    scheme,
                    block: inBlock
                      ? { name: inBlock.block.name, count: inBlock.block.members.length }
                      : undefined,
                  }),
                })
              }
            />
            <IconBtn
              icon={Code2}
              label={t('show-in-code', { defaultValue: 'Show in code' })}
              onClick={() => jump(node.file, node.source.start)}
            />
          </>
        }
      />
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          <Pill tone="accent">{node.control}</Pill>
          {node.isFrame ? <Pill>{t('frame', { defaultValue: 'frame' })}</Pill> : null}
          {node.file === HUD_LAYOUT_FILE ? (
            <Pill tone="info">
              {t('from-hudlayout', { defaultValue: 'positioned by hudlayout.res' })}
            </Pill>
          ) : null}
          {!node.visible ? (
            <Pill tone="warning">{t('hidden', { defaultValue: 'hidden' })}</Pill>
          ) : null}
          <span className="truncate font-mono text-[11px] text-(--app-text-dim)">
            {node.file.replace('resource/', '')}
          </span>
        </div>
        <BlockBar node={node} doc={blocksDoc} inBlock={inBlock} />
        <p className="text-[11px] text-(--app-text-dim)">
          {Math.round(node.rect.w)}×{Math.round(node.rect.h)} px at ({Math.round(node.rect.x)},{' '}
          {Math.round(node.rect.y)})
        </p>

        {section(t('layout', { defaultValue: 'Layout' }), LAYOUT, true)}
        {section(t('flags', { defaultValue: 'Visibility' }), FLAGS)}
        {section(t('text', { defaultValue: 'Text' }), TEXT)}
        {section(t('appearance', { defaultValue: 'Appearance' }), LOOK)}
        {section(t('image', { defaultValue: 'Image' }), IMAGE)}

        {extra.length ? (
          <div className="space-y-1.5">
            <h3 className="tf2hud-panel-head pt-2">
              {t('other', { defaultValue: 'Other properties' })}
            </h3>
            {extra.map((c) => (
              <div
                key={`${c.key.start}`}
                className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2"
              >
                <span className="truncate text-xs text-(--app-text-muted)" title={c.key.text}>
                  {c.key.text}
                </span>
                <TextField
                  aria-label={c.key.text}
                  value={c.value!.text}
                  onChange={(e) =>
                    writeText(
                      node.file,
                      kvSet(text, [...node.keyPath, c.key.text], e.target.value, { env }),
                      `inspect:${node.id}:${c.key.text}`,
                    )
                  }
                />
                <IconBtn
                  icon={Trash2}
                  label={t('remove-prop', { defaultValue: 'Remove {{key}}', key: c.key.text })}
                  size="xs"
                  onClick={() => remove(c.key.text)}
                />
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-1.5 pt-3">
          <SelectField
            aria-label={t('add-property-label', { defaultValue: 'Add property' })}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          >
            <option value="">{t('add-property', { defaultValue: 'Add property…' })}</option>
            {missingProps.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </SelectField>
          <Btn
            size="sm"
            icon={Plus}
            disabled={!adding}
            onClick={() => {
              writeText(
                node.file,
                kvSet(
                  text,
                  [...node.keyPath, adding],
                  BOOL_KEYS.has(adding.toLowerCase()) ? '1' : '',
                ),
                `inspect:${node.id}:${adding}`,
              );
              setAdding('');
            }}
          >
            {t('add', { defaultValue: 'Add' })}
          </Btn>
        </div>
      </div>
      <datalist id="tf2hud-scheme-colors">
        {[...scheme.colors.keys()].slice(0, 400).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </div>
  );
}
