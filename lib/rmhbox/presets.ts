/**
 * RMHBox host presets: pure rules (caps, normalising stored values against a
 * minigame's current settings schema). Client-safe; the database half is
 * `presets.server.ts`.
 */
import { validateGameSettings } from '@/lib/rmhbox/game-settings';
import type { GameSettingsSchema, GameSettingValues } from '@/lib/rmhbox/types';

export const PRESETS_PER_GAME = 10;
export const PRESETS_TOTAL = 100;
export const PRESET_NAME_MAX = 40;
/** The most a preset's `values` may weigh as JSON. */
export const PRESET_VALUES_MAX_BYTES = 4096;

export interface RmhboxPreset {
  id: string;
  minigameId: string;
  name: string;
  /** Normalised against the minigame's current schema. */
  values: GameSettingValues;
  isDefault: boolean;
  /** True when the stored values no longer fit the schema (a setting was removed, added or changed). */
  reset: boolean;
  updatedAt: string;
}

/** Machine-readable failure reasons; components map them to translated text. */
export type PresetErrorCode = 'name-taken' | 'game-limit' | 'total-limit' | 'unknown-game' | 'not-found';

function asRecord(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/**
 * Fit stored values to the schema as it is now: unknown keys are dropped, missing or invalid
 * ones take the schema's rule (default or clamp). `reset` says whether anything had to change,
 * so the form can tell the host "Some settings were reset because the game changed".
 */
export function normalizePresetValues(
  schema: GameSettingsSchema,
  raw: unknown,
): { values: GameSettingValues; reset: boolean } {
  const stored = asRecord(raw);
  const values = validateGameSettings(schema, stored);
  const keys = new Set(schema.map((def) => def.key));
  let reset = Object.keys(stored).some((key) => !keys.has(key));
  for (const def of schema) {
    if (!(def.key in stored) || stored[def.key] !== values[def.key]) reset = true;
  }
  return { values, reset };
}

/** The JSON size of a values object, in bytes. */
export function valuesByteLength(values: unknown): number {
  return new TextEncoder().encode(JSON.stringify(values) ?? '').length;
}
