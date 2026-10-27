/**
 * Colour field and picker.
 *
 * A VGUI colour is either numbers (`"235 227 203 255"`) or the *name* of a scheme
 * colour, which may itself name another. The picker edits both honestly: dragging
 * the square writes numbers; choosing a scheme swatch writes the name; and the
 * whole chain — `TanDark → Tan → 235 227 203 255` — stays visible so it is
 * obvious what a value really is and what will change if the scheme is edited.
 */
'use client';

import { Pipette, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSentinel } from '@/hooks/useSentinel';
import { useTranslation } from 'react-i18next';
import {
  contrast,
  hsvToRgb,
  over,
  parseColorInput,
  rgbToHsv,
  toHex,
  toVguiLiteral,
  type Hsv,
} from '@/lib/tf2-hud/color';
import { useTf2HudPrefs } from '@/lib/tf2-hud/prefs';
import { listSchemeColors, resolveColorChain } from '@/lib/tf2-hud/scheme/inspect';
import { rgbaCss, type Rgba, type Scheme } from '@/lib/tf2-hud/scheme/scheme';
import { cn } from '@/lib/utils';
import { Swatch } from './swatch';
import { Btn, Popover, TextField } from './ui';

const OPAQUE_BLACK: Rgba = { r: 0, g: 0, b: 0, a: 255 };
const OPAQUE_WHITE: Rgba = { r: 255, g: 255, b: 255, a: 255 };

interface BodyProps {
  value: string;
  scheme: Scheme;
  onChange: (v: string) => void;
  onCreateSchemeColor?: (name: string, literal: string) => void;
}

function PickerBody({ value, scheme, onChange, onCreateSchemeColor }: BodyProps) {
  const { t } = useTranslation('c-tf2-hud');
  const recent = useTf2HudPrefs((p) => p.recentColors);
  const pushRecent = useTf2HudPrefs((p) => p.pushRecentColor);
  const resolved = useMemo(() => resolveColorChain(scheme, value), [scheme, value]);
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(resolved.rgba ?? OPAQUE_WHITE));
  const [alpha, setAlpha] = useState(resolved.rgba?.a ?? 255);
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const square = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const colors = useMemo(() => listSchemeColors(scheme), [scheme]);
  const [limit, setLimit] = useState(120);
  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? colors.filter((c) => c.name.toLowerCase().includes(q)) : colors;
  }, [colors, query]);
  const shown = useMemo(() => matching.slice(0, limit), [matching, limit]);
  useEffect(() => setLimit(120), [query]);
  const moreColors = useSentinel(() => setLimit((n) => n + 120), {
    enabled: limit < matching.length,
    watch: limit,
    rootMargin: '80px 0px',
  });

  // Follow outside changes (e.g. undo) unless the user is mid-drag.
  useEffect(() => {
    if (dragging.current || !resolved.rgba) return;
    setHsv((cur) => {
      const next = rgbToHsv(resolved.rgba!);
      // Keep hue/saturation stable for greys, where RGB cannot recover them.
      return next.s === 0 || next.v === 0
        ? { ...cur, v: next.v, s: next.s === 0 ? 0 : cur.s }
        : next;
    });
    setAlpha(resolved.rgba.a);
  }, [resolved.rgba]);

  const rgba = hsvToRgb(hsv, alpha);
  const emit = useCallback(
    (h: Hsv, a: number) => onChange(toVguiLiteral(hsvToRgb(h, a))),
    [onChange],
  );

  const pick = (e: React.PointerEvent) => {
    const r = square.current!.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    const next = { ...hsv, s, v };
    setHsv(next);
    emit(next, alpha);
  };

  const eyedropper = typeof window !== 'undefined' && 'EyeDropper' in window;

  return (
    <div className="space-y-3">
      <div
        ref={square}
        role="slider"
        tabIndex={0}
        aria-label={t('cp-area', { defaultValue: 'Saturation and brightness' })}
        aria-valuetext={`${Math.round(hsv.s * 100)}% saturation, ${Math.round(hsv.v * 100)}% brightness`}
        aria-valuenow={Math.round(hsv.s * 100)}
        className="relative h-36 w-full cursor-crosshair touch-none rounded-(--app-radius-sm)"
        style={{
          backgroundColor: `hsl(${hsv.h} 100% 50%)`,
          backgroundImage:
            'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)',
        }}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e);
        }}
        onPointerMove={(e) => dragging.current && pick(e)}
        onPointerUp={() => {
          dragging.current = false;
          pushRecent(toVguiLiteral(rgba));
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.02;
          const d: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, step],
            ArrowDown: [0, -step],
          };
          const m = d[e.key];
          if (!m) return;
          e.preventDefault();
          const next = {
            ...hsv,
            s: Math.min(1, Math.max(0, hsv.s + m[0])),
            v: Math.min(1, Math.max(0, hsv.v + m[1])),
          };
          setHsv(next);
          emit(next, alpha);
        }}
      >
        <span
          className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.6)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
          aria-hidden
        />
      </div>

      <label className="block text-[11px] font-semibold uppercase tracking-wider text-(--app-text-dim)">
        {t('cp-hue', { defaultValue: 'Hue' })}
        <input
          type="range"
          min={0}
          max={360}
          value={Math.round(hsv.h)}
          onChange={(e) => {
            const next = { ...hsv, h: Number(e.target.value) };
            setHsv(next);
            emit(next, alpha);
          }}
          className="mt-1 h-3 w-full cursor-pointer appearance-none rounded-full"
          style={{
            background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
          }}
        />
      </label>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-(--app-text-dim)">
        {t('cp-alpha', { defaultValue: 'Opacity' })} · {Math.round((alpha / 255) * 100)}%
        <input
          type="range"
          min={0}
          max={255}
          value={alpha}
          onChange={(e) => {
            const a = Number(e.target.value);
            setAlpha(a);
            emit(hsv, a);
          }}
          className="tf2hud-checker mt-1 h-3 w-full cursor-pointer appearance-none rounded-full"
          style={{
            backgroundImage: `linear-gradient(to right, transparent, ${rgbaCss({ ...rgba, a: 255 })})`,
          }}
        />
      </label>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <TextField
          aria-label={t('cp-hex', { defaultValue: 'Hex or RGB value' })}
          defaultValue={toHex(rgba, alpha < 255)}
          key={toHex(rgba, true)}
          onBlur={(e) => {
            const c = parseColorInput(e.target.value);
            if (!c) return;
            setHsv(rgbToHsv(c));
            setAlpha(c.a);
            onChange(toVguiLiteral(c));
            pushRecent(toVguiLiteral(c));
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="font-mono"
        />
        {eyedropper ? (
          <Btn
            icon={Pipette}
            aria-label={t('cp-eyedropper', { defaultValue: 'Pick a colour from the screen' })}
            onClick={async () => {
              try {
                const res = await new (
                  window as unknown as {
                    EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> };
                  }
                ).EyeDropper().open();
                const c = parseColorInput(res.sRGBHex);
                if (c) {
                  setHsv(rgbToHsv(c));
                  setAlpha(255);
                  onChange(toVguiLiteral(c));
                  pushRecent(toVguiLiteral(c));
                }
              } catch {
                /* cancelled */
              }
            }}
          />
        ) : null}
      </div>
      <p className="font-mono text-[11px] text-(--app-text-dim)">
        {toVguiLiteral(rgba)} ·{' '}
        {t('cp-contrast', {
          defaultValue: 'contrast {{dark}}:1 on black, {{light}}:1 on white',
          dark: contrast(over(rgba, OPAQUE_BLACK), OPAQUE_BLACK).toFixed(1),
          light: contrast(over(rgba, OPAQUE_WHITE), OPAQUE_WHITE).toFixed(1),
        })}
      </p>

      {recent.length ? (
        <div>
          <h4 className="tf2hud-panel-head mb-1">{t('cp-recent', { defaultValue: 'Recent' })}</h4>
          <div className="flex flex-wrap gap-1">
            {recent.map((lit) => (
              <button
                key={lit}
                type="button"
                title={lit}
                aria-label={lit}
                onClick={() => onChange(lit)}
                className="size-6"
              >
                <Swatch color={parseColorInput(lit)} className="size-6" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <h4 className="tf2hud-panel-head mb-1">
          {t('cp-scheme', { defaultValue: 'Scheme colours' })}
        </h4>
        <TextField
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('cp-search', { defaultValue: 'Search scheme colours' })}
          aria-label={t('cp-search', { defaultValue: 'Search scheme colours' })}
        />
        <div className="mt-2 grid max-h-32 grid-cols-9 gap-1 overflow-y-auto">
          {shown.map((c) => (
            <button
              key={c.name}
              type="button"
              title={`${c.name}${c.alias ? ` → ${c.raw}` : ` · ${c.raw}`}`}
              aria-label={c.name}
              onClick={() => onChange(c.name)}
              className={cn(
                'size-6 rounded-(--app-radius-sm)',
                value.toLowerCase() === c.name.toLowerCase() && 'ring-2 ring-(--app-accent)',
              )}
            >
              <Swatch color={c.rgba} className="size-6" />
            </button>
          ))}
          {limit < matching.length ? (
            <span ref={moreColors} aria-hidden className="h-6 w-px" />
          ) : null}
        </div>
      </div>

      {onCreateSchemeColor ? (
        <div className="flex gap-2">
          <TextField
            value={newName}
            onChange={(e) => setNewName(e.target.value.replace(/[^\w.-]/g, ''))}
            placeholder={t('cp-new-name', { defaultValue: 'New scheme colour name' })}
            aria-label={t('cp-new-name', { defaultValue: 'New scheme colour name' })}
          />
          <Btn
            icon={Plus}
            disabled={!newName}
            onClick={() => {
              onCreateSchemeColor(newName, toVguiLiteral(rgba));
              onChange(newName);
              setNewName('');
            }}
          >
            {t('cp-save-scheme', { defaultValue: 'Save' })}
          </Btn>
        </div>
      ) : null}
    </div>
  );
}

export interface ColorFieldProps {
  value: string;
  onChange: (value: string) => void;
  scheme: Scheme;
  label: string;
  onCreateSchemeColor?: (name: string, literal: string) => void;
  /** Show the resolution chain under the field. */
  showChain?: boolean;
}

export function ColorField({
  value,
  onChange,
  scheme,
  label,
  onCreateSchemeColor,
  showChain = true,
}: ColorFieldProps) {
  const { t } = useTranslation('c-tf2-hud');
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const resolved = useMemo(() => resolveColorChain(scheme, value), [scheme, value]);

  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-center gap-1.5">
        <button
          ref={setAnchor}
          type="button"
          aria-label={t('cp-open', { defaultValue: 'Pick colour for {{label}}', label })}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="size-8 shrink-0"
        >
          <Swatch color={resolved.rgba} className="size-8" />
        </button>
        <TextField
          list="tf2hud-scheme-colors"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono"
        />
      </div>
      {showChain && value ? (
        <p
          className={cn(
            'truncate font-mono text-[11px]',
            resolved.kind === 'unknown' ? 'text-(--app-warning)' : 'text-(--app-text-dim)',
          )}
        >
          {resolved.kind === 'unknown'
            ? t('cp-unknown', { defaultValue: 'Not a colour or a scheme colour' })
            : resolved.chain.length > 1
              ? [
                  ...resolved.chain.slice(0, -1),
                  resolved.rgba ? toVguiLiteral(resolved.rgba) : '?',
                ].join(' → ')
              : resolved.rgba
                ? `${toHex(resolved.rgba, resolved.rgba.a < 255)}`
                : ''}
        </p>
      ) : null}
      <Popover
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        label={t('cp-title', { defaultValue: 'Colour picker' })}
        width={300}
      >
        <PickerBody
          value={value}
          scheme={scheme}
          onChange={onChange}
          onCreateSchemeColor={onCreateSchemeColor}
        />
      </Popover>
    </div>
  );
}

/** The picker alone, anchored to any element (a tile, a swatch). */
export function ColorPickerPopover({
  anchor,
  open,
  onClose,
  value,
  scheme,
  onChange,
  onCreateSchemeColor,
}: {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  value: string;
  scheme: Scheme;
  onChange: (value: string) => void;
  onCreateSchemeColor?: (name: string, literal: string) => void;
}) {
  const { t } = useTranslation('c-tf2-hud');
  return (
    <Popover
      anchor={anchor}
      open={open}
      onClose={onClose}
      label={t('cp-title', { defaultValue: 'Colour picker' })}
      width={300}
    >
      <PickerBody
        value={value}
        scheme={scheme}
        onChange={onChange}
        onCreateSchemeColor={onCreateSchemeColor}
      />
    </Popover>
  );
}
