/**
 * RMHbox — Game Settings Validation & Defaults
 *
 * Utility functions for validating host game settings against schema,
 * computing defaults, and resolving values for minigame handlers.
 *
 * Reference: docs/rmhbox/design-spec/core.md §12A
 */

import type { GameSettingDef, GameSettingsSchema, GameSettingValues } from './types';

/**
 * Build a GameSettingValues object with all defaults from the schema.
 */
export function getDefaultSettings(schema: GameSettingsSchema): GameSettingValues {
  const defaults: GameSettingValues = {};
  for (const def of schema) {
    defaults[def.key] = def.default;
  }
  return defaults;
}

/**
 * Validate a single setting value against its definition.
 * Returns the validated value if valid, or the default if invalid.
 */
function validateSingleSetting(def: GameSettingDef, value: unknown): boolean | number | string {
  switch (def.type) {
    case 'boolean':
      return typeof value === 'boolean' ? value : def.default;

    case 'integer': {
      if (typeof value !== 'number' || !Number.isInteger(value)) return def.default;
      const clamped = Math.max(def.min ?? -Infinity, Math.min(def.max ?? Infinity, value));
      // Snap to step
      if (def.step && def.min !== undefined) {
        const steps = Math.round((clamped - def.min) / def.step);
        return def.min + steps * def.step;
      }
      return clamped;
    }

    case 'float': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return def.default;
      const clamped = Math.max(def.min ?? -Infinity, Math.min(def.max ?? Infinity, value));
      if (def.step && def.min !== undefined) {
        const steps = Math.round((clamped - def.min) / def.step);
        return Math.round((def.min + steps * def.step) * 1000) / 1000;
      }
      return Math.round(clamped * 1000) / 1000;
    }

    case 'select': {
      if (typeof value !== 'string') return def.default;
      if (def.options && !def.options.includes(value)) return def.default;
      return value;
    }

    default:
      return def.default;
  }
}

/**
 * Validate and sanitize a full GameSettingValues object against a schema.
 * Returns a clean object with all keys from the schema, using defaults
 * for any missing or invalid values.
 */
export function validateGameSettings(
  schema: GameSettingsSchema,
  values: Record<string, unknown>,
): GameSettingValues {
  const result: GameSettingValues = {};
  for (const def of schema) {
    result[def.key] = validateSingleSetting(def, values[def.key]);
  }
  return result;
}

/**
 * Merge partial settings updates into existing settings.
 * Only keys present in the schema are accepted; values are validated.
 */
export function mergeGameSettings(
  schema: GameSettingsSchema,
  current: GameSettingValues,
  updates: Record<string, unknown>,
): GameSettingValues {
  const merged = { ...current };
  for (const def of schema) {
    if (def.key in updates) {
      merged[def.key] = validateSingleSetting(def, updates[def.key]);
    }
  }
  return merged;
}
