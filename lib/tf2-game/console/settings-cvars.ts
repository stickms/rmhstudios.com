/**
 * The Options panel's settings as archived console variables: `sensitivity`,
 * `m_yaw`, `fov_desired`, `volume`, `cl_showfps`, `tf_dingalingaling`… One
 * source of truth, the settings record (lib/tf2-game/client/settings.ts):
 * setting a cvar writes the record (and the play page saves and applies it,
 * as the panel does), and a record changed by the panel is synced back into
 * the cvars without echoing. These cvars are FCVAR_ARCHIVE but persisted by
 * the settings record, so config.cfg leaves them out.
 *
 * Environment-agnostic.
 */

import type { HudGame } from '../client/hud-state';
import {
  defaultSettings,
  FOV_RANGE,
  M_YAW_RANGE,
  SENSITIVITY_RANGE,
  VIEWMODEL_FOV_RANGE,
  type CrosshairStyle,
  type GameSettings,
  type QualityTier,
} from '../client/settings';
import type { ConsoleCore } from './core';
import { FCVAR_ARCHIVE, FCVAR_CLIENTDLL, formatNumber, type ConVar, type CvarDef } from './cvar';

export interface SettingsAccess {
  get(): GameSettings;
  set(next: GameSettings): void;
}

interface Mapping {
  def: Omit<CvarDef, 'default' | 'flags' | 'onChange'>;
  games?: readonly HudGame[];
  read(s: GameSettings): string | number | boolean;
  write(s: GameSettings, cv: ConVar): GameSettings;
}

const CROSSHAIR_STYLES: readonly CrosshairStyle[] = ['cross', 'cross-dot', 'dot', 'circle'];
const QUALITY: readonly QualityTier[] = ['auto', 'low', 'medium', 'high'];
const RGB_RE = /^rgb\((\d{1,3}) (\d{1,3}) (\d{1,3})\)$/;

function rgb(s: GameSettings): [number, number, number] {
  const m = RGB_RE.exec(s.crosshair.color);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [200, 255, 200];
}

function withChannel(s: GameSettings, i: 0 | 1 | 2, v: number): GameSettings {
  const c = rgb(s);
  c[i] = Math.max(0, Math.min(255, Math.round(v)));
  return { ...s, crosshair: { ...s.crosshair, color: `rgb(${c[0]} ${c[1]} ${c[2]})` } };
}

function mappings(game: HudGame): Mapping[] {
  const fov = FOV_RANGE[game];
  /** The last crosshair style that was not 'none' (so `crosshair 0; crosshair 1` gets it back). */
  let lastStyle: CrosshairStyle = 'cross';
  const vol = (key: keyof GameSettings['volume'], name: string, help: string): Mapping => ({
    def: { name, type: 'float', min: 0, max: 1, help },
    read: (s) => s.volume[key],
    write: (s, cv) => ({ ...s, volume: { ...s.volume, [key]: cv.float } }),
  });
  const list: Mapping[] = [
    {
      def: { name: 'sensitivity', type: 'float', min: SENSITIVITY_RANGE.min, max: SENSITIVITY_RANGE.max, help: 'Mouse sensitivity.' },
      read: (s) => s.sensitivity,
      write: (s, cv) => ({ ...s, sensitivity: cv.float }),
    },
    {
      def: { name: 'm_yaw', type: 'float', min: M_YAW_RANGE.min, max: M_YAW_RANGE.max, help: 'Mouse yaw factor (degrees per count at sensitivity 1).' },
      read: (s) => s.mYaw,
      write: (s, cv) => ({ ...s, mYaw: cv.float }),
    },
    {
      def: { name: 'm_pitch', type: 'float', min: -M_YAW_RANGE.max, max: M_YAW_RANGE.max, help: 'Mouse pitch factor; negative inverts the mouse.' },
      read: (s) => formatNumber((s.invertY ? -1 : 1) * s.mPitch),
      write: (s, cv) => ({ ...s, invertY: cv.float < 0, mPitch: Math.max(M_YAW_RANGE.min, Math.abs(cv.float)) }),
    },
    {
      def: { name: 'm_rawinput', type: 'bool', help: 'Raw mouse input (pointer lock without OS acceleration where the browser allows).' },
      read: (s) => s.rawInput,
      write: (s, cv) => ({ ...s, rawInput: cv.bool }),
    },
    {
      def: { name: 'fov_desired', type: 'int', min: fov.min, max: fov.max, help: `Sets the base field-of-view (${fov.min}–${fov.max}).` },
      read: (s) => s.fov,
      write: (s, cv) => ({ ...s, fov: cv.int }),
    },
    {
      def: { name: 'viewmodel_fov', type: 'int', min: VIEWMODEL_FOV_RANGE.min, max: VIEWMODEL_FOV_RANGE.max, help: 'Field of view of the weapon in your hands.' },
      read: (s) => s.viewmodelFov,
      write: (s, cv) => ({ ...s, viewmodelFov: cv.int }),
    },
    vol('master', 'volume', 'Sound volume (master).'),
    vol('sfx', 'snd_sfxvolume', 'Sound effects volume.'),
    vol('voice', 'snd_voicevolume', 'Voice lines volume.'),
    vol('music', 'snd_musicvolume', 'Music volume.'),
    {
      def: { name: 'cl_showfps', type: 'int', min: 0, max: 1, help: 'Draw the frame rate counter.' },
      read: (s) => (s.showFps ? 1 : 0),
      write: (s, cv) => ({ ...s, showFps: cv.int > 0 }),
    },
    {
      def: { name: 'mat_quality', type: 'int', min: 0, max: 3, help: 'Graphics quality tier: 0 auto, 1 low, 2 medium, 3 high (applies on the next load).' },
      read: (s) => QUALITY.indexOf(s.quality),
      write: (s, cv) => ({ ...s, quality: QUALITY[cv.int] ?? 'auto' }),
    },
    {
      def: { name: 'closecaption', type: 'bool', help: 'Closed captions (subtitles and sound captions).' },
      read: (s) => s.captions,
      write: (s, cv) => ({ ...s, captions: cv.bool }),
    },
    {
      def: { name: 'crosshair', type: 'bool', help: 'Draw the crosshair.' },
      read: (s) => s.crosshair.style !== 'none',
      write: (s, cv) => ({ ...s, crosshair: { ...s.crosshair, style: cv.bool ? (s.crosshair.style === 'none' ? lastStyle : s.crosshair.style) : 'none' } }),
    },
    {
      def: { name: 'cl_crosshair_style', type: 'string', values: CROSSHAIR_STYLES, strict: true, help: 'Crosshair shape: cross, cross-dot, dot, circle.' },
      read: (s) => (s.crosshair.style === 'none' ? lastStyle : s.crosshair.style),
      write: (s, cv) => {
        lastStyle = cv.string as CrosshairStyle;
        return { ...s, crosshair: { ...s.crosshair, style: s.crosshair.style === 'none' ? 'none' : lastStyle } };
      },
    },
    {
      def: { name: 'cl_crosshair_red', type: 'int', min: 0, max: 255, help: 'Crosshair colour, red.' },
      read: (s) => rgb(s)[0],
      write: (s, cv) => withChannel(s, 0, cv.int),
    },
    {
      def: { name: 'cl_crosshair_green', type: 'int', min: 0, max: 255, help: 'Crosshair colour, green.' },
      read: (s) => rgb(s)[1],
      write: (s, cv) => withChannel(s, 1, cv.int),
    },
    {
      def: { name: 'cl_crosshair_blue', type: 'int', min: 0, max: 255, help: 'Crosshair colour, blue.' },
      read: (s) => rgb(s)[2],
      write: (s, cv) => withChannel(s, 2, cv.int),
    },
    {
      def: { name: 'cl_crosshair_scale', type: 'int', min: 16, max: 96, help: 'Crosshair size (32 is the default size).' },
      read: (s) => Math.round(s.crosshair.scale * 32),
      write: (s, cv) => ({ ...s, crosshair: { ...s.crosshair, scale: Math.max(0.5, Math.min(3, cv.int / 32)) } }),
    },
    {
      games: ['tf2'],
      def: { name: 'tf_dingalingaling', type: 'bool', help: 'Play a sound when you hit an enemy (and on the last hit).' },
      read: (s) => s.hitSound,
      write: (s, cv) => ({ ...s, hitSound: cv.bool }),
    },
    {
      games: ['tf2'],
      def: { name: 'hud_combattext', type: 'bool', help: 'Show damage numbers over the players you hit.' },
      read: (s) => s.damageNumbers,
      write: (s, cv) => ({ ...s, damageNumbers: cv.bool }),
    },
    {
      def: { name: 'cl_autoreload', type: 'bool', help: 'Reload automatically when a clip is empty.' },
      read: (s) => s.autoReload,
      write: (s, cv) => ({ ...s, autoReload: cv.bool }),
    },
    {
      def: { name: 'hud_reduce_flashing', type: 'bool', help: 'Soften damage flashes and screen fades.' },
      read: (s) => s.reducedFlashing,
      write: (s, cv) => ({ ...s, reducedFlashing: cv.bool }),
    },
    {
      def: { name: 'con_enable', type: 'string', values: ['auto', 'on', 'off'], strict: true, help: 'Enable the developer console (auto: on with a keyboard, off on touch).' },
      read: (s) => s.devConsole,
      write: (s, cv) => ({ ...s, devConsole: cv.string as GameSettings['devConsole'] }),
    },
    {
      def: { name: 'joy_lookspeed', type: 'float', min: 30, max: 720, help: 'Gamepad look speed, degrees per second.' },
      read: (s) => s.gamepad.lookSpeed,
      write: (s, cv) => ({ ...s, gamepad: { ...s.gamepad, lookSpeed: cv.float } }),
    },
    {
      def: { name: 'joy_deadzone', type: 'float', min: 0, max: 0.6, help: 'Gamepad stick dead zone.' },
      read: (s) => s.gamepad.deadzone,
      write: (s, cv) => ({ ...s, gamepad: { ...s.gamepad, deadzone: cv.float } }),
    },
    {
      def: { name: 'joy_response_curve', type: 'float', min: 1, max: 4, help: 'Gamepad response exponent (1 linear).' },
      read: (s) => s.gamepad.curve,
      write: (s, cv) => ({ ...s, gamepad: { ...s.gamepad, curve: cv.float } }),
    },
    {
      def: { name: 'joy_inverty', type: 'bool', help: 'Invert the gamepad look.' },
      read: (s) => s.gamepad.invertY,
      write: (s, cv) => ({ ...s, gamepad: { ...s.gamepad, invertY: cv.bool } }),
    },
    {
      def: { name: 'touch_sensitivity', type: 'float', min: 0.02, max: 2, help: 'Touch look: degrees per pixel of drag.' },
      read: (s) => s.touch.lookSensitivity,
      write: (s, cv) => ({ ...s, touch: { ...s.touch, lookSensitivity: cv.float } }),
    },
    {
      def: { name: 'touch_buttonscale', type: 'float', min: 0.6, max: 1.6, help: 'Size of the on-screen controls.' },
      read: (s) => s.touch.buttonScale,
      write: (s, cv) => ({ ...s, touch: { ...s.touch, buttonScale: cv.float } }),
    },
    {
      def: { name: 'touch_controls', type: 'string', values: ['auto', 'on', 'off'], strict: true, help: 'On-screen controls: auto, on, off.' },
      read: (s) => s.touch.mode,
      write: (s, cv) => ({ ...s, touch: { ...s.touch, mode: cv.string as GameSettings['touch']['mode'] } }),
    },
    {
      def: { name: 'touch_haptics', type: 'bool', help: 'Vibrate on touch controls.' },
      read: (s) => s.touch.haptics,
      write: (s, cv) => ({ ...s, touch: { ...s.touch, haptics: cv.bool } }),
    },
  ];
  return list.filter((m) => !m.games || m.games.includes(game));
}

/** The settings-backed cvar names of a game (tests, docs). */
export function settingsCvarNames(game: HudGame): string[] {
  return mappings(game).map((m) => m.def.name);
}

export interface SettingsCvars {
  /** The settings record changed elsewhere (the Options panel): the cvars follow, silently. */
  sync(s: GameSettings): void;
}

/** Registers the settings-backed cvars on a console. */
export function registerSettingsCvars(core: ConsoleCore, game: HudGame, access: SettingsAccess): SettingsCvars {
  const maps = mappings(game);
  const defaults = defaultSettings(game);
  let syncing = false;
  const bound: Array<{ cv: ConVar; m: Mapping }> = [];
  for (const m of maps) {
    const cv = core.registerCvar({
      ...m.def,
      default: m.read(defaults),
      flags: FCVAR_ARCHIVE | FCVAR_CLIENTDLL,
      settingsBacked: true,
      onChange: (c) => {
        if (syncing) return;
        access.set(m.write(access.get(), c));
      },
    });
    bound.push({ cv, m });
  }
  const out: SettingsCvars = {
    sync(s) {
      syncing = true;
      try {
        for (const { cv, m } of bound) {
          const v = m.read(s);
          cv.set(typeof v === 'boolean' ? (v ? '1' : '0') : String(v), true);
        }
      } finally {
        syncing = false;
      }
    },
  };
  out.sync(access.get());
  return out;
}
