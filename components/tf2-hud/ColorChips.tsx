/**
 * Colour chips on the preview. Select a panel and its colours appear beside it as small swatches: click one to
 * change it right there. When the colour is tied to a scheme colour (`TanDark`), the popover offers to change
 * just this element or the colour itself, with a count of what else uses it, so recolouring a HUD does not
 * need a trip to the Scheme tab.
 */
'use client';

import { Plus, Sparkles } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { panelContext } from '@/lib/tf2-hud/ai-context';
import {
  colorSlots,
  colorUsage,
  suggestedColorKey,
  wouldCycle,
  type ChainHop,
  type ColorSlot,
} from '@/lib/tf2-hud/color-vars';
import { propsOf, type Props } from '@/lib/tf2-hud/kv/props';
import { kvAt } from '@/lib/tf2-hud/kv/query';
import { writePanelProp } from '@/lib/tf2-hud/panel-edit';
import { kindOf, parseCached } from '@/lib/tf2-hud/scene/build';
import type { PanelNode } from '@/lib/tf2-hud/scene/types';
import { COND_ENVS } from '@/lib/tf2-hud/scheme/cond';
import { setSchemeHop } from '@/lib/tf2-hud/scheme/edit';
import { useEditor } from '@/lib/tf2-hud/store';
import { cn } from '@/lib/utils';
import { PickerBody } from './ColorPicker';
import { useSceneContext } from './scene-context';
import { Swatch } from './swatch';
import { Popover } from './ui';

const SCHEME_FILE = 'resource/clientscheme.res';
/** Chips shown at once; the inspector has the rest. */
const MAX_CHIPS = 5;
const CHIP_GAP = 6;

/** A short, human name for a colour property. */
function useKeyLabel() {
  const { t } = useTranslation('c-tf2-hud');
  return (key: string): string => {
    const k = key.toLowerCase();
    const armed = k.startsWith('armed') ? `${t('color-hover', { defaultValue: 'Hover' })} ` : '';
    const pressed = /^(depressed|selected)/.test(k)
      ? `${t('color-pressed', { defaultValue: 'Pressed' })} `
      : '';
    const kind = k.includes('fg')
      ? t('color-text', { defaultValue: 'Text' })
      : k.includes('bg') || k.includes('fill')
        ? t('color-fill', { defaultValue: 'Fill' })
        : k.includes('draw')
          ? t('color-tint', { defaultValue: 'Tint' })
          : key;
    return `${armed}${pressed}${kind}`;
  };
}

function ColorTargetPopover({
  node,
  props,
  slot,
  anchor,
  onClose,
}: {
  node: PanelNode;
  props: Props;
  slot: ColorSlot;
  anchor: HTMLElement | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const { scheme, page } = useSceneContext();
  const readText = useEditor((s) => s.readText);
  const writeText = useEditor((s) => s.writeText);
  const askAssistant = useEditor((s) => s.askAssistant);
  const label = useKeyLabel();
  /** `null` = this element; otherwise the scheme colour being edited. */
  const [target, setTarget] = useState<ChainHop | null>(null);

  const usage = useMemo(() => {
    const files = (page?.files ?? []).flatMap((path) => {
      const text = readText(path);
      return text === undefined ? [] : [{ path, text }];
    });
    const schemeText = readText(SCHEME_FILE);
    return new Map(slot.hops.map((h) => [h.name, colorUsage(h.name, schemeText, files)]));
  }, [slot.hops, page, readText]);

  const pickerValue = target
    ? ((target.source === 'colors'
        ? scheme.colors.get(target.name.toLowerCase())
        : scheme.base.get(target.name.toLowerCase())) ?? slot.value)
    : slot.value;

  const change = (value: string) => {
    if (!target) {
      writePanelProp(node, slot.key, value);
      return;
    }
    if (wouldCycle(scheme, target.name, value)) {
      toast.error(
        t('color-cycle', {
          defaultValue: '{{name}} cannot point at itself, directly or through another colour.',
          name: target.name,
        }),
      );
      return;
    }
    const text = readText(SCHEME_FILE);
    if (text !== undefined)
      writeText(SCHEME_FILE, setSchemeHop(text, target, value), `scheme-hop:${target.name}`);
  };

  const others = (h: ChainHop) => {
    const u = usage.get(h.name);
    return u ? u.panels + u.scheme : 0;
  };

  return (
    <Popover
      anchor={anchor}
      open
      onClose={onClose}
      label={t('color-popover', { defaultValue: 'Change colour' })}
      width={300}
    >
      <p className="mb-2 truncate text-xs text-(--app-text-muted)">
        <strong className="text-(--app-text)">{node.name}</strong> · {label(slot.key)}
      </p>
      {slot.hops.length ? (
        <fieldset className="mb-3 space-y-1">
          <legend className="sr-only">
            {t('color-changes', { defaultValue: 'What to change' })}
          </legend>
          <label className="flex cursor-pointer items-start gap-2 text-xs">
            <input
              type="radio"
              name="color-target"
              className="mt-0.5 accent-(--app-accent)"
              checked={target === null}
              onChange={() => setTarget(null)}
            />
            <span>
              {t('color-this-element', { defaultValue: 'This element only' })}
              <span className="block text-(--app-text-dim)">
                {t('color-this-element-hint', {
                  defaultValue: 'Choosing a number detaches it from {{name}}.',
                  name: slot.hops[0].name,
                })}
              </span>
            </span>
          </label>
          {slot.hops.map((h) => (
            <label key={h.name} className="flex cursor-pointer items-start gap-2 text-xs">
              <input
                type="radio"
                name="color-target"
                className="mt-0.5 accent-(--app-accent)"
                checked={target?.name === h.name}
                onChange={() => setTarget(h)}
              />
              <span>
                {t('color-everywhere', { defaultValue: '{{name}}, everywhere', name: h.name })}
                <span className="block text-(--app-text-dim)">
                  {others(h)
                    ? t('color-used', {
                        defaultValue_one:
                          'Also used by {{count}} other place on this page and in the scheme.',
                        defaultValue_other:
                          'Also used by {{count}} other places on this page and in the scheme.',
                        count: others(h),
                      })
                    : t('color-used-none', { defaultValue: 'Nothing else on this page uses it.' })}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <PickerBody
        // A different target is a different colour: start its picker afresh.
        key={target?.name ?? 'element'}
        value={pickerValue}
        scheme={scheme}
        onChange={change}
        onCreateSchemeColor={(name, literal) => {
          const text = readText(SCHEME_FILE);
          if (text !== undefined) {
            writeText(SCHEME_FILE, setSchemeHop(text, { name, source: 'colors' }, literal));
            writePanelProp(node, slot.key, name);
          }
        }}
      />
      <button
        type="button"
        className="mt-3 flex w-full items-center gap-1.5 rounded-(--app-radius-sm) px-1.5 py-1 text-xs text-(--app-accent-text) hover:bg-(--app-surface-hover)"
        onClick={() => {
          askAssistant({
            context: panelContext({ panel: node, props, scheme }),
            prompt: t('color-ai-prompt', {
              defaultValue:
                'Suggest a better colour for the {{what}} of this panel, one that stays readable.',
              what: label(slot.key).toLowerCase(),
            }),
            autoSend: true,
          });
          onClose();
        }}
      >
        <Sparkles className="size-3.5" aria-hidden />
        {t('color-ai', { defaultValue: 'Suggest a colour with the assistant' })}
      </button>
    </Popover>
  );
}

export default function ColorChips({
  zoom,
  stage,
}: {
  /** CSS pixels per scene pixel. */
  zoom: number;
  /** The preview stage, to keep the chips inside it. */
  stage: { w: number; h: number };
}) {
  const { t } = useTranslation('c-tf2-hud');
  const { scene, scheme } = useSceneContext();
  const selectedId = useEditor((s) => s.selectedId);
  const view = useEditor((s) => s.view);
  const readText = useEditor((s) => s.readText);
  const label = useKeyLabel();
  const node = scene?.nodes.find((n) => n.id === selectedId);
  const [open, setOpen] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const text = node ? readText(node.file) : undefined;
  const props = useMemo(() => {
    if (!node || text === undefined) return undefined;
    const entry = kvAt(parseCached(text), node.keyPath);
    return entry ? propsOf(entry, { env: COND_ENVS[view.env], minmode: view.minmode }) : undefined;
  }, [node, text, view.env, view.minmode]);
  const slots = useMemo(
    () => (props ? colorSlots(props, scheme).slice(0, MAX_CHIPS) : []),
    [props, scheme],
  );

  useLayoutEffect(() => {
    const el = bar.current;
    if (el) setSize({ w: el.offsetWidth, h: el.offsetHeight });
  }, [slots, node?.id]);

  if (view.play || !node || !props || !node.shown) return null;

  // Under the panel, or above it when there is no room; kept inside the stage.
  const r = node.rect;
  let top = (r.y + r.h) * zoom + CHIP_GAP;
  if (top + size.h > stage.h - 2) top = Math.max(2, r.y * zoom - size.h - CHIP_GAP);
  const left = Math.max(2, Math.min(r.x * zoom, stage.w - size.w - 2));
  const active = slots.find((s) => s.key === open);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        ref={bar}
        role="toolbar"
        aria-label={t('color-chips', { defaultValue: 'Colours of the selected panel' })}
        className="pointer-events-auto absolute flex max-w-full flex-wrap items-center gap-1 rounded-(--app-radius-sm) border border-(--app-border-bright) bg-(--app-bg) p-1 text-[11px]"
        style={{ left, top }}
      >
        {slots.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-label={t('color-edit', { defaultValue: 'Change {{what}}', what: label(s.key) })}
            aria-expanded={open === s.key}
            onClick={(e) => {
              setAnchor(e.currentTarget);
              setOpen(open === s.key ? null : s.key);
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-(--app-radius-sm) px-1.5 py-1 text-(--app-text) hover:bg-(--app-surface-hover)',
              open === s.key && 'bg-(--app-accent-dim)',
            )}
          >
            <Swatch color={s.rgba} className="size-4" />
            <span>{label(s.key)}</span>
            {s.hops[0] ? (
              <span className="font-mono text-(--app-text-dim)">{s.hops[0].name}</span>
            ) : null}
          </button>
        ))}
        {slots.length === 0 ? (
          <button
            type="button"
            onClick={(e) => {
              const key = suggestedColorKey(kindOf(node.control));
              writePanelProp(node, key, '255 255 255 255');
              setAnchor(e.currentTarget);
              setOpen(key);
            }}
            className="flex items-center gap-1 rounded-(--app-radius-sm) px-1.5 py-1 text-(--app-text-muted) hover:bg-(--app-surface-hover)"
          >
            <Plus className="size-3.5" aria-hidden />
            {t('color-add', { defaultValue: 'Add a colour' })}
          </button>
        ) : null}
      </div>
      {active && anchor ? (
        <ColorTargetPopover
          node={node}
          props={props}
          slot={active}
          anchor={anchor}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}
