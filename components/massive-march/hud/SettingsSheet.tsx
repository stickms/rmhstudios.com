/**
 * Massive March — options.
 *
 * §17 in a panel. Most of these are the ordinary accommodations any first-person
 * game should ship, and three of them are load-bearing for this one in
 * particular:
 *
 *  - **Text only** never opens the microphone, and the campaign is completable
 *    that way because typed messages travel under exactly the same rule speech
 *    does.
 *  - **Steady frame** paints a fixed reference that does not move with the
 *    camera. An hour of first-person walking is a long time.
 *  - **Hold or toggle** for running, crouching and the microphone, because
 *    holding a key for a two-minute walk is a real physical cost.
 *
 * Rebinding is here too, and takes the next key pressed. Everything is stored
 * per browser rather than per campaign: these describe the person, and a
 * different friend hosting should not undo them.
 */

'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_KEYS,
  keyLabel,
  useMmSettings,
  type ActionKey,
  type CrosshairStyle,
  type HoldToggle,
  type MicMode,
} from '@/lib/massive-march/settings';
import { BOARD, Choose, Field, INK, MarchButton, Panel, Toggle } from '../ui';

const ACTION_ORDER: ActionKey[] = [
  'forward',
  'back',
  'left',
  'right',
  'jump',
  'run',
  'crouch',
  'sit',
  'interact',
  'use',
  'drop',
  'throwItem',
  'talk',
  'chat',
  'map',
  'gestures',
  'inventory',
];

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={`${label} — ${format(value)}`}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full cursor-pointer accent-current"
        aria-label={label}
      />
    </Field>
  );
}

export function SettingsSheet() {
  const { t } = useTranslation('c-massive-march');
  const settings = useMmSettings();
  const [binding, setBinding] = useState<ActionKey | null>(null);

  useEffect(() => {
    if (!binding) return;
    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code !== 'Escape') settings.bind(binding, event.code);
      setBinding(null);
    };
    window.addEventListener('keydown', capture, { capture: true });
    return () => window.removeEventListener('keydown', capture, { capture: true });
  }, [binding, settings]);

  return (
    <Panel className="max-h-[min(38rem,80vh)] w-[min(30rem,92vw)] space-y-5 overflow-y-auto">
      <h2 className="text-lg font-black tracking-tight">
        {t('settings', { defaultValue: 'Options' })}
      </h2>

      <section className="space-y-3">
        <h3 className="text-[11px] font-black tracking-[0.14em] uppercase opacity-70">
          {t('settings-view', { defaultValue: 'Looking around' })}
        </h3>
        <Slider
          label={t('fov', { defaultValue: 'Field of view' })}
          value={settings.fov}
          min={60}
          max={110}
          step={1}
          format={(value) => `${value}°`}
          onChange={(value) => settings.set('fov', value)}
        />
        <Slider
          label={t('sensitivity', { defaultValue: 'Look sensitivity' })}
          value={settings.sensitivity}
          min={0.2}
          max={3}
          step={0.05}
          format={(value) => `${value.toFixed(2)}×`}
          onChange={(value) => settings.set('sensitivity', value)}
        />
        <Toggle
          checked={settings.invertY}
          onChange={(next) => settings.set('invertY', next)}
          label={t('invert', { defaultValue: 'Invert vertical look' })}
        />
        <Toggle
          checked={settings.stableFrame}
          onChange={(next) => settings.set('stableFrame', next)}
          label={t('stable-frame', { defaultValue: 'Steady frame' })}
          hint={t('stable-frame-hint', {
            defaultValue:
              'Paints a fixed border and centre mark that do not move with the camera. Helps a lot if first-person motion gets to you.',
          })}
        />
        <Field label={t('crosshair', { defaultValue: 'Crosshair' })}>
          <Choose<CrosshairStyle>
            label={t('crosshair', { defaultValue: 'Crosshair' })}
            value={settings.crosshair}
            onChange={(value) => settings.set('crosshair', value)}
            options={[
              { value: 'dot', label: t('crosshair-dot', { defaultValue: 'Dot' }) },
              { value: 'cross', label: t('crosshair-cross', { defaultValue: 'Cross' }) },
              { value: 'ring', label: t('crosshair-ring', { defaultValue: 'Ring' }) },
              { value: 'none', label: t('crosshair-none', { defaultValue: 'None' }) },
            ]}
          />
        </Field>
      </section>

      <section className="space-y-3">
        <h3 className="text-[11px] font-black tracking-[0.14em] uppercase opacity-70">
          {t('settings-controls', { defaultValue: 'Controls' })}
        </h3>
        <Field label={t('run-mode', { defaultValue: 'Running' })}>
          <Choose<HoldToggle>
            label={t('run-mode', { defaultValue: 'Running' })}
            value={settings.runMode}
            onChange={(value) => settings.set('runMode', value)}
            options={[
              { value: 'hold', label: t('hold', { defaultValue: 'Hold' }) },
              { value: 'toggle', label: t('toggle', { defaultValue: 'Toggle' }) },
            ]}
          />
        </Field>
        <Field label={t('crouch-mode', { defaultValue: 'Crouching' })}>
          <Choose<HoldToggle>
            label={t('crouch-mode', { defaultValue: 'Crouching' })}
            value={settings.crouchMode}
            onChange={(value) => settings.set('crouchMode', value)}
            options={[
              { value: 'hold', label: t('hold', { defaultValue: 'Hold' }) },
              { value: 'toggle', label: t('toggle', { defaultValue: 'Toggle' }) },
            ]}
          />
        </Field>
        <Toggle
          checked={settings.largeText}
          onChange={(next) => settings.set('largeText', next)}
          label={t('large-text', { defaultValue: 'Larger interface text' })}
        />
        <Toggle
          checked={settings.highlightInteractive}
          onChange={(next) => settings.set('highlightInteractive', next)}
          label={t('highlight', { defaultValue: 'Mark things you can pick up' })}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-[11px] font-black tracking-[0.14em] uppercase opacity-70">
          {t('settings-voice', { defaultValue: 'Talking' })}
        </h3>
        <Toggle
          checked={settings.textOnly}
          onChange={(next) => settings.set('textOnly', next)}
          label={t('text-only', { defaultValue: 'Text only — never open my microphone' })}
          hint={t('text-only-restart', {
            defaultValue: 'Takes effect the next time you walk out from the landing.',
          })}
        />
        <Field label={t('mic-mode', { defaultValue: 'Microphone' })}>
          <Choose<MicMode>
            label={t('mic-mode', { defaultValue: 'Microphone' })}
            value={settings.micMode}
            onChange={(value) => settings.set('micMode', value)}
            options={[
              { value: 'push', label: t('mic-push', { defaultValue: 'Hold to talk' }) },
              { value: 'toggle', label: t('mic-toggle', { defaultValue: 'Toggle' }) },
              { value: 'open', label: t('mic-open', { defaultValue: 'Always open' }) },
            ]}
          />
        </Field>
        <Slider
          label={t('voice-volume', { defaultValue: 'Voices' })}
          value={settings.voiceVolume}
          min={0}
          max={1.5}
          step={0.05}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(value) => settings.set('voiceVolume', value)}
        />
        <Slider
          label={t('world-volume', { defaultValue: 'The island' })}
          value={settings.worldVolume}
          min={0}
          max={1}
          step={0.05}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(value) => settings.set('worldVolume', value)}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-[11px] font-black tracking-[0.14em] uppercase opacity-70">
          {t('settings-keys', { defaultValue: 'Keys' })}
        </h3>
        <ul className="grid grid-cols-2 gap-1.5">
          {ACTION_ORDER.map((action) => (
            <li key={action}>
              <button
                type="button"
                onClick={() => setBinding(action)}
                className="flex w-full cursor-pointer items-center justify-between gap-2 border-2 px-2 py-1.5 text-left"
                style={{ borderColor: 'rgba(34,32,29,0.3)', borderRadius: 3 }}
              >
                <span className="text-xs font-bold capitalize">
                  {action.replace(/([A-Z])/g, ' $1')}
                </span>
                <span
                  className="border-2 px-1.5 py-0.5 text-[11px] font-black"
                  style={{
                    borderColor: INK,
                    background: binding === action ? INK : BOARD,
                    color: binding === action ? BOARD : INK,
                    borderRadius: 2,
                  }}
                >
                  {binding === action
                    ? t('press-a-key', { defaultValue: 'Press…' })
                    : keyLabel(settings.keys[action] ?? DEFAULT_KEYS[action])}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <MarchButton className="w-full" onClick={() => settings.reset()}>
          {t('reset-settings', { defaultValue: 'Put everything back' })}
        </MarchButton>
      </section>
    </Panel>
  );
}
