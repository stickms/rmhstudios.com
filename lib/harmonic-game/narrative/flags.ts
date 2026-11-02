/**
 * Story flags (H3.2): a typed schema, a per-world service and persistence into the H1.4 save slot.
 *
 *   const f = getFlags(world);
 *   f.set('sanaHelped', true);          // false for an unknown name or a value of the wrong type
 *   f.get('ending');                    // '' | 'anchor' | 'release' | 'silence'
 *   f.persist(world.mapName);           // writes { level, flags } to `harmonic:save` (chapter end)
 *
 * Flags change epilogue lines, never which endings exist (story.md). A new flag is one row in
 * `HARMONIC_FLAGS`. The service starts from the saved flags (the run in progress) and snapshots them
 * at level start, so a death reload inside the world forgets what this attempt set.
 * Environment-agnostic: storage is injected (`setDefaultFlagStorage` for tests).
 */
import type { SpWorld } from '../../sp-game/world/sp-world';
import {
  HARMONIC_SAVE_VERSION,
  browserStorage,
  readHarmonicSave,
  writeHarmonicSave,
  type SaveFlag,
  type SaveStorage,
} from '../client/save';
import { chapterById } from './chapters';

export type FlagDef =
  | { type: 'boolean'; default: boolean }
  | { type: 'number'; default: number }
  | { type: 'enum'; values: readonly string[]; default: string };

export const ENDINGS = ['anchor', 'release', 'silence'] as const;
export type Ending = (typeof ENDINGS)[number];

/** Every flag the game knows. `chapterReached` is bookkeeping for the title screen's Chapters list. */
export const HARMONIC_FLAGS = {
  /** Chapter 2: the player helped Sana. */
  sanaHelped: { type: 'boolean', default: false },
  /** Chapter 6: the player spared Voss. */
  vossSpared: { type: 'boolean', default: false },
  /** Chapter 7: the choice ('' until made). */
  ending: { type: 'enum', values: ['', ...ENDINGS], default: '' },
  /** The furthest chapter number entered (0 = none). */
  chapterReached: { type: 'number', default: 0 },
  // Development flags for levels/dev_flow.ts and the tests.
  devSwitch: { type: 'boolean', default: false },
  devMood: { type: 'enum', values: ['calm', 'alarm'], default: 'calm' },
} as const satisfies Record<string, FlagDef>;

export type FlagName = keyof typeof HARMONIC_FLAGS;
export type FlagValue = SaveFlag;

export const isFlagName = (n: string): n is FlagName =>
  Object.prototype.hasOwnProperty.call(HARMONIC_FLAGS, n);

const defOf = (name: FlagName): FlagDef => HARMONIC_FLAGS[name];

/** Coerces text (an entity input value) to the flag's type; undefined when it does not fit. */
export function parseFlagValue(name: FlagName, raw: string): FlagValue | undefined {
  const def = defOf(name);
  const s = raw.trim();
  if (def.type === 'boolean') {
    if (/^(1|true|yes|on)$/i.test(s)) return true;
    if (/^(0|false|no|off)$/i.test(s)) return false;
    return undefined;
  }
  if (def.type === 'number') {
    const n = Number(s);
    return s !== '' && Number.isFinite(n) ? n : undefined;
  }
  return def.values.includes(s) ? s : undefined;
}

/** True when `value` is acceptable for the flag. */
export function validFlagValue(name: FlagName, value: unknown): value is FlagValue {
  const def = defOf(name);
  if (def.type === 'boolean') return typeof value === 'boolean';
  if (def.type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === 'string' && def.values.includes(value);
}

export const defaultFlags = (): Record<string, FlagValue> =>
  Object.fromEntries(Object.entries(HARMONIC_FLAGS).map(([k, d]) => [k, d.default]));

let defaultStorage: SaveStorage | null | undefined; // undefined = the browser's
/** Tests: where new services read and write the save (undefined restores the browser's). */
export function setDefaultFlagStorage(s: SaveStorage | null | undefined): void {
  defaultStorage = s;
}
const storageNow = (): SaveStorage | null =>
  defaultStorage === undefined ? browserStorage() : defaultStorage;

export class FlagService {
  private values: Record<string, FlagValue>;
  private levelStart: Record<string, FlagValue>;

  constructor(
    initial: Record<string, SaveFlag> = {},
    readonly storage: SaveStorage | null = storageNow(),
  ) {
    this.values = defaultFlags();
    for (const [k, v] of Object.entries(initial)) {
      if (isFlagName(k) && validFlagValue(k, v)) this.values[k] = v;
    }
    this.levelStart = { ...this.values };
  }

  get(name: FlagName): FlagValue {
    return this.values[name];
  }

  /** False (and nothing changes) for an unknown name, a wrong type or a value outside the enum. */
  set(name: string, value: unknown): boolean {
    if (!isFlagName(name) || !validFlagValue(name, value)) return false;
    this.values[name] = value;
    return true;
  }

  all(): Readonly<Record<string, FlagValue>> {
    return { ...this.values };
  }

  /** A death reload: back to the flags this level started with. */
  restoreLevelStart(): void {
    this.values = { ...this.levelStart };
  }

  /**
   * Writes the flags (over any saved keys this build does not know) with `level` as the slot's
   * level. `chapterReached` is raised to the level's chapter number when it is a chapter.
   */
  persist(level: string, now: number = Date.now()): boolean {
    const reached = chapterById(level)?.number ?? 0;
    if (reached > (this.values.chapterReached as number)) this.values.chapterReached = reached;
    const prev = readHarmonicSave(this.storage);
    return writeHarmonicSave(
      {
        v: HARMONIC_SAVE_VERSION,
        level,
        flags: { ...(prev?.flags ?? {}), ...this.values },
        savedAt: now,
      },
      this.storage,
    );
  }
}

const services = new WeakMap<SpWorld, FlagService>();

/** The world's flag service, created on first use from the saved flags. */
export function getFlags(world: SpWorld): FlagService {
  let s = services.get(world);
  if (!s) {
    s = new FlagService(readHarmonicSave(storageNow())?.flags ?? {});
    services.set(world, s);
  }
  return s;
}

/** Attaches a service with explicit initial flags and storage (tests, tooling). */
export function attachFlags(
  world: SpWorld,
  initial: Record<string, SaveFlag>,
  storage: SaveStorage | null = storageNow(),
): FlagService {
  const s = new FlagService(initial, storage);
  services.set(world, s);
  return s;
}

/**
 * A level began: raise `chapterReached` in the slot when `level` is a chapter further on than any
 * entered before (the Chapters list's source). A no-op for other levels and when nothing is saved.
 */
export function noteChapterReached(
  level: string,
  storage: SaveStorage | null = storageNow(),
): void {
  const n = chapterById(level)?.number ?? 0;
  const save = readHarmonicSave(storage);
  if (!n || !save) return;
  const prev = typeof save.flags.chapterReached === 'number' ? save.flags.chapterReached : 0;
  if (n > prev)
    writeHarmonicSave({ ...save, flags: { ...save.flags, chapterReached: n } }, storage);
}

/** The furthest chapter number a save has reached (0 = none). */
export function furthestChapter(flags: Record<string, SaveFlag> | undefined): number {
  const v = flags?.chapterReached;
  return typeof v === 'number' && v > 0 ? Math.floor(v) : 0;
}
