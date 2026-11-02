/**
 * Harmonic's in-game UI, passed to `GameCanvas` as `hudComponent` in place of the HL2 `GameHud`:
 * the HUD (HarmonicHud), the pause menu (Resume, Options, Quit to title) and Options (mouse
 * sensitivity, field of view, invert Y, subtitle size, master volume). It owns the pause flow the
 * way GameHud does: `input.suspended` while a menu is up, a `pause` command to the world, and the
 * `menu` impulse (Esc, or the tab losing focus) to open and close it.
 *
 * Settings are the shared `GameSettings` (so the client reads them as always); the subtitle size is
 * Harmonic's own pref. Menus use the `--app-*` tokens under `.harmonic-root`.
 */
'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, LogOut, Play, SlidersHorizontal } from 'lucide-react';
import type { GameHudProps } from '@/components/tf2-game/GameHud';
import { FOV_RANGE, SENSITIVITY_RANGE } from '@/lib/tf2-game/client/settings';
import { isHarmonicHud } from '@/lib/harmonic-game/client/hud-state';
import {
  SUBTITLE_SIZES,
  loadPrefs,
  savePrefs,
  type HarmonicPrefs,
  type SubtitleSize,
} from '@/lib/harmonic-game/client/prefs';
import HarmonicHud from './HarmonicHud';

type View = 'none' | 'pause' | 'options';

function useFocusFirst(active: boolean, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (active) ref.current?.querySelector<HTMLElement>('button, input, select')?.focus();
  }, [active, ref]);
}

function Field({
  id,
  label,
  value,
  children,
}: {
  id: string;
  label: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="harmonic-field">
      <label htmlFor={id}>{label}</label>
      {value ? <output htmlFor={id}>{value}</output> : null}
      {children}
    </div>
  );
}

export default function HarmonicGameUi({
  store,
  input,
  settings,
  onSettingsChange,
  onDisconnect,
  onCapture,
}: GameHudProps) {
  const { t } = useTranslation('harmonic');
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [view, setView] = useState<View>('none');
  const [prefs, setPrefs] = useState<HarmonicPrefs>(() => loadPrefs());
  const panel = useRef<HTMLDialogElement>(null);
  const open = view !== 'none';

  // The menu owns the keys; the world stands still while it is up.
  useEffect(() => {
    if (input) input.suspended = open;
    return () => {
      if (input) input.suspended = false;
    };
  }, [input, open]);
  useEffect(() => {
    store.send({ kind: 'pause', paused: open });
  }, [store, open]);

  // Esc (and the window losing focus) toggles the menu; from Options it steps back first.
  useEffect(
    () =>
      store.onImpulse((a) => {
        if (a !== 'menu') return;
        setView((v) => (v === 'none' ? 'pause' : v === 'options' ? 'pause' : 'none'));
      }),
    [store],
  );

  useFocusFirst(open, panel);
  const resume = useCallback(() => {
    setView('none');
    onCapture?.();
  }, [onCapture]);
  const setPref = (next: HarmonicPrefs) => {
    setPrefs(next);
    savePrefs(next);
  };

  // Tab cycles inside the menu: the game behind it must not take focus.
  const trapTab = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    // The input layer ignores keys typed into a field, so Esc there steps back here; elsewhere the
    // `menu` impulse handles it.
    if (e.key === 'Escape') {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT') setView((v) => (v === 'options' ? 'pause' : 'none'));
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('button, input, select')];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const hud = isHarmonicHud(state.ext) ? state.ext : null;
  const fov = FOV_RANGE.hl2;
  const sizeLabels: Record<SubtitleSize, string> = {
    small: t('harmonic:size_small', { defaultValue: 'Small' }),
    medium: t('harmonic:size_medium', { defaultValue: 'Medium' }),
    large: t('harmonic:size_large', { defaultValue: 'Large' }),
  };

  return (
    <div className="harmonic-ui" data-game="harmonic">
      {hud ? (
        <HarmonicHud
          hud={hud}
          now={state.now}
          subtitleSize={prefs.subtitleSize}
          showSubtitles={settings.captions}
        />
      ) : null}
      {open ? (
        <div className="harmonic-menu-scrim">
          {/* The native <dialog> element (implicit role "dialog"); Tab is kept inside it below. */}
          <dialog
            open
            ref={panel}
            className="harmonic-menu"
            aria-modal="true"
            aria-labelledby="harmonic-menu-title"
            onKeyDown={trapTab}
          >
            {view === 'pause' ? (
              <>
                <h2 id="harmonic-menu-title">{t('harmonic:paused', { defaultValue: 'Paused' })}</h2>
                <button type="button" className="harmonic-primary" onClick={resume}>
                  <Play className="size-4" aria-hidden />
                  {t('harmonic:resume', { defaultValue: 'Resume' })}
                </button>
                <button
                  type="button"
                  className="harmonic-secondary"
                  onClick={() => setView('options')}
                >
                  <SlidersHorizontal className="size-4" aria-hidden />
                  {t('harmonic:options', { defaultValue: 'Options' })}
                </button>
                <button type="button" className="harmonic-secondary" onClick={onDisconnect}>
                  <LogOut className="size-4 rtl-flip" aria-hidden />
                  {t('harmonic:quit_to_title', { defaultValue: 'Quit to title' })}
                </button>
              </>
            ) : (
              <>
                <h2 id="harmonic-menu-title">
                  {t('harmonic:options', { defaultValue: 'Options' })}
                </h2>
                <Field
                  id="harmonic-opt-sens"
                  label={t('harmonic:opt_sensitivity', { defaultValue: 'Mouse sensitivity' })}
                  value={settings.sensitivity.toFixed(1)}
                >
                  <input
                    id="harmonic-opt-sens"
                    type="range"
                    min={SENSITIVITY_RANGE.min}
                    max={10}
                    step={0.1}
                    value={Math.min(10, settings.sensitivity)}
                    onChange={(e) =>
                      onSettingsChange({ ...settings, sensitivity: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field
                  id="harmonic-opt-fov"
                  label={t('harmonic:opt_fov', { defaultValue: 'Field of view' })}
                  value={`${settings.fov}`}
                >
                  <input
                    id="harmonic-opt-fov"
                    type="range"
                    min={fov.min}
                    max={fov.max}
                    step={1}
                    value={settings.fov}
                    onChange={(e) => onSettingsChange({ ...settings, fov: Number(e.target.value) })}
                  />
                </Field>
                <Field
                  id="harmonic-opt-volume"
                  label={t('harmonic:opt_volume', { defaultValue: 'Master volume' })}
                  value={`${Math.round(settings.volume.master * 100)}%`}
                >
                  <input
                    id="harmonic-opt-volume"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.volume.master}
                    onChange={(e) =>
                      onSettingsChange({
                        ...settings,
                        volume: { ...settings.volume, master: Number(e.target.value) },
                      })
                    }
                  />
                </Field>
                <div className="harmonic-field harmonic-field-check">
                  <input
                    id="harmonic-opt-invert"
                    type="checkbox"
                    checked={settings.invertY}
                    onChange={(e) => onSettingsChange({ ...settings, invertY: e.target.checked })}
                  />
                  <label htmlFor="harmonic-opt-invert">
                    {t('harmonic:opt_invert_y', { defaultValue: 'Invert Y axis' })}
                  </label>
                </div>
                <div className="harmonic-field harmonic-field-check">
                  <input
                    id="harmonic-opt-subtitles"
                    type="checkbox"
                    checked={settings.captions}
                    onChange={(e) => onSettingsChange({ ...settings, captions: e.target.checked })}
                  />
                  <label htmlFor="harmonic-opt-subtitles">
                    {t('harmonic:opt_subtitles', { defaultValue: 'Show subtitles' })}
                  </label>
                </div>
                <Field
                  id="harmonic-opt-size"
                  label={t('harmonic:opt_subtitle_size', { defaultValue: 'Subtitle size' })}
                >
                  <select
                    id="harmonic-opt-size"
                    value={prefs.subtitleSize}
                    onChange={(e) =>
                      setPref({ ...prefs, subtitleSize: e.target.value as SubtitleSize })
                    }
                  >
                    {SUBTITLE_SIZES.map((s) => (
                      <option key={s} value={s}>
                        {sizeLabels[s]}
                      </option>
                    ))}
                  </select>
                </Field>
                <button
                  type="button"
                  className="harmonic-secondary"
                  onClick={() => setView('pause')}
                >
                  <ArrowLeft className="size-4 rtl-flip" aria-hidden />
                  {t('harmonic:back', { defaultValue: 'Back' })}
                </button>
              </>
            )}
          </dialog>
        </div>
      ) : null}
    </div>
  );
}
