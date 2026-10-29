import { describe, expect, it } from 'vitest';
import {
  defaultSettings,
  loadSettings,
  mouseToDegrees,
  qualityProfile,
  sanitizeSettings,
  saveSettings,
  settingsKey,
  type SettingsStorage,
} from './settings';

class MemoryStorage implements SettingsStorage {
  readonly map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

const throwing: SettingsStorage = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
};

describe('settings', () => {
  it('has each game’s defaults', () => {
    expect(defaultSettings('tf2').fov).toBe(90);
    expect(defaultSettings('hl2').fov).toBe(75);
    expect(defaultSettings('portal').fov).toBe(75);
    expect(defaultSettings('tf2').viewmodelFov).toBe(54);
    expect(defaultSettings('hl2').captions).toBe(true);
    expect(defaultSettings('tf2').keybinds.forward).toEqual(['KeyW']);
  });

  it('round-trips through storage, per game', () => {
    const st = new MemoryStorage();
    const s = defaultSettings('tf2');
    s.sensitivity = 2.5;
    s.fov = 80;
    s.keybinds = { ...s.keybinds, jump: ['KeyF'] };
    expect(saveSettings('tf2', s, st)).toBe(true);
    expect(st.map.has(settingsKey('tf2'))).toBe(true);
    const back = loadSettings('tf2', st);
    expect(back.sensitivity).toBe(2.5);
    expect(back.fov).toBe(80);
    expect(back.keybinds.jump).toEqual(['KeyF']);
    expect(loadSettings('hl2', st).fov).toBe(75);
  });

  it('falls back to defaults when storage throws or is missing', () => {
    expect(loadSettings('tf2', throwing)).toEqual(defaultSettings('tf2'));
    expect(saveSettings('tf2', defaultSettings('tf2'), throwing)).toBe(false);
    expect(loadSettings('portal', null)).toEqual(defaultSettings('portal'));
    expect(saveSettings('portal', defaultSettings('portal'), null)).toBe(false);
  });

  it('survives corrupt JSON and clamps hostile values', () => {
    const st = new MemoryStorage();
    st.setItem(settingsKey('tf2'), '{not json');
    expect(loadSettings('tf2', st)).toEqual(defaultSettings('tf2'));
    const s = sanitizeSettings(
      {
        sensitivity: 1e9,
        fov: 10,
        volume: { master: -3, sfx: 'loud' },
        quality: 'ultra',
        crosshair: { color: 'url(javascript:alert(1))', style: 'dot' },
        keybinds: { jump: ['Space', 'KeyX', 'KeyC'], hack: ['KeyH'], forward: [42, '<script>'] },
      },
      'tf2',
    );
    expect(s.sensitivity).toBe(20);
    expect(s.fov).toBe(75);
    expect(s.volume.master).toBe(0);
    expect(s.volume.sfx).toBe(1);
    expect(s.quality).toBe('auto');
    expect(s.crosshair.color).toBe(defaultSettings('tf2').crosshair.color);
    expect(s.crosshair.style).toBe('dot');
    expect(s.keybinds.jump).toEqual(['Space', 'KeyX']);
    expect((s.keybinds as Record<string, unknown>).hack).toBeUndefined();
    expect(s.keybinds.forward).toBeUndefined();
    expect(s.keybinds.menu).toEqual(['Escape']);
  });

  it('converts mouse counts to degrees', () => {
    const d = mouseToDegrees(10, 10, { sensitivity: 3, invertY: false });
    expect(d.yaw).toBeCloseTo(-0.66, 6);
    expect(d.pitch).toBeCloseTo(0.66, 6);
    expect(mouseToDegrees(0, 10, { sensitivity: 3, invertY: true }).pitch).toBeCloseTo(-0.66, 6);
  });

  it('resolves the auto quality tier from the device', () => {
    expect(qualityProfile('auto', {}).tier).toBe('high');
    expect(qualityProfile('auto', { touchFirst: true }).tier).toBe('medium');
    expect(qualityProfile('auto', { lowPower: true }).tier).toBe('low');
    expect(qualityProfile('low').resolutionScale).toBeLessThan(1);
    expect(qualityProfile('high').shadows).toBe(false);
  });
});
