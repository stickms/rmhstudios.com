'use client';

/**
 * Bum's Rush — the component layer's own state.
 *
 * Scope is deliberate and narrow: **which screen is up, what the player owns,
 * and how their devices are bound.** Everything that changes at frame rate —
 * positions, tension, the timer — never comes near this store; it lives in refs
 * inside the loop and is written straight to the DOM (design doc §17, and the
 * reason the HUD does not re-render sixty times a second).
 *
 * It is a game-local store rather than an entry in `stores/`, because nothing
 * outside `/bums-rush` has any use for a Bum's Rush wardrobe. The site tier's
 * stores are for state the site shares.
 *
 * ## Two persistence paths, on purpose
 *
 * - **The profile** (cosmetics, clears, settings) goes through
 *   `lib/bums-rush/progress/save.ts`, which already owns the localStorage key,
 *   the cloud transport and the sign-in merge. Duplicating any of that here
 *   would give a signed-in player two disagreeing saves.
 * - **Bindings** are stored separately under their own key, because §4.5 keys
 *   them by DEVICE (one set per pad model, one for the keyboard, one for touch)
 *   and a player who has never signed in must still keep them. They are
 *   mirrored onto the profile by the save layer's own schema, not by this file.
 */

import { create } from 'zustand';
import type { PadBrand } from '@/lib/bums-rush/input';
import {
  cloneBindingSet,
  defaultBindingSetFor,
  deserialiseBindingSet,
  hashPadId,
  serialiseBindingSet,
  type BindingSet,
  type DeviceProfileKind,
} from '@/lib/bums-rush/input';
import {
  applyLevelClear,
  createDefaultProfile,
  loadOrCreateLocalProfile,
  saveLocalProfile,
} from '@/lib/bums-rush/progress/save';
import type {
  Assists,
  Cosmetics,
  GameSettings,
  LevelResult,
  Profile,
  RoomMode,
} from '@/lib/bums-rush/types';

// ─── Screens ────────────────────────────────────────────────────────────────

/**
 * Every screen the game can be on. A discriminated union rather than a string
 * enum plus loose params, so "the results card without a result" is not a state
 * that can be reached.
 */
export type Screen =
  | { kind: 'title' }
  | { kind: 'mode' }
  | { kind: 'world-map' }
  | { kind: 'level-card'; levelId: string }
  | { kind: 'lobby' }
  | { kind: 'wardrobe' }
  | { kind: 'settings' }
  | { kind: 'bindings' }
  | { kind: 'credits' }
  | { kind: 'playing'; levelId: string; mode: RoomMode }
  | { kind: 'results'; levelId: string; result: LevelResult };

export type ViewportMode = 'viewport' | 'page';

/**
 * **The structural decision** (design-language.md §12.1 rule 6).
 *
 * A live level is a surface that never scrolls, so it is `.app-viewport`.
 * Everything else here is a document — a column you read top to bottom — and
 * gets `.app-page`, which lets mobile Safari collapse its address bar. Reaching
 * for `.app-viewport` on the world map would cost a phone ~110px of screen for
 * the whole visit.
 *
 * Exported as a function rather than inlined in the component so the mapping is
 * one testable thing instead of a ternary that a new screen can silently miss.
 */
export function viewportModeFor(screen: Screen): ViewportMode {
  return screen.kind === 'playing' ? 'viewport' : 'page';
}

/** Screens that are their own top level — reaching one clears the back stack. */
export function isRootScreen(screen: Screen): boolean {
  return screen.kind === 'title';
}

// ─── Binding profiles ───────────────────────────────────────────────────────

const BINDINGS_KEY = 'bums-rush:bindings:v1';

/**
 * The storage key for one device's bindings.
 *
 * Pads are keyed by a hash of `gamepad.id` (§4.5) so an Xbox pad and a
 * DualSense plugged into the same browser keep separate remaps. `hashPadId`'s
 * own doc records the accepted limitation: two identical pads share a profile,
 * because the Gamepad API exposes no serial.
 */
export function bindingKeyFor(kind: DeviceProfileKind, padId?: string | null): string {
  if (kind !== 'gamepad') return kind;
  return padId ? `gamepad:${hashPadId(padId)}` : 'gamepad';
}

/** The device kind a storage key belongs to — the inverse of `bindingKeyFor`. */
export function kindForBindingKey(key: string): DeviceProfileKind {
  if (key.startsWith('gamepad')) return 'gamepad';
  if (key === 'keyboard-p2') return 'keyboard-p2';
  if (key === 'touch') return 'touch';
  return 'keyboard-p1';
}

function readStoredBindings(): Record<string, BindingSet> {
  if (typeof window === 'undefined') return {};

  let parsed: unknown;
  try {
    // One try around both the read and the parse: private mode throws on the
    // former, a truncated write throws on the latter, and the answer to both is
    // the same — the shipped defaults are a complete, playable game.
    const raw = window.localStorage.getItem(BINDINGS_KEY);
    if (!raw) return {};
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) return {};

  const out: Record<string, BindingSet> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    // Each entry is re-validated through the input layer's own migrator, so one
    // corrupt profile costs that profile and not the whole file — the rule
    // `bindings.ts` exists to keep is that a player can always move.
    const fallback = defaultBindingSetFor(kindForBindingKey(key));
    out[key] = deserialiseBindingSet(
      typeof value === 'string' ? value : JSON.stringify(value),
      fallback,
    );
  }
  return out;
}

function writeStoredBindings(bindings: Record<string, BindingSet>): void {
  if (typeof window === 'undefined') return;
  try {
    const flat: Record<string, string> = {};
    for (const [key, set] of Object.entries(bindings)) flat[key] = serialiseBindingSet(set);
    window.localStorage.setItem(BINDINGS_KEY, JSON.stringify(flat));
  } catch {
    // Quota or private mode — the in-memory set still works for this session.
  }
}

// ─── The store ──────────────────────────────────────────────────────────────

export interface BumsRushState {
  /** False until the client has read localStorage; screens render defaults meanwhile. */
  hydrated: boolean;
  screen: Screen;
  /** Back stack. Bounded, because a player can bounce between two screens forever. */
  stack: Screen[];
  profile: Profile;
  bindings: Record<string, BindingSet>;
  /** The brand of the pad most recently seen pressing a button (§4.1). */
  padBrand: PadBrand;
  padId: string | null;
  /** Set once a pad has produced input, which is the only moment a browser admits it exists. */
  padSeen: boolean;

  hydrate(): void;
  go(screen: Screen): void;
  back(): void;
  goRoot(): void;
  patchSettings(patch: Partial<GameSettings>): void;
  patchAssists(patch: Partial<Assists>): void;
  equip(cosmetics: Partial<Cosmetics>): void;
  setBindingSet(key: string, set: BindingSet): void;
  resetBindingSet(key: string): void;
  notePad(padId: string, brand: PadBrand): void;
  recordResult(result: LevelResult): void;
}

const MAX_STACK = 12;

export const useBumsRushStore = create<BumsRushState>()((set, get) => ({
  hydrated: false,
  screen: { kind: 'title' },
  stack: [],
  profile: createDefaultProfile(0),
  bindings: {},
  padBrand: 'generic',
  padId: null,
  padSeen: false,

  hydrate() {
    if (get().hydrated) return;
    set({
      hydrated: true,
      profile: loadOrCreateLocalProfile(),
      bindings: readStoredBindings(),
    });
  },

  go(screen) {
    const { screen: current, stack } = get();
    if (isRootScreen(screen)) {
      set({ screen, stack: [] });
      return;
    }
    set({ screen, stack: [...stack, current].slice(-MAX_STACK) });
  },

  back() {
    const { stack } = get();
    if (stack.length === 0) {
      set({ screen: { kind: 'title' }, stack: [] });
      return;
    }
    set({ screen: stack[stack.length - 1], stack: stack.slice(0, -1) });
  },

  goRoot() {
    set({ screen: { kind: 'title' }, stack: [] });
  },

  patchSettings(patch) {
    const profile = get().profile;
    const next: Profile = {
      ...profile,
      settings: { ...profile.settings, ...patch },
      updatedAt: Date.now(),
    };
    set({ profile: next });
    saveLocalProfile(next);
  },

  patchAssists(patch) {
    const profile = get().profile;
    const next: Profile = {
      ...profile,
      settings: { ...profile.settings, assists: { ...profile.settings.assists, ...patch } },
      updatedAt: Date.now(),
    };
    set({ profile: next });
    saveLocalProfile(next);
  },

  equip(cosmetics) {
    const profile = get().profile;
    const next: Profile = {
      ...profile,
      cosmetics: { ...profile.cosmetics, ...cosmetics },
      updatedAt: Date.now(),
    };
    set({ profile: next });
    saveLocalProfile(next);
  },

  setBindingSet(key, value) {
    const bindings = { ...get().bindings, [key]: cloneBindingSet(value) };
    set({ bindings });
    writeStoredBindings(bindings);
  },

  resetBindingSet(key) {
    const bindings = { ...get().bindings, [key]: defaultBindingSetFor(kindForBindingKey(key)) };
    set({ bindings });
    writeStoredBindings(bindings);
  },

  notePad(padId, brand) {
    if (get().padId === padId && get().padSeen) return;
    set({ padId, padBrand: brand, padSeen: true });
  },

  recordResult(result) {
    const profile = get().profile;
    const next = applyLevelClear(profile, {
      levelId: result.levelId,
      playerCount: result.playerCount,
      bestMs: result.durationMs,
      // The objective bitmask is over the level's authored order; the session
      // has already reduced its ids to that mask before handing it here.
      objectives: 0,
      assisted: result.assisted,
    });
    set({ profile: next });
    saveLocalProfile(next);
  },
}));

/**
 * The binding set for a device, falling back to the shipped default.
 *
 * A selector rather than stored state: a pad that has never been remapped has
 * no row in the store, and materialising one on first sight would write a file
 * full of defaults that then never migrate when the defaults change.
 */
export function bindingSetFor(
  state: Pick<BumsRushState, 'bindings'>,
  kind: DeviceProfileKind,
  padId?: string | null,
): BindingSet {
  const key = bindingKeyFor(kind, padId);
  return state.bindings[key] ?? defaultBindingSetFor(kind);
}
