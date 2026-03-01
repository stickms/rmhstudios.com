// @ts-nocheck
/* ═══════════════════════════════════════════
   NEURODRIVE — Game Settings Store
   Centralized settings with localStorage persistence
   ═══════════════════════════════════════════ */

const STORAGE_KEY = 'neurodrive_settings';

const DEFAULTS = {
    palette: 0,
    rainIntensity: 1.0,
    fov: 70,
    cameraDistance: 10,
    cameraHeight: 5,
    bloomStrength: 0.8,
    bloomThreshold: 0.85,
    scanlines: true,
    chromaticAberration: 0.002,
    vehicleEmissive: 0.12,
    neonUnderglow: '#00ffff',
    maxSpeed: 55,
    driftKick: 0.35,
    dataMode: 'manual',
    dataCaptureInterval: 5,
    radioVolume: 0.15,
    paletteMode: 'all',
    paletteLock: false,
    buildingEdges: false,
};

const RANGES = {
    palette:              { min: 0,    max: 7,    type: 'int' },
    rainIntensity:        { min: 0,    max: 2,    type: 'float' },
    fov:                  { min: 50,   max: 110,  type: 'int' },
    cameraDistance:        { min: 5,    max: 20,   type: 'float' },
    cameraHeight:          { min: 2,    max: 12,   type: 'float' },
    bloomStrength:        { min: 0,    max: 2,    type: 'float' },
    bloomThreshold:       { min: 0,    max: 1,    type: 'float' },
    scanlines:            { type: 'bool' },
    chromaticAberration:  { min: 0,    max: 0.01, type: 'float' },
    vehicleEmissive:      { min: 0,    max: 0.5,  type: 'float' },
    neonUnderglow:        { type: 'color' },
    maxSpeed:             { min: 20,   max: 80,   type: 'int' },
    driftKick:            { min: 0.1,  max: 1.0,  type: 'float' },
    dataMode:             { type: 'enum', values: ['manual', 'continuous'] },
    dataCaptureInterval:  { min: 1,    max: 60,   type: 'int' },
    radioVolume:          { min: 0,    max: 1,    type: 'float' },
    paletteMode:          { type: 'enum', values: ['all', 'dark', 'light'] },
    paletteLock:          { type: 'bool' },
    buildingEdges:        { type: 'bool' },
};

export class GameSettings {
    constructor() {
        this._data = { ...DEFAULTS };
        this._load();
    }

    get(key) {
        return key in this._data ? this._data[key] : undefined;
    }

    set(key, value) {
        const range = RANGES[key];
        if (!range) return { ok: false, error: `未知设置项: ${key}` };

        // Validate and coerce
        if (range.type === 'bool') {
            if (typeof value === 'string') {
                value = value === 'true' || value === '1' || value === 'on';
            }
            this._data[key] = !!value;
        } else if (range.type === 'enum') {
            if (!range.values.includes(value)) {
                return { ok: false, error: `无效值: ${value} — 可选: ${range.values.join(', ')}` };
            }
            this._data[key] = value;
        } else if (range.type === 'color') {
            if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
                return { ok: false, error: `无效颜色格式 — 需要 #RRGGBB` };
            }
            this._data[key] = value;
        } else {
            // Numeric
            const num = range.type === 'int' ? parseInt(value, 10) : parseFloat(value);
            if (isNaN(num)) return { ok: false, error: `无效数值: ${value}` };
            if (num < range.min || num > range.max) {
                return { ok: false, error: `超出范围: ${range.min} — ${range.max}` };
            }
            this._data[key] = num;
        }

        this._save();
        return { ok: true, value: this._data[key] };
    }

    reset() {
        this._data = { ...DEFAULTS };
        this._save();
    }

    getAll() {
        return { ...this._data };
    }

    exportJSON() {
        return JSON.stringify(this._data, null, 2);
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                for (const key in saved) {
                    if (key in DEFAULTS) this._data[key] = saved[key];
                }
            }
        } catch (e) {
            console.warn('[Settings] localStorage 读取失败:', e);
        }
    }

    _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
        } catch (e) {
            console.warn('[Settings] localStorage 写入失败:', e);
        }
    }
}
