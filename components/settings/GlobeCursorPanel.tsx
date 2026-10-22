'use client';

import { useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Dices, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Section, ToggleRow } from '@/components/settings/AppearancePanel';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  CURSOR_BLENDS,
  CURSOR_DETAILS,
  CURSOR_PALETTES,
  CURSOR_STYLES,
  EVERT_MODES,
  GLOBE_CURSOR_PRESETS,
  RANGES,
  type CursorBlend,
  type CursorDetail,
  type CursorPalette,
  type CursorStyle,
  type EvertMode,
  type GlobeCursorPreset,
  type GlobeCursorSettings,
  type RangedKey,
} from '@/lib/globe-cursor/settings';
import { useGlobeCursorStore } from '@/stores/globeCursorStore';

/**
 * Settings → Appearance → Globe cursor. Every knob applies live (the cursor on
 * this very page is the preview) and is stored per device — see
 * `stores/globeCursorStore.ts`.
 */
export function GlobeCursorPanel() {
  const { t } = useTranslation('settings-appearance');
  const hydrate = useGlobeCursorStore((s) => s.hydrate);
  const s = useGlobeCursorStore((st) => st.settings);
  const update = useGlobeCursorStore((st) => st.update);
  const applyPreset = useGlobeCursorStore((st) => st.applyPreset);
  const randomize = useGlobeCursorStore((st) => st.randomize);
  const reset = useGlobeCursorStore((st) => st.reset);
  const reduced = useReducedMotion();

  useEffect(() => hydrate(), [hydrate]);

  const presetNames: Record<GlobeCursorPreset, string> = {
    classic: t('globe-cursor-preset-classic', { defaultValue: 'Classic' }),
    neon: t('globe-cursor-preset-neon', { defaultValue: 'Neon' }),
    jelly: t('globe-cursor-preset-jelly', { defaultValue: 'Jelly' }),
    ghost: t('globe-cursor-preset-ghost', { defaultValue: 'Ghost' }),
    prism: t('globe-cursor-preset-prism', { defaultValue: 'Prism' }),
    minimal: t('globe-cursor-preset-minimal', { defaultValue: 'Minimal' }),
  };
  const modeNames: Record<EvertMode, string> = {
    loop: t('globe-cursor-mode-loop', { defaultValue: 'Endless loop' }),
    pingpong: t('globe-cursor-mode-pingpong', { defaultValue: 'Evert and revert' }),
    breathe: t('globe-cursor-mode-breathe', { defaultValue: 'Breathe (half-way)' }),
  };
  const paletteNames: Record<CursorPalette, string> = {
    duo: t('globe-cursor-palette-duo', { defaultValue: 'Two-tone' }),
    rainbow: t('globe-cursor-palette-rainbow', { defaultValue: 'Rainbow strips' }),
    checker: t('globe-cursor-palette-checker', { defaultValue: 'Checkerboard' }),
    aurora: t('globe-cursor-palette-aurora', { defaultValue: 'Aurora gradient' }),
  };
  const styleNames: Record<CursorStyle, string> = {
    solid: t('globe-cursor-style-solid', { defaultValue: 'Solid' }),
    glass: t('globe-cursor-style-glass', { defaultValue: 'Glass' }),
    wire: t('globe-cursor-style-wire', { defaultValue: 'Wireframe' }),
    dots: t('globe-cursor-style-dots', { defaultValue: 'Point cloud' }),
  };
  const detailNames: Record<CursorDetail, string> = {
    low: t('globe-cursor-detail-low', { defaultValue: 'Low' }),
    medium: t('globe-cursor-detail-medium', { defaultValue: 'Medium' }),
    high: t('globe-cursor-detail-high', { defaultValue: 'High' }),
  };
  const blendNames: Record<CursorBlend, string> = {
    normal: t('globe-cursor-blend-normal', { defaultValue: 'Normal' }),
    screen: t('globe-cursor-blend-screen', { defaultValue: 'Screen (adds light)' }),
    multiply: t('globe-cursor-blend-multiply', { defaultValue: 'Multiply (ink)' }),
    difference: t('globe-cursor-blend-difference', { defaultValue: 'Difference (always visible)' }),
    exclusion: t('globe-cursor-blend-exclusion', { defaultValue: 'Exclusion' }),
  };

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="space-y-4">
      <Section
        title={t('globe-cursor', { defaultValue: 'Globe cursor' })}
        description={t('globe-cursor-desc', {
          defaultValue:
            'Your pointer becomes a sphere that keeps turning itself inside out. Every change applies instantly — move the mouse to see it. Saved on this device.',
        })}
      >
        <ToggleRow
          label={t('globe-cursor-enabled', { defaultValue: 'Use the globe cursor' })}
          description={t('globe-cursor-enabled-desc', {
            defaultValue:
              'Only on devices with a mouse or trackpad; touch screens are never affected.',
          })}
          checked={s.enabled}
          onChange={(enabled) => update({ enabled })}
        />
        {reduced ? (
          <p className="text-xs text-site-text-muted">
            {t('globe-cursor-reduced', {
              defaultValue:
                'Reduced motion is on, so the globe holds still mid-eversion and the jelly, trail and sparkles are paused.',
            })}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {GLOBE_CURSOR_PRESETS.map((id) => (
            <Button
              key={id}
              type="button"
              variant="outline"
              size="sm"
              disabled={!s.enabled}
              onClick={() => applyPreset(id)}
            >
              {presetNames[id]}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!s.enabled}
            onClick={randomize}
          >
            <Dices aria-hidden />
            {t('globe-cursor-surprise', { defaultValue: 'Surprise me' })}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            <RotateCcw aria-hidden />
            {t('globe-cursor-reset', { defaultValue: 'Reset' })}
          </Button>
        </div>
      </Section>

      {s.enabled ? (
        <>
          <Section title={t('globe-cursor-motion', { defaultValue: 'Eversion & motion' })}>
            <RangeRow
              k="size"
              s={s}
              update={update}
              label={t('globe-cursor-size', { defaultValue: 'Size' })}
              format={(v) => `${v}px`}
            />
            <RangeRow
              k="speed"
              s={s}
              update={update}
              label={t('globe-cursor-speed', { defaultValue: 'Eversion speed' })}
              format={(v) => `${v.toFixed(2)}×`}
            />
            <SelectRow
              id="globe-cursor-mode"
              label={t('globe-cursor-mode', { defaultValue: 'Eversion pattern' })}
              value={s.mode}
              options={EVERT_MODES}
              names={modeNames}
              onChange={(mode) => update({ mode })}
            />
            <RangeRow
              k="dwell"
              s={s}
              update={update}
              label={t('globe-cursor-dwell', { defaultValue: 'Pause as a sphere' })}
              format={pct}
            />
            <RangeRow
              k="motionBoost"
              s={s}
              update={update}
              label={t('globe-cursor-boost', { defaultValue: 'Speed up when moving' })}
              format={pct}
            />
            <RangeRow
              k="spin"
              s={s}
              update={update}
              label={t('globe-cursor-spin', { defaultValue: 'Spin' })}
              format={(v) => `${v}°/s`}
            />
            <RangeRow
              k="tilt"
              s={s}
              update={update}
              label={t('globe-cursor-tilt', { defaultValue: 'Tilt' })}
              format={(v) => `${v}°`}
            />
            <ToggleRow
              label={t('globe-cursor-roll', { defaultValue: 'Roll with movement' })}
              description={t('globe-cursor-roll-desc', {
                defaultValue: 'The globe rolls like a ball in the direction you move.',
              })}
              checked={s.roll}
              onChange={(roll) => update({ roll })}
            />
          </Section>

          <Section title={t('globe-cursor-jelly-section', { defaultValue: 'Jelly' })}>
            <RangeRow
              k="jelly"
              s={s}
              update={update}
              label={t('globe-cursor-jelly', { defaultValue: 'Jelliness' })}
              format={pct}
            />
            <RangeRow
              k="lag"
              s={s}
              update={update}
              label={t('globe-cursor-lag', { defaultValue: 'Follow lag' })}
              format={pct}
            />
            <RangeRow
              k="hoverGrow"
              s={s}
              update={update}
              label={t('globe-cursor-hover-grow', { defaultValue: 'Grow over links' })}
              format={(v) => `${v.toFixed(2)}×`}
            />
            <ToggleRow
              label={t('globe-cursor-squish', { defaultValue: 'Squish on click' })}
              checked={s.clickSquish}
              onChange={(clickSquish) => update({ clickSquish })}
            />
          </Section>

          <Section title={t('globe-cursor-colour', { defaultValue: 'Colour & glow' })}>
            <SelectRow
              id="globe-cursor-palette"
              label={t('globe-cursor-palette', { defaultValue: 'Palette' })}
              value={s.palette}
              options={CURSOR_PALETTES}
              names={paletteNames}
              onChange={(palette) => update({ palette })}
            />
            <ColorRow
              label={t('globe-cursor-outside', { defaultValue: 'Outside colour' })}
              value={s.outside}
              onChange={(outside) => update({ outside })}
            />
            <ColorRow
              label={t('globe-cursor-inside', { defaultValue: 'Inside colour' })}
              value={s.inside}
              onChange={(inside) => update({ inside })}
            />
            <RangeRow
              k="hueDrift"
              s={s}
              update={update}
              label={t('globe-cursor-hue-drift', { defaultValue: 'Colour cycling' })}
              format={(v) => `${v}°/s`}
            />
            <RangeRow
              k="vibrance"
              s={s}
              update={update}
              label={t('globe-cursor-vibrance', { defaultValue: 'Vibrance' })}
              format={pct}
            />
            <RangeRow
              k="glow"
              s={s}
              update={update}
              label={t('globe-cursor-glow', { defaultValue: 'Glow' })}
              format={pct}
            />
            <ToggleRow
              label={t('globe-cursor-glow-auto', {
                defaultValue: 'Glow follows the globe’s colour',
              })}
              checked={s.glowColor === null}
              onChange={(auto) => update({ glowColor: auto ? null : s.outside })}
            />
            {s.glowColor !== null ? (
              <ColorRow
                label={t('globe-cursor-glow-colour', { defaultValue: 'Glow colour' })}
                value={s.glowColor}
                onChange={(glowColor) => update({ glowColor })}
              />
            ) : null}
            <RangeRow
              k="opacity"
              s={s}
              update={update}
              label={t('globe-cursor-opacity', { defaultValue: 'Opacity' })}
              format={pct}
            />
            <SelectRow
              id="globe-cursor-blend"
              label={t('globe-cursor-blend', { defaultValue: 'Blend with the page' })}
              value={s.blend}
              options={CURSOR_BLENDS}
              names={blendNames}
              onChange={(blend) => update({ blend })}
            />
          </Section>

          <Section title={t('globe-cursor-render', { defaultValue: 'Surface & effects' })}>
            <SelectRow
              id="globe-cursor-style"
              label={t('globe-cursor-style', { defaultValue: 'Surface' })}
              value={s.style}
              options={CURSOR_STYLES}
              names={styleNames}
              onChange={(style) => update({ style })}
            />
            <SelectRow
              id="globe-cursor-detail"
              label={t('globe-cursor-detail', { defaultValue: 'Mesh detail' })}
              value={s.detail}
              options={CURSOR_DETAILS}
              names={detailNames}
              onChange={(detail) => update({ detail })}
            />
            <RangeRow
              k="shine"
              s={s}
              update={update}
              label={t('globe-cursor-shine', { defaultValue: 'Shine' })}
              format={pct}
            />
            <RangeRow
              k="trail"
              s={s}
              update={update}
              label={t('globe-cursor-trail', { defaultValue: 'Trail echoes' })}
              format={(v) => `${v}`}
            />
            <ToggleRow
              label={t('globe-cursor-sparkles', { defaultValue: 'Sparkles' })}
              checked={s.sparkles}
              onChange={(sparkles) => update({ sparkles })}
            />
          </Section>

          <Section title={t('globe-cursor-behaviour', { defaultValue: 'Pointer behaviour' })}>
            <ToggleRow
              label={t('globe-cursor-hide-native', { defaultValue: 'Hide the system cursor' })}
              description={t('globe-cursor-hide-native-desc', {
                defaultValue: 'Off keeps your normal arrow with the globe following along.',
              })}
              checked={s.hideNative}
              onChange={(hideNative) => update({ hideNative })}
            />
            <ToggleRow
              label={t('globe-cursor-hotspot', { defaultValue: 'Precision dot' })}
              description={t('globe-cursor-hotspot-desc', {
                defaultValue:
                  'A small dot marks exactly where you will click, however far the globe lags.',
              })}
              checked={s.hotspot}
              onChange={(hotspot) => update({ hotspot })}
            />
            <ToggleRow
              label={t('globe-cursor-native-text', { defaultValue: 'Text cursor in text fields' })}
              description={t('globe-cursor-native-text-desc', {
                defaultValue: 'Shows the I-beam while typing; the globe shrinks beside it.',
              })}
              checked={s.nativeOverText}
              onChange={(nativeOverText) => update({ nativeOverText })}
            />
            <ToggleRow
              label={t('globe-cursor-canvas', { defaultValue: 'Normal cursor in games' })}
              description={t('globe-cursor-canvas-desc', {
                defaultValue:
                  'Over a game canvas the globe steps aside so the game’s own cursor shows.',
              })}
              checked={s.honourCanvas}
              onChange={(honourCanvas) => update({ honourCanvas })}
            />
          </Section>
        </>
      ) : null}
    </div>
  );
}

function RangeRow({
  k,
  s,
  update,
  label,
  format,
}: {
  k: RangedKey;
  s: GlobeCursorSettings;
  update: (patch: Partial<GlobeCursorSettings>) => void;
  label: string;
  format: (v: number) => string;
}) {
  const id = useId();
  const { min, max, step } = RANGES[k];
  const value = s[k];
  return (
    <div className="py-2.5">
      <div className="mb-2 flex items-center justify-between gap-4">
        <span id={id} className="text-sm text-site-text">
          {label}
        </span>
        <span className="text-xs tabular-nums text-site-text-muted">{format(value)}</span>
      </div>
      <Slider
        aria-labelledby={id}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => {
          if (typeof v === 'number') update({ [k]: v });
        }}
      />
    </div>
  );
}

function SelectRow<T extends string>({
  id,
  label,
  value,
  options,
  names,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly T[];
  names: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <Label htmlFor={id} className="min-w-0 text-sm text-site-text">
        {label}
      </Label>
      <Select
        id={id}
        containerClassName="w-52 shrink-0"
        value={value}
        onChange={(e) => {
          const next = options.find((o) => o === e.target.value);
          if (next) onChange(next);
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {names[o]}
          </option>
        ))}
      </Select>
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <Label htmlFor={id} className="min-w-0 text-sm text-site-text">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-site-text-muted">{value}</span>
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-site-sm border border-site-border bg-transparent"
        />
      </div>
    </div>
  );
}
