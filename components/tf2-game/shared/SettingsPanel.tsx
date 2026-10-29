/**
 * The games' options: mouse (Source sensitivity × m_yaw 0.022, invert, raw
 * input), video (FOV, viewmodel FOV, quality tier, FPS counter), audio
 * volumes, key bindings (click, then press a key or mouse button), gamepad and
 * touch tuning, and the HUD / accessibility switches (captions, crosshair,
 * hit sounds, damage numbers, reduced flashing). Built from the TF2 Hub's
 * app-tier controls; the caller persists `onChange` (lib/tf2-game/client/settings.ts).
 */
'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HudGame } from '@/lib/tf2-game/client/hud-state';
import {
  defaultSettings,
  FOV_RANGE,
  SENSITIVITY_RANGE,
  VIEWMODEL_FOV_RANGE,
  type CrosshairStyle,
  type GameSettings,
  type QualityTier,
} from '@/lib/tf2-game/client/settings';
import { bindableActions, defaultKeybinds, mouseCode, rebind, unbind, type Action } from '@/lib/tf2-game/client/input/actions';
import { keyLabel } from '@/lib/tf2-game/client/input/keyboard-mouse';
import { Btn, RangeField, Row, SelectField, Toggle } from '../../tf2-hud/ui';
import { TfTabs } from '../../tf2-hud/TfTabs';
import { CrosshairGlyph } from '../tf2/Crosshair';

type Section = 'mouse' | 'video' | 'audio' | 'keys' | 'pad' | 'touch' | 'hud';

function useActionLabels(): Record<Action, string> {
  const { t } = useTranslation('c-tf2-game');
  return {
    forward: t('act_forward', { defaultValue: 'Move forward' }),
    back: t('act_back', { defaultValue: 'Move back' }),
    moveleft: t('act_moveleft', { defaultValue: 'Strafe left' }),
    moveright: t('act_moveright', { defaultValue: 'Strafe right' }),
    jump: t('act_jump', { defaultValue: 'Jump' }),
    duck: t('act_duck', { defaultValue: 'Crouch' }),
    attack: t('act_attack', { defaultValue: 'Fire' }),
    attack2: t('act_attack2', { defaultValue: 'Alt-fire' }),
    attack3: t('act_attack3', { defaultValue: 'Special attack' }),
    reload: t('act_reload', { defaultValue: 'Reload' }),
    use: t('act_use', { defaultValue: 'Use' }),
    speed: t('act_speed', { defaultValue: 'Sprint' }),
    walk: t('act_walk', { defaultValue: 'Walk' }),
    zoom: t('act_zoom', { defaultValue: 'Suit zoom' }),
    showscores: t('act_showscores', { defaultValue: 'Scoreboard' }),
    inspect: t('act_inspect', { defaultValue: 'Inspect weapon' }),
    slot1: t('act_slot1', { defaultValue: 'Weapon slot 1' }),
    slot2: t('act_slot2', { defaultValue: 'Weapon slot 2' }),
    slot3: t('act_slot3', { defaultValue: 'Weapon slot 3' }),
    slot4: t('act_slot4', { defaultValue: 'Weapon slot 4' }),
    slot5: t('act_slot5', { defaultValue: 'Weapon slot 5' }),
    slot6: t('act_slot6', { defaultValue: 'Weapon slot 6' }),
    slot7: t('act_slot7', { defaultValue: 'Weapon slot 7' }),
    slot8: t('act_slot8', { defaultValue: 'Weapon slot 8' }),
    slot9: t('act_slot9', { defaultValue: 'Weapon slot 9' }),
    lastinv: t('act_lastinv', { defaultValue: 'Last weapon' }),
    invnext: t('act_invnext', { defaultValue: 'Next weapon' }),
    invprev: t('act_invprev', { defaultValue: 'Previous weapon' }),
    say: t('act_say', { defaultValue: 'Chat' }),
    say_team: t('act_say_team', { defaultValue: 'Team chat' }),
    voice_menu_1: t('act_voice1', { defaultValue: 'Voice menu 1' }),
    voice_menu_2: t('act_voice2', { defaultValue: 'Voice menu 2' }),
    voice_menu_3: t('act_voice3', { defaultValue: 'Voice menu 3' }),
    medic: t('act_medic', { defaultValue: 'Call for Medic' }),
    changeclass: t('act_changeclass', { defaultValue: 'Change class' }),
    changeteam: t('act_changeteam', { defaultValue: 'Change team' }),
    taunt: t('act_taunt', { defaultValue: 'Taunt' }),
    dropitem: t('act_dropitem', { defaultValue: 'Drop intelligence' }),
    lastdisguise: t('act_lastdisguise', { defaultValue: 'Last disguise' }),
    flashlight: t('act_flashlight', { defaultValue: 'Flashlight' }),
    menu: t('act_menu', { defaultValue: 'Menu' }),
    menu_up: '',
    menu_down: '',
    menu_left: '',
    menu_right: '',
    menu_accept: '',
    menu_back: '',
  };
}

function BindRow({
  action,
  label,
  keys,
  capturing,
  onCapture,
  onClear,
}: {
  action: Action;
  label: string;
  keys: string[];
  capturing: boolean;
  onCapture: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation('c-tf2-game');
  return (
    <Row label={label}>
      <Btn size="xs" variant={capturing ? 'primary' : 'secondary'} onClick={onCapture} aria-label={t('bind_aria', { defaultValue: 'Change key for {{action}}', action: label })} data-action={action}>
        {capturing ? t('bind_press', { defaultValue: 'Press a key…' }) : keys.length ? keys.map(keyLabel).join(' / ') : t('bind_none', { defaultValue: 'Unbound' })}
      </Btn>
      <Btn size="xs" variant="ghost" onClick={onClear} disabled={!keys.length}>
        {t('bind_clear', { defaultValue: 'Clear' })}
      </Btn>
    </Row>
  );
}

export default function SettingsPanel({
  game,
  settings,
  onChange,
}: {
  game: HudGame;
  settings: GameSettings;
  onChange: (next: GameSettings) => void;
}) {
  const { t } = useTranslation('c-tf2-game');
  const labels = useActionLabels();
  const [section, setSection] = useState<Section>('mouse');
  const [capturing, setCapturing] = useState<Action | null>(null);
  const set = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => onChange({ ...settings, [key]: value });
  const fov = FOV_RANGE[game];

  // Capture the next key or mouse button for a binding (capture phase, so the game never sees it).
  useEffect(() => {
    if (!capturing) return;
    const finish = (code: string | null) => {
      if (code) onChange({ ...settings, keybinds: rebind(settings.keybinds, capturing, code) });
      setCapturing(null);
    };
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      finish(e.code === 'Escape' ? null : e.code);
    };
    const onMouse = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.(`[data-action="${capturing}"]`) && e.button === 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      finish(mouseCode(e.button));
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      finish(e.deltaY < 0 ? 'MWheelUp' : 'MWheelDown');
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
      window.removeEventListener('wheel', onWheel, true);
    };
  }, [capturing, settings, onChange]);

  const tabs = [
    { id: 'mouse', label: t('set_mouse', { defaultValue: 'Mouse' }) },
    { id: 'video', label: t('set_video', { defaultValue: 'Video' }) },
    { id: 'audio', label: t('set_audio', { defaultValue: 'Audio' }) },
    { id: 'keys', label: t('set_keys', { defaultValue: 'Keyboard' }) },
    { id: 'pad', label: t('set_pad', { defaultValue: 'Controller' }) },
    { id: 'touch', label: t('set_touch', { defaultValue: 'Touch' }) },
    { id: 'hud', label: t('set_hud', { defaultValue: 'HUD' }) },
  ];
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="flex flex-col gap-3">
      <TfTabs tabs={tabs} value={section} onChange={(id) => setSection(id as Section)} size="sm" aria-label={t('settings', { defaultValue: 'Options' })} />
      <div className="flex flex-col gap-1">
        {section === 'mouse' ? (
          <>
            <Row label={t('set_sensitivity', { defaultValue: 'Sensitivity {{v}}', v: settings.sensitivity.toFixed(2) })}>
              <RangeField
                label={t('set_sensitivity_aria', { defaultValue: 'Mouse sensitivity' })}
                min={SENSITIVITY_RANGE.min}
                max={10}
                step={0.05}
                value={settings.sensitivity}
                onChange={(v) => set('sensitivity', v)}
              />
            </Row>
            <p className="text-[11px] text-(--app-text-dim) pointer-coarse:text-xs">
              {t('set_sensitivity_hint_myaw', {
                defaultValue: '{{deg}}° per mouse count (sensitivity × m_yaw {{yaw}})',
                deg: (settings.sensitivity * settings.mYaw).toFixed(4),
                yaw: settings.mYaw,
              })}
            </p>
            <Row label={t('set_invert', { defaultValue: 'Invert mouse' })}>
              <Toggle label={t('set_invert', { defaultValue: 'Invert mouse' })} checked={settings.invertY} onChange={(v) => set('invertY', v)} />
            </Row>
            <Row label={t('set_raw', { defaultValue: 'Raw input (no acceleration)' })}>
              <Toggle label={t('set_raw', { defaultValue: 'Raw input (no acceleration)' })} checked={settings.rawInput} onChange={(v) => set('rawInput', v)} />
            </Row>
          </>
        ) : null}
        {section === 'video' ? (
          <>
            <Row label={t('set_fov', { defaultValue: 'Field of view {{v}}', v: settings.fov })}>
              <RangeField label={t('set_fov_aria', { defaultValue: 'Field of view' })} min={fov.min} max={fov.max} value={settings.fov} onChange={(v) => set('fov', v)} />
            </Row>
            <Row label={t('set_vmfov', { defaultValue: 'Viewmodel FOV {{v}}', v: settings.viewmodelFov })}>
              <RangeField
                label={t('set_vmfov_aria', { defaultValue: 'Viewmodel field of view' })}
                min={VIEWMODEL_FOV_RANGE.min}
                max={VIEWMODEL_FOV_RANGE.max}
                value={settings.viewmodelFov}
                onChange={(v) => set('viewmodelFov', v)}
              />
            </Row>
            <Row label={t('set_quality', { defaultValue: 'Quality' })}>
              <SelectField value={settings.quality} onChange={(e) => set('quality', e.target.value as QualityTier)} aria-label={t('set_quality', { defaultValue: 'Quality' })}>
                <option value="auto">{t('q_auto', { defaultValue: 'Auto' })}</option>
                <option value="low">{t('q_low', { defaultValue: 'Low' })}</option>
                <option value="medium">{t('q_medium', { defaultValue: 'Medium' })}</option>
                <option value="high">{t('q_high', { defaultValue: 'High' })}</option>
              </SelectField>
            </Row>
            <Row label={t('set_fps', { defaultValue: 'Show FPS' })}>
              <Toggle label={t('set_fps', { defaultValue: 'Show FPS' })} checked={settings.showFps} onChange={(v) => set('showFps', v)} />
            </Row>
          </>
        ) : null}
        {section === 'audio' ? (
          <>
            {(['master', 'sfx', 'voice', 'music'] as const).map((k) => {
              const label =
                k === 'master'
                  ? t('vol_master', { defaultValue: 'Master volume' })
                  : k === 'sfx'
                    ? t('vol_sfx', { defaultValue: 'Effects' })
                    : k === 'voice'
                      ? t('vol_voice', { defaultValue: 'Voice' })
                      : t('vol_music', { defaultValue: 'Music' });
              return (
                <Row key={k} label={`${label} · ${pct(settings.volume[k])}`}>
                  <RangeField label={label} min={0} max={1} step={0.05} value={settings.volume[k]} onChange={(v) => set('volume', { ...settings.volume, [k]: v })} />
                </Row>
              );
            })}
          </>
        ) : null}
        {section === 'keys' ? (
          <>
            {bindableActions(game).map((a) => (
              <BindRow
                key={a}
                action={a}
                label={labels[a]}
                keys={settings.keybinds[a] ?? []}
                capturing={capturing === a}
                onCapture={() => setCapturing(capturing === a ? null : a)}
                onClear={() => set('keybinds', unbind(settings.keybinds, a))}
              />
            ))}
            <div className="pt-2">
              <Btn size="sm" onClick={() => set('keybinds', defaultKeybinds(game))}>
                {t('bind_defaults', { defaultValue: 'Use defaults' })}
              </Btn>
            </div>
            <Row label={t('set_dev_console', { defaultValue: 'Developer console' })}>
              <SelectField
                value={settings.devConsole}
                onChange={(e) => set('devConsole', e.target.value as GameSettings['devConsole'])}
                aria-label={t('set_dev_console', { defaultValue: 'Developer console' })}
              >
                <option value="auto">{t('dev_console_auto', { defaultValue: 'Automatic (on with a keyboard)' })}</option>
                <option value="on">{t('dev_console_on', { defaultValue: 'On' })}</option>
                <option value="off">{t('dev_console_off', { defaultValue: 'Off' })}</option>
              </SelectField>
            </Row>
            <p className="text-[11px] text-(--app-text-dim)">
              {t('set_dev_console_hint', { defaultValue: 'Open it with the ` key, or from the pause menu.' })}
            </p>
          </>
        ) : null}
        {section === 'pad' ? (
          <>
            <Row label={t('pad_look', { defaultValue: 'Look speed {{v}}°/s', v: settings.gamepad.lookSpeed })}>
              <RangeField label={t('pad_look_aria', { defaultValue: 'Look speed' })} min={60} max={600} step={10} value={settings.gamepad.lookSpeed} onChange={(v) => set('gamepad', { ...settings.gamepad, lookSpeed: v })} />
            </Row>
            <Row label={t('pad_deadzone', { defaultValue: 'Dead zone {{v}}', v: pct(settings.gamepad.deadzone) })}>
              <RangeField label={t('pad_deadzone_aria', { defaultValue: 'Stick dead zone' })} min={0} max={0.5} step={0.01} value={settings.gamepad.deadzone} onChange={(v) => set('gamepad', { ...settings.gamepad, deadzone: v })} />
            </Row>
            <Row label={t('pad_curve', { defaultValue: 'Response curve {{v}}', v: settings.gamepad.curve.toFixed(1) })}>
              <RangeField label={t('pad_curve_aria', { defaultValue: 'Response curve' })} min={1} max={4} step={0.1} value={settings.gamepad.curve} onChange={(v) => set('gamepad', { ...settings.gamepad, curve: v })} />
            </Row>
            <Row label={t('pad_invert', { defaultValue: 'Invert look' })}>
              <Toggle label={t('pad_invert', { defaultValue: 'Invert look' })} checked={settings.gamepad.invertY} onChange={(v) => set('gamepad', { ...settings.gamepad, invertY: v })} />
            </Row>
          </>
        ) : null}
        {section === 'touch' ? (
          <>
            <Row label={t('touch_mode', { defaultValue: 'On-screen controls' })}>
              <SelectField value={settings.touch.mode} onChange={(e) => set('touch', { ...settings.touch, mode: e.target.value as GameSettings['touch']['mode'] })} aria-label={t('touch_mode', { defaultValue: 'On-screen controls' })}>
                <option value="auto">{t('touch_auto', { defaultValue: 'Automatic' })}</option>
                <option value="on">{t('touch_on', { defaultValue: 'Always' })}</option>
                <option value="off">{t('touch_off', { defaultValue: 'Never' })}</option>
              </SelectField>
            </Row>
            <Row label={t('touch_look', { defaultValue: 'Look sensitivity {{v}}', v: settings.touch.lookSensitivity.toFixed(2) })}>
              <RangeField label={t('touch_look_aria', { defaultValue: 'Touch look sensitivity' })} min={0.05} max={1} step={0.01} value={settings.touch.lookSensitivity} onChange={(v) => set('touch', { ...settings.touch, lookSensitivity: v })} />
            </Row>
            <Row label={t('touch_size', { defaultValue: 'Button size {{v}}', v: pct(settings.touch.buttonScale) })}>
              <RangeField label={t('touch_size_aria', { defaultValue: 'Touch button size' })} min={0.6} max={1.6} step={0.05} value={settings.touch.buttonScale} onChange={(v) => set('touch', { ...settings.touch, buttonScale: v })} />
            </Row>
            <Row label={t('touch_haptics', { defaultValue: 'Vibration' })}>
              <Toggle label={t('touch_haptics', { defaultValue: 'Vibration' })} checked={settings.touch.haptics} onChange={(v) => set('touch', { ...settings.touch, haptics: v })} />
            </Row>
          </>
        ) : null}
        {section === 'hud' ? (
          <>
            <Row label={t('hud_captions', { defaultValue: 'Closed captions' })}>
              <Toggle label={t('hud_captions', { defaultValue: 'Closed captions' })} checked={settings.captions} onChange={(v) => set('captions', v)} />
            </Row>
            <Row label={t('hud_crosshair', { defaultValue: 'Crosshair' })}>
              {/* relative: the glyph is the HUD's centred crosshair, centred here in its box rather than over the dialog. */}
              <span className="relative inline-grid size-9 place-items-center rounded-(--app-radius-sm) bg-(--app-bg)" aria-hidden="true">
                <CrosshairGlyph style={settings.crosshair.style} color={settings.crosshair.color} size={28} />
              </span>
              <SelectField value={settings.crosshair.style} onChange={(e) => set('crosshair', { ...settings.crosshair, style: e.target.value as CrosshairStyle })} aria-label={t('hud_crosshair', { defaultValue: 'Crosshair' })}>
                <option value="cross">{t('ch_cross', { defaultValue: 'Cross' })}</option>
                <option value="cross-dot">{t('ch_cross_dot', { defaultValue: 'Cross and dot' })}</option>
                <option value="dot">{t('ch_dot', { defaultValue: 'Dot' })}</option>
                <option value="circle">{t('ch_circle', { defaultValue: 'Circle' })}</option>
                <option value="none">{t('ch_none', { defaultValue: 'None' })}</option>
              </SelectField>
            </Row>
            <Row label={t('hud_ch_color', { defaultValue: 'Crosshair colour' })}>
              <SelectField value={settings.crosshair.color} onChange={(e) => set('crosshair', { ...settings.crosshair, color: e.target.value })} aria-label={t('hud_ch_color', { defaultValue: 'Crosshair colour' })}>
                <option value="rgb(200 255 200)">{t('chc_green', { defaultValue: 'Pale green' })}</option>
                <option value="rgb(255 255 255)">{t('chc_white', { defaultValue: 'White' })}</option>
                <option value="rgb(255 230 80)">{t('chc_yellow', { defaultValue: 'Yellow' })}</option>
                <option value="rgb(0 255 255)">{t('chc_cyan', { defaultValue: 'Cyan' })}</option>
                <option value="rgb(255 60 60)">{t('chc_red', { defaultValue: 'Red' })}</option>
              </SelectField>
            </Row>
            <Row label={t('hud_ch_size', { defaultValue: 'Crosshair size {{v}}', v: pct(settings.crosshair.scale) })}>
              <RangeField label={t('hud_ch_size_aria', { defaultValue: 'Crosshair size' })} min={0.5} max={3} step={0.1} value={settings.crosshair.scale} onChange={(v) => set('crosshair', { ...settings.crosshair, scale: v })} />
            </Row>
            {game === 'tf2' ? (
              <>
                <Row label={t('hud_hitsound', { defaultValue: 'Hit sound' })}>
                  <Toggle label={t('hud_hitsound', { defaultValue: 'Hit sound' })} checked={settings.hitSound} onChange={(v) => set('hitSound', v)} />
                </Row>
                <Row label={t('hud_damage', { defaultValue: 'Damage numbers' })}>
                  <Toggle label={t('hud_damage', { defaultValue: 'Damage numbers' })} checked={settings.damageNumbers} onChange={(v) => set('damageNumbers', v)} />
                </Row>
                <Row label={t('hud_autoreload', { defaultValue: 'Automatic reload' })}>
                  <Toggle label={t('hud_autoreload', { defaultValue: 'Automatic reload' })} checked={settings.autoReload} onChange={(v) => set('autoReload', v)} />
                </Row>
              </>
            ) : null}
            <Row label={t('hud_flashing', { defaultValue: 'Reduce flashing' })}>
              <Toggle label={t('hud_flashing', { defaultValue: 'Reduce flashing' })} checked={settings.reducedFlashing} onChange={(v) => set('reducedFlashing', v)} />
            </Row>
          </>
        ) : null}
      </div>
      <div className="flex justify-end border-t border-(--app-border) pt-3">
        <Btn size="sm" variant="ghost" onClick={() => onChange(defaultSettings(game))}>
          {t('settings_reset', { defaultValue: 'Reset all options' })}
        </Btn>
      </div>
    </div>
  );
}
