import {
  readJson,
  writeJson,
} from '@/lib/core/persist';
/**
 * Synapse Storm settings persisted to localStorage.
 */

const KEY =
  'synapse-storm-settings';

export interface SynapseStormSettings {
  musicVolume: number;
  sfxVolume: number;
}

const DEFAULTS: SynapseStormSettings =
  {
    musicVolume: 0.25,
    sfxVolume: 0.3,
  };

function load(): SynapseStormSettings {
  const parsed =
    readJson<Partial<SynapseStormSettings> | null>(
      KEY,
      null,
    );
  if (
    !parsed
  )
    return DEFAULTS;
  return {
    musicVolume:
      Math.max(
        0,
        Math.min(
          1,
          parsed.musicVolume ??
            DEFAULTS.musicVolume,
        ),
      ),
    sfxVolume:
      Math.max(
        0,
        Math.min(
          1,
          parsed.sfxVolume ??
            DEFAULTS.sfxVolume,
        ),
      ),
  };
}

function save(
  settings: SynapseStormSettings,
): void {
  writeJson(
    KEY,
    settings,
  );
}

let cache: SynapseStormSettings | null =
  null;

export function getSettings(): SynapseStormSettings {
  if (
    !cache
  )
    cache =
      load();
  return {
    ...cache,
  };
}

export function setMusicVolume(
  v: number,
): void {
  const s =
    getSettings();
  s.musicVolume =
    Math.max(
      0,
      Math.min(
        1,
        v,
      ),
    );
  cache =
    s;
  save(
    s,
  );
}

export function setSfxVolume(
  v: number,
): void {
  const s =
    getSettings();
  s.sfxVolume =
    Math.max(
      0,
      Math.min(
        1,
        v,
      ),
    );
  cache =
    s;
  save(
    s,
  );
}
