/**
 * Scheme — the colours, fonts and borders in `clientscheme.res`, visualised.
 *
 * Panels refer to these by name, so this is where a change ripples through the
 * whole HUD: edit a colour or a font here and every panel that names it updates
 * live in the preview. Entries used by the selected panel are called out.
 */
'use client';

import { Plus, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TfTabs, type TfTab } from './TfTabs';
import { fontInstalled, describeFont, listSchemeColors } from '@/lib/tf2-hud/scheme/inspect';
import {
  addSchemeFont,
  fontFaceCount,
  removeFontFaceProp,
  setFontFaceProp,
  setSchemeColor,
  type FontProp,
} from '@/lib/tf2-hud/scheme/edit';
import { fontStatus } from '@/lib/tf2-hud/assets/fonts';
import type { Scheme } from '@/lib/tf2-hud/scheme/scheme';
import { propsOf } from '@/lib/tf2-hud/kv/props';
import { kvAt } from '@/lib/tf2-hud/kv/query';
import { parseCached } from '@/lib/tf2-hud/scene/build';
import { COND_ENVS } from '@/lib/tf2-hud/scheme/cond';
import { schemeContext } from '@/lib/tf2-hud/ai-context';
import { useEditor } from '@/lib/tf2-hud/store';
import { cn } from '@/lib/utils';
import { ColorPickerPopover } from './ColorPicker';
import { FacePicker, FaceSample, statusTone, useFontStatusLabel } from './FontPicker';
import { useSceneContext } from './scene-context';
import { Btn, EmptyNote, Modal, NumberField, PanelHead, Pill, TextField, Toggle } from './ui';
import { BorderSwatch } from './border-swatch';
import { Swatch } from './swatch';

const SCHEME_FILE = 'resource/clientscheme.res';
type Tab = 'colors' | 'fonts' | 'borders';

/** Names the selected panel's properties refer to, by property key. */
function useSelectedRefs(): Map<string, string[]> {
  const { scene } = useSceneContext();
  const selectedId = useEditor((s) => s.selectedId);
  const readText = useEditor((s) => s.readText);
  const view = useEditor((s) => s.view);
  return useMemo(() => {
    const refs = new Map<string, string[]>();
    const node = scene?.nodes.find((n) => n.id === selectedId);
    const text = node ? readText(node.file) : undefined;
    if (!node || text === undefined) return refs;
    const entry = kvAt(parseCached(text), node.keyPath);
    if (!entry) return refs;
    const props = propsOf(entry, { env: COND_ENVS[view.env], minmode: view.minmode });
    for (const k of props.keys()) {
      const v = props.get(k);
      if (!v) continue;
      const lower = v.toLowerCase();
      refs.set(lower, [...(refs.get(lower) ?? []), k]);
    }
    return refs;
  }, [scene, selectedId, readText, view.env, view.minmode]);
}

function ColorsTab({ scheme }: { scheme: Scheme }) {
  const { t } = useTranslation('c-tf2-hud');
  const readText = useEditor((s) => s.readText);
  const writeText = useEditor((s) => s.writeText);
  const refs = useSelectedRefs();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<'colors' | 'base'>('colors');
  const [editing, setEditing] = useState<{ name: string; anchor: HTMLElement } | null>(null);
  const [newName, setNewName] = useState('');
  const [look, setLook] = useState('');
  const askAssistant = useEditor((s) => s.askAssistant);
  const colors = useMemo(() => listSchemeColors(scheme, source), [scheme, source]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? colors.filter((c) => c.name.toLowerCase().includes(q) || c.raw.toLowerCase().includes(q))
      : colors;
  }, [colors, query]);

  const write = (name: string, value: string) => {
    const text = readText(SCHEME_FILE);
    if (text !== undefined)
      writeText(SCHEME_FILE, setSchemeColor(text, name, value), `scheme-color:${name}`);
  };
  const current = editing ? colors.find((c) => c.name === editing.name) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-(--app-border) p-2">
        <div className="flex gap-2">
          <TextField
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search-colors', { defaultValue: 'Search colours' })}
            aria-label={t('search-colors', { defaultValue: 'Search colours' })}
          />
          <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-(--app-text-muted)">
            <Toggle
              label={t('base-settings', { defaultValue: 'BaseSettings' })}
              checked={source === 'base'}
              onChange={(v) => setSource(v ? 'base' : 'colors')}
            />
            {t('base-settings', { defaultValue: 'BaseSettings' })}
          </label>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const text = look.trim();
            if (!text) return;
            askAssistant({
              context: schemeContext(
                t('look-note', {
                  defaultValue:
                    'The player wants the HUD recoloured. Change scheme colours so the whole HUD follows the look they describe.',
                }),
              ),
              prompt: t('look-prompt', {
                defaultValue: 'Recolour the HUD: {{look}}',
                look: text.slice(0, 300),
              }),
              autoSend: true,
            });
            setLook('');
          }}
        >
          <TextField
            value={look}
            maxLength={300}
            onChange={(e) => setLook(e.target.value)}
            placeholder={t('look-ph', { defaultValue: 'Describe a look: dark teal with amber' })}
            aria-label={t('look-label', {
              defaultValue: 'Describe a colour look for the assistant',
            })}
          />
          <Btn type="submit" icon={Sparkles} disabled={!look.trim()}>
            {t('look-go', { defaultValue: 'Recolour' })}
          </Btn>
        </form>
        <div className="flex gap-2">
          <TextField
            value={newName}
            onChange={(e) => setNewName(e.target.value.replace(/[^\w.-]/g, ''))}
            placeholder={t('new-color-name', { defaultValue: 'New colour name' })}
            aria-label={t('new-color-name', { defaultValue: 'New colour name' })}
          />
          <Btn
            icon={Plus}
            disabled={!newName || source === 'base'}
            onClick={() => {
              write(newName, '255 255 255 255');
              setNewName('');
            }}
          >
            {t('add', { defaultValue: 'Add' })}
          </Btn>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {shown.length === 0 ? (
          <EmptyNote>{t('no-colors', { defaultValue: 'No colours match.' })}</EmptyNote>
        ) : (
          <ul className="grid grid-cols-2 gap-1.5">
            {shown.map((c) => {
              const used = refs.get(c.name.toLowerCase());
              return (
                <li key={c.name}>
                  <button
                    type="button"
                    onClick={(e) => setEditing({ name: c.name, anchor: e.currentTarget })}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-(--app-radius-sm) border p-1.5 text-start hover:bg-(--app-surface-hover)',
                      used ? 'border-(--app-accent)' : 'border-(--app-border)',
                    )}
                  >
                    <Swatch color={c.rgba} className="size-8 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-(--app-text)">
                        {c.name}
                      </span>
                      <span className="block truncate font-mono text-[10px] text-(--app-text-dim)">
                        {c.alias ? `→ ${c.raw}` : c.raw}
                      </span>
                      {used ? (
                        <span className="block truncate text-[10px] text-(--app-accent-text)">
                          {t('used-by', {
                            defaultValue: 'used by {{props}}',
                            props: used.join(', '),
                          })}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ColorPickerPopover
        anchor={editing?.anchor ?? null}
        open={editing !== null && current !== undefined && source === 'colors'}
        onClose={() => setEditing(null)}
        value={current?.raw ?? ''}
        scheme={scheme}
        onChange={(v) => editing && write(editing.name, v)}
      />
    </div>
  );
}

const FLAGS: FontProp[] = ['antialias', 'outline', 'dropshadow', 'italic', 'underline', 'additive'];

function FontEditor({
  name,
  scheme,
  onClose,
}: {
  name: string;
  scheme: Scheme;
  onClose: () => void;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const readText = useEditor((s) => s.readText);
  const writeText = useEditor((s) => s.writeText);
  const defs = scheme.fonts.get(name.toLowerCase()) ?? [];

  const apply = (fn: (text: string) => string, key: string) => {
    const text = readText(SCHEME_FILE);
    if (text !== undefined) writeText(SCHEME_FILE, fn(text), `scheme-font:${key}`);
  };
  const setProp = (i: number, prop: FontProp, value: string) =>
    apply((tx) => setFontFaceProp(tx, name, i + 1, prop, value), `${name}:${i}:${prop}`);

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('edit-font', { defaultValue: 'Edit font “{{name}}”', name })}
      wide
      description={t('edit-font-hint', {
        defaultValue:
          'Faces are tried in order; a face with a screen-height window is used only inside it, others scale with the screen.',
      })}
      footer={
        <Btn variant="primary" onClick={onClose}>
          {t('done', { defaultValue: 'Done' })}
        </Btn>
      }
    >
      <div className="space-y-4">
        {defs.map((def, i) => (
          <section
            key={i}
            className="space-y-2 rounded-(--app-radius-sm) border border-(--app-border) p-3"
          >
            <FaceSample def={def} px={Math.max(12, def.tall)} />
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="col-span-2 flex flex-col gap-1 text-[11px] text-(--app-text-muted)">
                {t('face', { defaultValue: 'Face' })}
                <FacePicker
                  key={`${name}:${i}`}
                  value={def.name}
                  onChange={(v) => setProp(i, 'name', v)}
                />
              </div>
              <label className="flex flex-col gap-1 text-[11px] text-(--app-text-muted)">
                {t('size', { defaultValue: 'Size' })}
                <NumberField
                  label={t('size', { defaultValue: 'Size' })}
                  value={def.tall}
                  min={1}
                  max={400}
                  onChange={(v) => setProp(i, 'tall', String(v))}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-(--app-text-muted)">
                {t('weight', { defaultValue: 'Weight' })}
                <NumberField
                  label={t('weight', { defaultValue: 'Weight' })}
                  value={def.weight}
                  min={0}
                  max={1000}
                  step={100}
                  onChange={(v) => setProp(i, 'weight', String(v))}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {FLAGS.map((flag) => (
                <label
                  key={flag}
                  className="flex items-center gap-1.5 text-[11px] text-(--app-text-muted)"
                >
                  <Toggle
                    label={flag}
                    checked={Boolean(def[flag as keyof typeof def])}
                    onChange={(v) =>
                      v
                        ? setProp(i, flag, '1')
                        : apply(
                            (tx) => removeFontFaceProp(tx, name, i + 1, flag),
                            `${name}:${i}:${flag}`,
                          )
                    }
                  />
                  {flag}
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-(--app-text-muted)">
              {t('window', { defaultValue: 'Screen-height window' })}
              <NumberField
                label="min"
                value={def.yres?.[0] ?? 0}
                min={0}
                max={10000}
                onChange={(v) => setProp(i, 'yres', `${v} ${def.yres?.[1] ?? 10000}`)}
                className="w-20"
              />
              –
              <NumberField
                label="max"
                value={def.yres?.[1] ?? 0}
                min={0}
                max={10000}
                onChange={(v) => setProp(i, 'yres', `${def.yres?.[0] ?? 0} ${v}`)}
                className="w-20"
              />
              {def.yres ? (
                <Btn
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    apply((tx) => removeFontFaceProp(tx, name, i + 1, 'yres'), `${name}:${i}:yres`)
                  }
                >
                  {t('scales', { defaultValue: 'Make it scale' })}
                </Btn>
              ) : (
                <Pill>{t('proportional', { defaultValue: 'scales with screen' })}</Pill>
              )}
            </div>
          </section>
        ))}
        <Btn
          icon={Plus}
          onClick={() =>
            apply((tx) => {
              const n = fontFaceCount(tx, name) + 1;
              const last = defs[defs.length - 1];
              let out = setFontFaceProp(tx, name, n, 'name', last?.name ?? 'Verdana');
              out = setFontFaceProp(out, name, n, 'tall', String(last?.tall ?? 12));
              return setFontFaceProp(out, name, n, 'weight', String(last?.weight ?? 400));
            }, `${name}:add-face`)
          }
        >
          {t('add-face', { defaultValue: 'Add a face' })}
        </Btn>
      </div>
    </Modal>
  );
}

function FontsTab({ scheme }: { scheme: Scheme }) {
  const { t } = useTranslation('c-tf2-hud');
  const { scene } = useSceneContext();
  const readText = useEditor((s) => s.readText);
  const writeText = useEditor((s) => s.writeText);
  const label = useFontStatusLabel();
  const refs = useSelectedRefs();
  const screenH = scene?.screen.h ?? 1080;
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const names = useMemo(
    () => [...scheme.fontNames.values()].sort((a, b) => a.localeCompare(b)),
    [scheme],
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? names.filter((n) => n.toLowerCase().includes(q)) : names;
  }, [names, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-(--app-border) p-2">
        <TextField
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('font-search', { defaultValue: 'Search scheme fonts' })}
          aria-label={t('font-search', { defaultValue: 'Search scheme fonts' })}
        />
        <div className="flex gap-2">
          <TextField
            value={newName}
            onChange={(e) => setNewName(e.target.value.replace(/[^\w.-]/g, ''))}
            placeholder={t('new-font-name', { defaultValue: 'New font name' })}
            aria-label={t('new-font-name', { defaultValue: 'New font name' })}
          />
          <Btn
            icon={Plus}
            disabled={!newName || scheme.fonts.has(newName.toLowerCase())}
            onClick={() => {
              const text = readText(SCHEME_FILE);
              if (text === undefined) return;
              writeText(
                SCHEME_FILE,
                addSchemeFont(text, newName, { name: 'Verdana', tall: 14, weight: 400 }),
              );
              setEditing(newName);
              setNewName('');
            }}
          >
            {t('add', { defaultValue: 'Add' })}
          </Btn>
        </div>
        <p className="text-[11px] text-(--app-text-dim)">
          {t('fonts-at', { defaultValue: 'Shown at {{h}}p', h: screenH })}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <EmptyNote>{t('no-fonts', { defaultValue: 'No fonts match.' })}</EmptyNote>
        ) : (
          <ul>
            {shown.map((n) => {
              const info = describeFont(scheme, n, screenH);
              const active =
                info?.faces.find((f) => f.active) ?? info?.faces[info.faces.length - 1];
              const status = active ? fontStatus(active.def.name, fontInstalled) : 'missing';
              const used = refs.get(n.toLowerCase());
              return (
                <li
                  key={n}
                  className={cn(
                    'border-b border-(--app-border) px-3 py-2',
                    used && 'bg-(--app-accent-dim)',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-(--app-text)">{n}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Pill tone={statusTone(status)}>{label(status)}</Pill>
                      <Btn size="xs" variant="ghost" onClick={() => setEditing(n)}>
                        {t('edit', { defaultValue: 'Edit' })}
                      </Btn>
                    </span>
                  </div>
                  {active ? <FaceSample def={active.def} px={active.px} /> : null}
                  <p className="font-mono text-[10px] text-(--app-text-dim)">
                    {active
                      ? `${active.def.name} · ${Math.round(active.px * 10) / 10}px${active.proportional ? ' scales' : ''}`
                      : ''}
                    {used
                      ? ` · ${t('used-by', { defaultValue: 'used by {{props}}', props: used.join(', ') })}`
                      : ''}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {editing ? (
        <FontEditor name={editing} scheme={scheme} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function BordersTab({ scheme }: { scheme: Scheme }) {
  const { t } = useTranslation('c-tf2-hud');
  const refs = useSelectedRefs();
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...scheme.borders.entries()]
      .filter(([n]) => !q || n.includes(q))
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [scheme, query]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-(--app-border) p-2">
        <TextField
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search-borders', { defaultValue: 'Search borders' })}
          aria-label={t('search-borders', { defaultValue: 'Search borders' })}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.length === 0 ? (
          <EmptyNote>{t('no-borders', { defaultValue: 'No borders match.' })}</EmptyNote>
        ) : (
          <ul>
            {list.map(([name, border]) => {
              const used = refs.get(name);
              return (
                <li
                  key={name}
                  className={cn(
                    'flex items-center gap-3 border-b border-(--app-border) px-3 py-2',
                    used && 'bg-(--app-accent-dim)',
                  )}
                >
                  <BorderSwatch border={border} scheme={scheme} />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-(--app-text)">
                      {name}
                    </span>
                    <span className="block font-mono text-[10px] text-(--app-text-dim)">
                      {t('border-layers', {
                        defaultValue: '{{n}} layer(s)',
                        n: Math.max(
                          border.left.length,
                          border.top.length,
                          border.right.length,
                          border.bottom.length,
                        ),
                      })}
                      {used
                        ? ` · ${t('used-by', { defaultValue: 'used by {{props}}', props: used.join(', ') })}`
                        : ''}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function SchemePanel() {
  const { t } = useTranslation('c-tf2-hud');
  const { scheme } = useSceneContext();
  const [tab, setTab] = useState<Tab>('colors');
  const tabs: TfTab[] = [
    { id: 'colors', label: t('colors', { defaultValue: 'Colours' }), count: scheme.colors.size },
    { id: 'fonts', label: t('fonts', { defaultValue: 'Fonts' }), count: scheme.fontNames.size },
    { id: 'borders', label: t('borders', { defaultValue: 'Borders' }), count: scheme.borders.size },
  ];
  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-label={t('scheme', { defaultValue: 'Scheme' })}
    >
      <PanelHead title={t('scheme', { defaultValue: 'Scheme' })} />
      <div className="border-b border-(--app-border) p-1.5">
        <TfTabs
          tabs={tabs}
          value={tab}
          size="sm"
          onChange={(id) => setTab(id as Tab)}
          aria-label={t('scheme-section', { defaultValue: 'Scheme section' })}
        />
      </div>
      {tab === 'colors' ? (
        <ColorsTab scheme={scheme} />
      ) : tab === 'fonts' ? (
        <FontsTab scheme={scheme} />
      ) : (
        <BordersTab scheme={scheme} />
      )}
    </section>
  );
}
