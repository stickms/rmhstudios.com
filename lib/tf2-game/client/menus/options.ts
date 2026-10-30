/**
 * The Options dialog's model: Source's option pages (GameUI's COptionsDialog — Keyboard, Mouse, Audio,
 * Video, Voice, Multiplayer; plus this game's Controller and Touch pages) as a list of controls, each
 * backed by a console variable (lib/tf2-game/console/settings-cvars.ts). The dialog reads and writes
 * every control through `readSettingsCvar` / `writeSettingsCvar` — the same parse, clamp and mapping as
 * typing the cvar in the console — so the dialog, the console and autoexec.cfg can never disagree.
 *
 * Where a control sits in the game's own dialog file (`resource/OptionsSubMouse.res`,
 * `OptionsSubVideoAdvancedDlg.res`, …: published with the HUD base from the game install), its label
 * and tooltip are that file's `labelText` / `tooltiptext` (`#GameUI_MouseFilter`) — resolved from the
 * game's localisation at run time; without the file the control keeps its own short English (the
 * caller's i18n string, `key` / `fallback`). Panels of those files this game has no setting for
 * (the speaker setup, HDR, shadows, the spray importer…) are not shown; a few are shown disabled with
 * a note where the player would look for them (voice chat, sprays).
 *
 * Environment-agnostic; tested in menus.test.ts.
 */

import { activeEntries, propsOf } from '@/lib/tf2-hud/kv/props';
import { parseCached } from '@/lib/tf2-hud/scene/build';
import type { KvNode } from '@/lib/tf2-hud/kv/types';
import type { CondEnv } from '@/lib/tf2-hud/scheme/cond';
import type { HudGame } from '../hud-state';
import type { GameSettings } from '../settings';
import { readSettingsCvar, settingsCvarDef, settingsCvarNames, writeSettingsCvar } from '../../console/settings-cvars';
import type { ScrItem } from './advanced-options';

export type OptionsTab = 'keyboard' | 'mouse' | 'audio' | 'video' | 'voice' | 'multiplayer' | 'controller' | 'touch';

export const OPTIONS_TABS: readonly OptionsTab[] = ['keyboard', 'mouse', 'audio', 'video', 'voice', 'multiplayer', 'controller', 'touch'];

/** Each tab's title token in the game's localisation (GameUI's property sheet). */
export const TAB_TOKENS: Readonly<Partial<Record<OptionsTab, string>>> = {
  keyboard: '#GameUI_Keyboard',
  mouse: '#GameUI_Mouse',
  audio: '#GameUI_Audio',
  video: '#GameUI_Video',
  voice: '#GameUI_Voice',
  multiplayer: '#GameUI_Multiplayer',
  controller: '#GameUI_Joystick',
};

/** The game's option page files (GameUI's from Half-Life 2's misc pack, TF2's own Multiplayer page). */
export const OPTIONS_FILES = {
  keyboard: 'resource/optionssubkeyboard.res',
  keyboardAdvanced: 'resource/optionssubkeyboardadvanceddlg.res',
  mouse: 'resource/optionssubmouse.res',
  audio: 'resource/optionssubaudio.res',
  video: 'resource/optionssubvideo.res',
  videoAdvanced: 'resource/optionssubvideoadvanceddlg.res',
  voice: 'resource/optionssubvoice.res',
  multiplayer: 'resource/optionssubmultiplayer.res',
  tfAdvanced: 'resource/ui/tfadvancedoptionsdialog.res',
} as const;

export interface OptionChoice {
  value: string;
  /** A `#Token` for the label, when the game has one. */
  token?: string;
  key: string;
  fallback: string;
}

export interface OptionControl {
  id: string;
  tab: OptionsTab;
  /** Behind the page's "Advanced…" button. */
  advanced?: boolean;
  /** The console variable behind it (settings-backed, or a fixed console one for `fixed`). */
  cvar: string;
  /**
   * `toggle` a check box (on = `on`, default "1"); `slider` a range; `select` a list; `fixed` shown
   * checked and disabled (the only mode this game has: `hud_fastswitch`); `unavailable` shown disabled
   * with a note (no cvar behind it: the game has no such feature yet).
   */
  kind: 'toggle' | 'slider' | 'select' | 'fixed' | 'unavailable';
  on?: string;
  off?: string;
  /** CCvarNegateCheckButton: checked while the cvar is negative (`m_pitch`). */
  negate?: boolean;
  /** A slider over the cvar's magnitude, keeping its sign (`m_pitch`'s, which is the invert). */
  magnitude?: boolean;
  min?: number;
  max?: number;
  step?: number;
  /** How a slider's value reads (`pct` 0–1 as a percentage). */
  format?: 'pct' | 'deg' | 'fixed2' | 'int' | 'fixed3';
  choices?: OptionChoice[];
  /** The panel of the game's dialog file that labels it: `labelText` / `tooltiptext` of `field`, or of `labelField`. */
  res?: { file: string; field: string; labelField?: string };
  /** A label token used when there is no `.res` label (`#TF_autoreload`). */
  token?: string;
  tooltipToken?: string;
  /** The i18n key (c-tf2-game) and English fallback for the label. */
  key: string;
  fallback: string;
  games?: readonly HudGame[];
}

const F = OPTIONS_FILES;
const DETAIL_CHOICES = (): OptionChoice[] => [
  { value: 'auto', key: 'opt_detail_auto', fallback: 'Automatic' },
  { value: '0', token: '#GameUI_High', key: 'opt_detail_high', fallback: 'High' },
  { value: '1', token: '#GameUI_Medium', key: 'opt_detail_medium', fallback: 'Medium' },
  { value: '2', token: '#GameUI_Low', key: 'opt_detail_low', fallback: 'Low' },
];

/** Every control of the dialog, in page order (the order of the game's own pages). */
export const OPTION_CONTROLS: readonly OptionControl[] = [
  // Keyboard → Advanced… (OptionsSubKeyboardAdvancedDlg.res).
  {
    id: 'con_enable',
    tab: 'keyboard',
    advanced: true,
    cvar: 'con_enable',
    kind: 'select',
    res: { file: F.keyboardAdvanced, field: 'ConsoleCheck' },
    key: 'set_dev_console',
    fallback: 'Developer console',
    choices: [
      { value: 'auto', key: 'dev_console_auto', fallback: 'Automatic (on with a keyboard)' },
      { value: 'on', token: '#GameUI_Enabled', key: 'dev_console_on', fallback: 'On' },
      { value: 'off', token: '#GameUI_Disabled', key: 'dev_console_off', fallback: 'Off' },
    ],
  },
  {
    id: 'hud_fastswitch',
    tab: 'keyboard',
    advanced: true,
    cvar: 'hud_fastswitch',
    kind: 'fixed',
    res: { file: F.keyboardAdvanced, field: 'FastSwitchCheck' },
    key: 'opt_fastswitch',
    fallback: 'Fast weapon switch',
  },
  // Mouse (OptionsSubMouse.res).
  { id: 'reverse_mouse', tab: 'mouse', cvar: 'm_pitch', kind: 'toggle', negate: true, res: { file: F.mouse, field: 'ReverseMouse' }, key: 'set_invert', fallback: 'Invert mouse' },
  { id: 'm_filter', tab: 'mouse', cvar: 'm_filter', kind: 'toggle', res: { file: F.mouse, field: 'MouseFilter' }, key: 'opt_mouse_filter', fallback: 'Mouse filter' },
  {
    id: 'sensitivity',
    tab: 'mouse',
    cvar: 'sensitivity',
    kind: 'slider',
    min: 0.1,
    max: 20,
    step: 0.05,
    format: 'fixed2',
    res: { file: F.mouse, field: 'Slider', labelField: 'Label3' },
    key: 'set_sensitivity_aria',
    fallback: 'Mouse sensitivity',
  },
  { id: 'm_rawinput', tab: 'mouse', cvar: 'm_rawinput', kind: 'toggle', res: { file: F.mouse, field: 'MouseRaw' }, key: 'set_raw', fallback: 'Raw input (no acceleration)' },
  {
    id: 'm_customaccel',
    tab: 'mouse',
    cvar: 'm_customaccel',
    kind: 'toggle',
    on: '3',
    off: '0',
    res: { file: F.mouse, field: 'MouseAccelerationCheckbox' },
    key: 'opt_mouse_accel',
    fallback: 'Mouse acceleration',
  },
  {
    id: 'm_customaccel_exponent',
    tab: 'mouse',
    cvar: 'm_customaccel_exponent',
    kind: 'slider',
    min: 1,
    max: 1.4,
    step: 0.01,
    format: 'fixed2',
    res: { file: F.mouse, field: 'MouseAccelerationSlider' },
    key: 'opt_mouse_accel_amount',
    fallback: 'Acceleration amount',
  },
  { id: 'm_yaw', tab: 'mouse', advanced: true, cvar: 'm_yaw', kind: 'slider', min: 0.001, max: 0.2, step: 0.001, format: 'fixed3', key: 'opt_m_yaw', fallback: 'Yaw (m_yaw)' },
  {
    id: 'm_pitch',
    tab: 'mouse',
    advanced: true,
    cvar: 'm_pitch',
    kind: 'slider',
    magnitude: true,
    min: 0.001,
    max: 0.2,
    step: 0.001,
    format: 'fixed3',
    key: 'opt_m_pitch',
    fallback: 'Pitch (m_pitch)',
  },
  // Audio (OptionsSubAudio.res).
  { id: 'volume', tab: 'audio', cvar: 'volume', kind: 'slider', min: 0, max: 1, step: 0.05, format: 'pct', res: { file: F.audio, field: 'SFXSlider', labelField: 'sfx label' }, key: 'vol_master', fallback: 'Master volume' },
  { id: 'snd_musicvolume', tab: 'audio', cvar: 'snd_musicvolume', kind: 'slider', min: 0, max: 1, step: 0.05, format: 'pct', res: { file: F.audio, field: 'MusicSlider', labelField: 'MusicVolumeLabel' }, key: 'vol_music', fallback: 'Music' },
  { id: 'snd_sfxvolume', tab: 'audio', cvar: 'snd_sfxvolume', kind: 'slider', min: 0, max: 1, step: 0.05, format: 'pct', key: 'vol_sfx', fallback: 'Effects' },
  { id: 'snd_voicevolume', tab: 'audio', cvar: 'snd_voicevolume', kind: 'slider', min: 0, max: 1, step: 0.05, format: 'pct', key: 'opt_vol_voice_lines', fallback: 'Voice lines' },
  {
    id: 'closecaption',
    tab: 'audio',
    cvar: 'closecaption',
    kind: 'select',
    res: { file: F.audio, field: 'CloseCaptionCheck', labelField: 'Label2' },
    key: 'hud_captions',
    fallback: 'Closed captions',
    choices: [
      { value: '0', token: '#GameUI_NoClosedCaptions', key: 'opt_cc_off', fallback: 'No captions' },
      { value: '1', token: '#GameUI_SubtitlesAndSoundEffects', key: 'opt_cc_on', fallback: 'Subtitles and sound captions' },
    ],
  },
  // Video (OptionsSubVideo.res; the display mode is the page's, handled by the dialog: the browser's full screen).
  {
    id: 'mat_viewportscale',
    tab: 'video',
    cvar: 'mat_viewportscale',
    kind: 'select',
    res: { file: F.video, field: 'Resolution', labelField: 'Label1' },
    key: 'opt_resolution',
    fallback: 'Resolution scale',
    choices: [
      { value: '0', key: 'opt_res_auto', fallback: 'Automatic' },
      { value: '1', key: 'opt_res_100', fallback: '100%' },
      { value: '0.85', key: 'opt_res_85', fallback: '85%' },
      { value: '0.7', key: 'opt_res_70', fallback: '70%' },
      { value: '0.55', key: 'opt_res_55', fallback: '55%' },
      { value: '0.4', key: 'opt_res_40', fallback: '40%' },
    ],
  },
  {
    id: 'mat_quality',
    tab: 'video',
    cvar: 'mat_quality',
    kind: 'select',
    key: 'set_quality',
    fallback: 'Quality',
    choices: [
      { value: '0', key: 'q_auto', fallback: 'Auto' },
      { value: '1', token: '#GameUI_Low', key: 'q_low', fallback: 'Low' },
      { value: '2', token: '#GameUI_Medium', key: 'q_medium', fallback: 'Medium' },
      { value: '3', token: '#GameUI_High', key: 'q_high', fallback: 'High' },
    ],
  },
  { id: 'cl_showfps', tab: 'video', cvar: 'cl_showfps', kind: 'toggle', key: 'set_fps', fallback: 'Show FPS' },
  { id: 'hud_reduce_flashing', tab: 'video', cvar: 'hud_reduce_flashing', kind: 'toggle', key: 'hud_flashing', fallback: 'Reduce flashing' },
  // Video → Advanced… (OptionsSubVideoAdvancedDlg.res).
  { id: 'r_rootlod', tab: 'video', advanced: true, cvar: 'r_rootlod', kind: 'select', res: { file: F.videoAdvanced, field: 'ModelDetail', labelField: 'Label3' }, key: 'opt_model_detail', fallback: 'Model detail', choices: DETAIL_CHOICES() },
  { id: 'mat_picmip', tab: 'video', advanced: true, cvar: 'mat_picmip', kind: 'select', res: { file: F.videoAdvanced, field: 'TextureDetail', labelField: 'Label4' }, key: 'opt_texture_detail', fallback: 'Texture detail', choices: DETAIL_CHOICES() },
  { id: 'cl_effects_detail', tab: 'video', advanced: true, cvar: 'cl_effects_detail', kind: 'select', key: 'opt_effects_detail', fallback: 'Effect detail', choices: DETAIL_CHOICES() },
  {
    id: 'mat_antialias',
    tab: 'video',
    advanced: true,
    cvar: 'mat_antialias',
    kind: 'select',
    res: { file: F.videoAdvanced, field: 'AntialiasingMode', labelField: 'Label5' },
    key: 'opt_antialias',
    fallback: 'Antialiasing mode',
    choices: [
      { value: 'auto', key: 'opt_detail_auto', fallback: 'Automatic' },
      { value: '0', token: '#GameUI_None', key: 'opt_aa_off', fallback: 'None' },
      { value: '4', key: 'opt_aa_msaa', fallback: 'Multisample' },
    ],
  },
  {
    id: 'mat_forceaniso',
    tab: 'video',
    advanced: true,
    cvar: 'mat_forceaniso',
    kind: 'select',
    res: { file: F.videoAdvanced, field: 'FilteringMode', labelField: 'Label6' },
    key: 'opt_filtering',
    fallback: 'Filtering mode',
    choices: [
      { value: '0', key: 'opt_detail_auto', fallback: 'Automatic' },
      { value: '1', token: '#GameUI_Bilinear', key: 'opt_aniso_1', fallback: 'Bilinear' },
      { value: '2', key: 'opt_aniso_2', fallback: 'Anisotropic 2×' },
      { value: '4', key: 'opt_aniso_4', fallback: 'Anisotropic 4×' },
      { value: '8', key: 'opt_aniso_8', fallback: 'Anisotropic 8×' },
      { value: '16', key: 'opt_aniso_16', fallback: 'Anisotropic 16×' },
    ],
  },
  { id: 'fov_desired', tab: 'video', advanced: true, cvar: 'fov_desired', kind: 'slider', step: 1, format: 'deg', res: { file: F.videoAdvanced, field: 'FovSlider', labelField: 'FOVLabel' }, key: 'set_fov_aria', fallback: 'Field of view' },
  { id: 'viewmodel_fov', tab: 'video', advanced: true, cvar: 'viewmodel_fov', kind: 'slider', step: 1, format: 'deg', key: 'set_vmfov_aria', fallback: 'Viewmodel field of view' },
  // Voice (OptionsSubVoice.res): no voice chat in this game yet.
  { id: 'voice_modenable', tab: 'voice', cvar: '', kind: 'unavailable', res: { file: F.voice, field: 'voice_modenable' }, key: 'opt_voice_enable', fallback: 'Enable voice in this game' },
  // Multiplayer (OptionsSubMultiplayer.res).
  { id: 'spray', tab: 'multiplayer', cvar: '', kind: 'unavailable', res: { file: F.multiplayer, field: 'SpraypaintList', labelField: 'Label2' }, key: 'opt_spray', fallback: 'Spray', games: ['tf2'] },
  { id: 'crosshair', tab: 'multiplayer', cvar: 'crosshair', kind: 'toggle', key: 'opt_crosshair_on', fallback: 'Draw the crosshair' },
  {
    id: 'cl_crosshair_style',
    tab: 'multiplayer',
    cvar: 'cl_crosshair_style',
    kind: 'select',
    res: { file: F.multiplayer, field: 'AdvCrosshairList', labelField: 'AdvCrosshairLabel' },
    key: 'hud_crosshair',
    fallback: 'Crosshair',
    choices: [
      { value: 'cross', key: 'ch_cross', fallback: 'Cross' },
      { value: 'cross-dot', key: 'ch_cross_dot', fallback: 'Cross and dot' },
      { value: 'dot', key: 'ch_dot', fallback: 'Dot' },
      { value: 'circle', key: 'ch_circle', fallback: 'Circle' },
    ],
  },
  { id: 'cl_crosshair_red', tab: 'multiplayer', cvar: 'cl_crosshair_red', kind: 'slider', step: 1, format: 'int', res: { file: F.multiplayer, field: 'Red Color Slider', labelField: 'RedLabel' }, key: 'opt_ch_red', fallback: 'Red' },
  { id: 'cl_crosshair_green', tab: 'multiplayer', cvar: 'cl_crosshair_green', kind: 'slider', step: 1, format: 'int', res: { file: F.multiplayer, field: 'Green Color Slider', labelField: 'GreenLabel' }, key: 'opt_ch_green', fallback: 'Green' },
  { id: 'cl_crosshair_blue', tab: 'multiplayer', cvar: 'cl_crosshair_blue', kind: 'slider', step: 1, format: 'int', res: { file: F.multiplayer, field: 'Blue Color Slider', labelField: 'BlueLabel' }, key: 'opt_ch_blue', fallback: 'Blue' },
  { id: 'cl_crosshair_scale', tab: 'multiplayer', cvar: 'cl_crosshair_scale', kind: 'slider', step: 1, format: 'int', res: { file: F.multiplayer, field: 'Scale Slider', labelField: 'ScaleLabel' }, key: 'opt_ch_scale', fallback: 'Scale' },
  // Controller (OptionsSubMouse.res's gamepad half).
  { id: 'joy_lookspeed', tab: 'controller', cvar: 'joy_lookspeed', kind: 'slider', min: 60, max: 600, step: 10, format: 'int', res: { file: F.mouse, field: 'JoystickYawSlider', labelField: 'JoystickYawSensitivityPreLabel' }, key: 'pad_look_aria', fallback: 'Look speed' },
  { id: 'joy_deadzone', tab: 'controller', cvar: 'joy_deadzone', kind: 'slider', min: 0, max: 0.5, step: 0.01, format: 'pct', key: 'pad_deadzone_aria', fallback: 'Stick dead zone' },
  { id: 'joy_response_curve', tab: 'controller', cvar: 'joy_response_curve', kind: 'slider', min: 1, max: 4, step: 0.1, format: 'fixed2', key: 'pad_curve_aria', fallback: 'Response curve' },
  { id: 'joy_inverty', tab: 'controller', cvar: 'joy_inverty', kind: 'toggle', res: { file: F.mouse, field: 'ReverseJoystick' }, key: 'pad_invert', fallback: 'Invert look' },
  // Touch.
  {
    id: 'touch_controls',
    tab: 'touch',
    cvar: 'touch_controls',
    kind: 'select',
    key: 'touch_mode',
    fallback: 'On-screen controls',
    choices: [
      { value: 'auto', key: 'touch_auto', fallback: 'Automatic' },
      { value: 'on', key: 'touch_on', fallback: 'Always' },
      { value: 'off', key: 'touch_off', fallback: 'Never' },
    ],
  },
  { id: 'touch_sensitivity', tab: 'touch', cvar: 'touch_sensitivity', kind: 'slider', min: 0.05, max: 1, step: 0.01, format: 'fixed2', key: 'touch_look_aria', fallback: 'Touch look sensitivity' },
  { id: 'touch_buttonscale', tab: 'touch', cvar: 'touch_buttonscale', kind: 'slider', min: 0.6, max: 1.6, step: 0.05, format: 'pct', key: 'touch_size_aria', fallback: 'Touch button size' },
  { id: 'touch_haptics', tab: 'touch', cvar: 'touch_haptics', kind: 'toggle', key: 'touch_haptics', fallback: 'Vibration' },
];

/** Console cvars the dialog shows as fixed (checked, disabled): their only value in this game. */
export const FIXED_CVARS: Readonly<Record<string, string>> = { hud_fastswitch: '1' };

/** Without the game's `user_default.scr`: the TF2 Advanced Options this game has, in the script's order. */
export const ADVANCED_FALLBACK: readonly ScrItem[] = [
  { cvar: 'category2', type: 'category', prompt: '#TF_OptionCategory_Combat' },
  { cvar: 'cl_autoreload', type: 'bool', prompt: '#TF_autoreload', tooltip: '#Tooltip_autoreload' },
  { cvar: 'hud_fastswitch', type: 'bool', prompt: '#GameUI_FastSwitchCheck', tooltip: '#Tooltip_hud_fastswitch' },
  { cvar: 'tf_dingalingaling', type: 'bool', prompt: '#TF_Hitbeeps', tooltip: '#Tooltip_Hitbeeps' },
  { cvar: 'hud_combattext', type: 'bool', prompt: '#TF_CombatText', tooltip: '#Tooltip_CombatText' },
  { cvar: 'category4', type: 'category', prompt: '#TF_OptionCategory_HUD' },
  { cvar: 'viewmodel_fov', type: 'slider', prompt: '#TF_viewmodelfov_option', tooltip: '#Tooltip_viewmodelfov_option', min: 54, max: 70 },
];

/** Our own words for the advanced options' cvars, when the localisation has none. */
export const ADVANCED_LABELS: Readonly<Record<string, { key: string; fallback: string }>> = {
  cl_autoreload: { key: 'hud_autoreload', fallback: 'Automatic reload' },
  hud_fastswitch: { key: 'opt_fastswitch', fallback: 'Fast weapon switch' },
  tf_dingalingaling: { key: 'hud_hitsound', fallback: 'Hit sound' },
  hud_combattext: { key: 'hud_damage', fallback: 'Damage numbers' },
  viewmodel_fov: { key: 'set_vmfov_aria', fallback: 'Viewmodel field of view' },
  closecaption: { key: 'hud_captions', fallback: 'Closed captions' },
  crosshair: { key: 'opt_crosshair_on', fallback: 'Draw the crosshair' },
  '#TF_OptionCategory_Combat': { key: 'opt_cat_combat', fallback: 'Combat' },
  '#TF_OptionCategory_HUD': { key: 'opt_cat_hud', fallback: 'HUD' },
};

/** The controls of a tab (main page, or its Advanced section) for a game. */
export function tabControls(game: HudGame, tab: OptionsTab, advanced = false): OptionControl[] {
  const have = new Set(settingsCvarNames(game));
  return OPTION_CONTROLS.filter(
    (c) =>
      c.tab === tab &&
      !!c.advanced === advanced &&
      (!c.games || c.games.includes(game)) &&
      (c.kind === 'unavailable' || c.kind === 'fixed' || have.has(c.cvar)),
  );
}

/** Whether an advanced-options entry's cvar is one this game has (settings-backed or fixed). */
export function hasOptionCvar(game: HudGame, cvar: string): boolean {
  return cvar in FIXED_CVARS || settingsCvarNames(game).includes(cvar);
}

/** A control for one TF2 Advanced Options entry (its cvar must pass `hasOptionCvar`). */
export function advancedControl(game: HudGame, item: ScrItem): OptionControl {
  const own = ADVANCED_LABELS[item.cvar] ?? { key: 'opt_advanced_item', fallback: item.cvar };
  const base = { id: `adv:${item.cvar}`, tab: 'multiplayer' as const, advanced: true, cvar: item.cvar, token: item.prompt, tooltipToken: item.tooltip, key: own.key, fallback: own.fallback };
  if (item.cvar in FIXED_CVARS) return { ...base, kind: 'fixed' };
  const def = settingsCvarDef(game, item.cvar);
  if (item.type === 'list' && item.items?.length) {
    return {
      ...base,
      kind: 'select',
      choices: item.items.map((it) => ({ value: it.value, token: it.label, key: 'opt_advanced_choice', fallback: it.label.replace(/^#/, '') })),
    };
  }
  if (item.type === 'slider' || item.type === 'number' || (def && def.type !== 'bool' && def.type !== 'string')) {
    return { ...base, kind: 'slider', step: def?.type === 'int' ? 1 : 0.01, format: def?.type === 'int' ? 'int' : 'fixed2' };
  }
  return { ...base, kind: 'toggle' };
}

/* ───────────────────────── values ───────────────────────── */

/** A control's range: its own, else the cvar's. */
export function controlRange(game: HudGame, c: OptionControl): { min: number; max: number } {
  const def = settingsCvarDef(game, c.cvar);
  return { min: c.min ?? def?.min ?? 0, max: c.max ?? def?.max ?? 1 };
}

/** The value a control shows, read through the console variable. */
export function controlValue(game: HudGame, s: GameSettings, c: OptionControl): string | number | boolean {
  if (c.kind === 'unavailable') return false;
  if (c.kind === 'fixed') return true;
  const raw = readSettingsCvar(game, s, c.cvar) ?? '';
  if (c.kind === 'toggle') {
    if (c.negate) return Number(raw) < 0;
    return raw === (c.on ?? '1');
  }
  if (c.kind === 'slider') {
    const v = Number(raw);
    return c.magnitude ? Math.abs(v) : v;
  }
  return raw;
}

/** The settings after the player sets a control, written through the console variable. */
export function setControl(game: HudGame, s: GameSettings, c: OptionControl, value: string | number | boolean): GameSettings {
  if (c.kind === 'unavailable' || c.kind === 'fixed') return s;
  const cur = Number(readSettingsCvar(game, s, c.cvar) ?? 0);
  if (c.kind === 'toggle') {
    const on = !!value;
    if (c.negate) return writeSettingsCvar(game, s, c.cvar, String((on ? -1 : 1) * Math.abs(cur)));
    return writeSettingsCvar(game, s, c.cvar, on ? (c.on ?? '1') : (c.off ?? '0'));
  }
  if (c.kind === 'slider') {
    const v = Number(value);
    if (!Number.isFinite(v)) return s;
    return writeSettingsCvar(game, s, c.cvar, c.magnitude ? String((cur < 0 ? -1 : 1) * Math.abs(v)) : String(v));
  }
  return writeSettingsCvar(game, s, c.cvar, String(value));
}

/* ───────────────────────── the game's dialog files ───────────────────────── */

/** A block of a dialog file by name (any depth below its root), or undefined. */
function findBlock(text: string, env: CondEnv, name: string): KvNode | undefined {
  const top = parseCached(text).roots.find((n) => n.children);
  const want = name.toLowerCase();
  const walk = (entries: readonly KvNode[], depth: number): KvNode | undefined => {
    for (const e of entries) {
      if (!e.children) continue;
      if (e.key.text.toLowerCase() === want) return e;
      if (depth < 8) {
        const hit = walk(activeEntries(e, env), depth + 1);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  return top?.children ? walk(activeEntries(top, env), 0) : undefined;
}

/**
 * A control's label and tooltip as the game's own dialog file gives them (raw: `#Token`s or text), or
 * nothing when the file is not there, lacks the panel, or the panel is hidden in it.
 */
export function resText(
  readText: (path: string) => string | undefined,
  env: CondEnv,
  c: Pick<OptionControl, 'res'>,
): { label?: string; tooltip?: string } {
  if (!c.res) return {};
  const text = readText(c.res.file);
  if (text === undefined) return {};
  const block = findBlock(text, env, c.res.field);
  if (!block) return {};
  const props = propsOf(block, { env, minmode: false });
  const labelBlock = c.res.labelField ? findBlock(text, env, c.res.labelField) : block;
  const labelProps = labelBlock ? propsOf(labelBlock, { env, minmode: false }) : props;
  const label = labelProps.get('labeltext');
  const tooltip = props.get('tooltiptext');
  return {
    label: label && label.trim() ? label : undefined,
    tooltip: tooltip && tooltip.trim() ? tooltip : undefined,
  };
}
