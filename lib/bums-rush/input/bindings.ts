/**
 * Bum's Rush — remappable bindings (§4.5).
 *
 * This is the `remappable-input` capability claim (`lib/game-capabilities.ts`)
 * made real: every action a seat can take is data — a list of alternates, any
 * of which can be rebound — rather than a hardcoded key check somewhere in a
 * `keydown` handler. `sources.ts` is the only module that reads a `BindingSet`
 * during play; this file is the shape, the defaults, and the guarantees around
 * editing and persisting one.
 *
 * Two guarantees this file exists to keep:
 *
 * 1. **A broken binding set is a player who cannot move.** `deserialiseBindingSet`
 *    never returns something unusable — corrupt or unrecognised JSON, a stray
 *    `null`, a future schema this build has never heard of, all fall back to a
 *    known-good default, per field where possible so one bad entry doesn't
 *    nuke a player's whole remap. See §Serialisation below.
 * 2. **Never silently steal a binding.** `findConflicts` is a pure query, not a
 *    mutation — the caller (a remap UI) decides whether to warn, cancel, or
 *    swap; `bindAction` only removes a conflicting binding when explicitly
 *    told to.
 */

import type { Assists } from '../types';
import { DEFAULT_ASSISTS } from '../constants';

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Every remappable verb in the game (design doc §4.5's own list, verbatim).
 *
 * `pause` and `objectives` are here, and are genuinely remappable, but they
 * never reach the wire: `InputButton` (types.ts, THE CONTRACT) has bits for
 * `Emote`/`UseItem`/`Drop`/`ToggleTags` only — pause/objectives are room- and
 * HUD-level actions a client handles locally. `sources.ts` surfaces them as a
 * separate `meta` result rather than packing them into `InputFrame.buttons`,
 * because there is no bit to pack them into and inventing one would mean
 * editing the contract this ticket was told not to touch.
 */
export const ACTION_IDS = [
  'aimLeft',
  'aimRight',
  'grabLeft',
  'grabRight',
  'emote',
  'useItem',
  'dropItem',
  'toggleTags',
  'pause',
  'objectives',
] as const;

export type ActionId = (typeof ACTION_IDS)[number];

// ─── Bindings ────────────────────────────────────────────────────────────────

export type BindingSource = 'keyboard' | 'gamepad' | 'touch' | 'mouse';

export interface Binding {
  /** Which physical source. */
  source: BindingSource;
  /** KeyboardEvent.code, a `gamepad.ts` button/stick code, or a touch/mouse id. */
  code: string;
  /**
   * For a binding that contributes to only ONE component of a 2D aim action
   * (a single keyboard key can only push up/down/left/right, never a whole
   * vector) — which axis it drives and which way. Gamepad sticks and touch
   * sticks already deliver a full vector from one binding and leave this unset.
   */
  axis?: { index: 0 | 1; sign: 1 | -1 };
}

export const CURRENT_BINDING_VERSION = 1 as const;

export interface BindingSet {
  version: 1;
  profileName: string;
  /** Multiple entries per action = alternates, all live simultaneously. */
  bindings: Partial<Record<ActionId, Binding[]>>;
  deadzone: number;
  saturation: number;
  /** 0..1, the global rumble intensity slider (§4.1), default 0.6. */
  rumble: number;
  /**
   * This profile's DEFAULT for the analog-trigger assist (gamepad profiles
   * only — meaningless for keyboard/touch/mouse, kept for shape uniformity so
   * `BindingSet` doesn't need a discriminated union per source).
   *
   * `assist.analogTriggers` below is what a tick actually reads; this field is
   * what a fresh player picking this profile starts with. They can diverge
   * once a player customises assists without re-touching bindings.
   */
  triggerAnalog: boolean;
  /** The assist preset seeded when a player switches to this profile (§4.7). */
  assist: Assists;
}

// ─── Deadzone / saturation / rumble ranges ────────────────────────────────────

export const DEADZONE_DEFAULT = 0.22;
export const DEADZONE_MIN = 0.05;
export const DEADZONE_MAX = 0.4;

export const SATURATION_DEFAULT = 0.92;
/**
 * The design doc's deadzone paragraph ends "Both are exposed in Settings
 * (0.05–0.40)" — grammatically readable as covering both deadzone AND
 * saturation, but 0.40 sits below the deadzone default and can't be
 * saturation's ceiling without invalidating the 0.92 default stated one
 * sentence earlier. Read as describing deadzone only (whose own paragraph is
 * unambiguous); saturation gets a range that stays sane and always clears
 * deadzone. Flagged in the implementation report as a contract clarification.
 */
export const SATURATION_MIN = 0.5;
export const SATURATION_MAX = 0.98;

export const RUMBLE_DEFAULT = 0.6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampDeadzone(value: number): number {
  return clamp(value, DEADZONE_MIN, DEADZONE_MAX);
}

/** Saturation must stay clear of deadzone or gamepad.ts's re-normalisation divides by ~zero. */
export function clampSaturation(value: number, deadzone = DEADZONE_DEFAULT): number {
  const floor = Math.max(SATURATION_MIN, clampDeadzone(deadzone) + 0.05);
  return clamp(value, floor, SATURATION_MAX);
}

export function clampRumble(value: number): number {
  return clamp(value, 0, 1);
}

// ─── Default binding sets (§4.1, §4.2, §4.3, §12.2) ───────────────────────────

const kb = (code: string, axis?: Binding['axis']): Binding => ({ source: 'keyboard', code, axis });
const gp = (code: string): Binding => ({ source: 'gamepad', code });
const ms = (code: string): Binding => ({ source: 'mouse', code });
const tc = (code: string): Binding => ({ source: 'touch', code });

export type DeviceProfileKind = 'keyboard-p1' | 'keyboard-p2' | 'gamepad' | 'touch';

/**
 * Player 1's keyboard map (§4.2). Arrow-key aim also carries a mouse
 * alternate on `aimRight`/`grabRight` — the keyboard+mouse hybrid from §4.3 is
 * not a separate profile, it is these two alternates layered onto this one.
 *
 * `toggleTags` has no key in the design doc's P1 table; `T` (unused
 * elsewhere in this profile) is picked as the default — mnemonic: T for Tags —
 * and, like everything else here, fully remappable.
 */
const KEYBOARD_P1_BINDINGS: BindingSet = {
  version: 1,
  profileName: 'Keyboard',
  bindings: {
    aimLeft: [
      kb('KeyD', { index: 0, sign: 1 }),
      kb('KeyA', { index: 0, sign: -1 }),
      kb('KeyS', { index: 1, sign: 1 }),
      kb('KeyW', { index: 1, sign: -1 }),
    ],
    aimRight: [
      kb('ArrowRight', { index: 0, sign: 1 }),
      kb('ArrowLeft', { index: 0, sign: -1 }),
      kb('ArrowDown', { index: 1, sign: 1 }),
      kb('ArrowUp', { index: 1, sign: -1 }),
      ms('move'),
    ],
    grabLeft: [kb('KeyQ'), kb('ShiftLeft')],
    grabRight: [kb('KeyE'), kb('Slash'), ms('button0')],
    emote: [kb('Space')],
    useItem: [kb('KeyF')],
    dropItem: [kb('KeyG')],
    toggleTags: [kb('KeyT')],
    pause: [kb('Escape')],
    objectives: [kb('Tab')],
  },
  deadzone: DEADZONE_DEFAULT,
  saturation: SATURATION_DEFAULT,
  rumble: RUMBLE_DEFAULT,
  triggerAnalog: true,
  // Keyboard assist default: ON (§4.2) — compensation for 8-way aim.
  assist: { ...DEFAULT_ASSISTS, grabAssist: true },
};

/**
 * Player 2's split-keyboard map (§4.2), deliberately minimal: aim (8 keys),
 * grab (2 keys), emote (1 key) — "two people sharing one board." Item/drop/
 * tags/pause/objectives are intentionally left unbound by default so a second
 * player on a shared board can't accidentally pause the host's game or
 * fat-finger a menu action; they remain fully remappable if a player wants
 * them.
 */
const KEYBOARD_P2_BINDINGS: BindingSet = {
  version: 1,
  profileName: 'Keyboard (Player 2)',
  bindings: {
    aimLeft: [
      kb('KeyH', { index: 0, sign: 1 }),
      kb('KeyF', { index: 0, sign: -1 }),
      kb('KeyG', { index: 1, sign: 1 }),
      kb('KeyT', { index: 1, sign: -1 }),
    ],
    aimRight: [
      kb('KeyL', { index: 0, sign: 1 }),
      kb('KeyJ', { index: 0, sign: -1 }),
      kb('KeyK', { index: 1, sign: 1 }),
      kb('KeyI', { index: 1, sign: -1 }),
    ],
    grabLeft: [kb('KeyR')],
    grabRight: [kb('KeyO')],
    emote: [kb('KeyY')],
  },
  deadzone: DEADZONE_DEFAULT,
  saturation: SATURATION_DEFAULT,
  rumble: RUMBLE_DEFAULT,
  triggerAnalog: true,
  assist: { ...DEFAULT_ASSISTS, grabAssist: true },
};

/**
 * Gamepad defaults (§4.1). Button codes are `gamepad.ts`'s scheme over the
 * W3C "standard" mapping: `stick0`/`stick1` are the whole left/right stick,
 * `buttonN` is `pad.buttons[N]`. Triggers AND bumpers both grab — deliberate
 * alternates, not a mistake (§4.1: some pads lack analog triggers, some
 * players can't hold one for minutes).
 */
const GAMEPAD_BINDINGS: BindingSet = {
  version: 1,
  profileName: 'Gamepad',
  bindings: {
    aimLeft: [gp('stick0')],
    aimRight: [gp('stick1')],
    grabLeft: [gp('button6'), gp('button4')], // LT/L2/ZL, LB/L1/L
    grabRight: [gp('button7'), gp('button5')], // RT/R2/ZR, RB/R1/R
    emote: [gp('button0')], // face down: A / ✕ / B
    useItem: [gp('button1')], // face right: B / ○ / A
    dropItem: [gp('button2')], // face left: X / □ / Y
    toggleTags: [gp('button3')], // face up: Y / △ / X
    pause: [gp('button9')], // Start / Options / +
    objectives: [gp('button8')], // Select / Share / −
  },
  deadzone: DEADZONE_DEFAULT,
  saturation: SATURATION_DEFAULT,
  rumble: RUMBLE_DEFAULT,
  triggerAnalog: true,
  assist: { ...DEFAULT_ASSISTS },
};

/**
 * Touch defaults (§12.2). `half-left`/`half-right` drive the Auto-Grab
 * relative stick per arm; `grab-*-button` are only live under the two-stick
 * scheme (Auto-Grab grips automatically — see `touch.ts`). The `btn-*` codes
 * are stable ids a future on-screen HUD binds `onPointerDown` to; this module
 * only owns that the id exists and is remappable in principle, not the pixel
 * layout of the button.
 */
const TOUCH_BINDINGS: BindingSet = {
  version: 1,
  profileName: 'Touch',
  bindings: {
    aimLeft: [tc('half-left')],
    aimRight: [tc('half-right')],
    grabLeft: [tc('grab-left-button')],
    grabRight: [tc('grab-right-button')],
    emote: [tc('btn-emote')],
    useItem: [tc('btn-use')],
    dropItem: [tc('btn-drop')],
    toggleTags: [tc('btn-tags')],
    pause: [tc('btn-pause')],
    objectives: [tc('btn-objectives')],
  },
  deadzone: DEADZONE_DEFAULT,
  saturation: SATURATION_DEFAULT,
  rumble: RUMBLE_DEFAULT,
  triggerAnalog: true,
  // Auto-grab: on (touch); grab assist: on (touch) — §4.7.
  assist: { ...DEFAULT_ASSISTS, grabAssist: true, autoGrab: true },
};

const DEFAULTS_BY_KIND: Record<DeviceProfileKind, BindingSet> = {
  'keyboard-p1': KEYBOARD_P1_BINDINGS,
  'keyboard-p2': KEYBOARD_P2_BINDINGS,
  gamepad: GAMEPAD_BINDINGS,
  touch: TOUCH_BINDINGS,
};

/** A fresh, independently-mutable copy — the module-level tables above are the source of truth and are never handed out directly. */
export function defaultBindingSetFor(kind: DeviceProfileKind): BindingSet {
  return cloneBindingSet(DEFAULTS_BY_KIND[kind]);
}

export function cloneBindingSet(set: BindingSet): BindingSet {
  return structuredClone(set);
}

// ─── Serialisation, with migration (§4.5) ─────────────────────────────────────

/**
 * Bump this and add a `MIGRATIONS[oldVersion]` step whenever `BindingSet`'s
 * shape changes. Nothing has shipped `BindingSet` before version 1, so the
 * ladder below is empty today — it exists so the FIRST real migration is a
 * one-line addition, not a redesign of this function.
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export function serialiseBindingSet(set: BindingSet): string {
  return JSON.stringify(set);
}

/**
 * Parse + migrate + validate in one call. Never throws, never returns
 * something a player could get stuck with: any field that doesn't parse
 * cleanly falls back to the matching field on `fallback` (typically
 * `defaultBindingSetFor(kind)`) rather than discarding the whole profile —
 * one corrupted alternate shouldn't cost a player their entire remap.
 */
export function deserialiseBindingSet(raw: string, fallback: BindingSet): BindingSet {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return cloneBindingSet(fallback);
  }
  return migrateBindingSet(parsed, fallback);
}

export function migrateBindingSet(parsed: unknown, fallback: BindingSet): BindingSet {
  if (!isPlainObject(parsed)) return cloneBindingSet(fallback);

  let working: Record<string, unknown> = parsed;
  let version = typeof working.version === 'number' ? working.version : 0;

  while (version < CURRENT_BINDING_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return cloneBindingSet(fallback); // unknown shape — don't guess, use a known-good set
    working = step(working);
    version += 1;
  }

  return validateBindingSet(working, fallback);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const BINDING_SOURCES: readonly BindingSource[] = ['keyboard', 'gamepad', 'touch', 'mouse'];

function isValidBinding(value: unknown): value is Binding {
  if (!isPlainObject(value)) return false;
  if (typeof value.code !== 'string' || value.code.length === 0) return false;
  if (!BINDING_SOURCES.includes(value.source as BindingSource)) return false;
  if (value.axis !== undefined) {
    if (!isPlainObject(value.axis)) return false;
    if (value.axis.index !== 0 && value.axis.index !== 1) return false;
    if (value.axis.sign !== 1 && value.axis.sign !== -1) return false;
  }
  return true;
}

function validateBindingsField(
  raw: unknown,
  fallback: BindingSet['bindings'],
): BindingSet['bindings'] {
  const out: BindingSet['bindings'] = {};
  const rawBindings = isPlainObject(raw) ? raw : {};
  for (const action of ACTION_IDS) {
    const candidate = rawBindings[action];
    if (Array.isArray(candidate) && candidate.every(isValidBinding)) {
      out[action] = candidate;
    } else if (fallback[action]) {
      out[action] = fallback[action];
    }
  }
  return out;
}

function validateAssistsField(raw: unknown, fallback: Assists): Assists {
  const rawAssists = isPlainObject(raw) ? raw : {};
  const bool = (key: keyof Assists): boolean =>
    typeof rawAssists[key] === 'boolean' ? (rawAssists[key] as boolean) : (fallback[key] as boolean);
  const aimSmoothing =
    typeof rawAssists.aimSmoothing === 'number' && Number.isFinite(rawAssists.aimSmoothing)
      ? clamp(rawAssists.aimSmoothing, 0, 1)
      : fallback.aimSmoothing;
  return {
    grabAssist: bool('grabAssist'),
    stickyGrip: bool('stickyGrip'),
    analogTriggers: bool('analogTriggers'),
    autoGrab: bool('autoGrab'),
    slowMo: bool('slowMo'),
    extraCheckpoints: bool('extraCheckpoints'),
    noFallDamage: bool('noFallDamage'),
    aimSmoothing,
    oneHanded: bool('oneHanded'),
  };
}

function validateBindingSet(raw: Record<string, unknown>, fallback: BindingSet): BindingSet {
  const deadzone =
    typeof raw.deadzone === 'number' && Number.isFinite(raw.deadzone)
      ? clampDeadzone(raw.deadzone)
      : fallback.deadzone;
  const saturation =
    typeof raw.saturation === 'number' && Number.isFinite(raw.saturation)
      ? clampSaturation(raw.saturation, deadzone)
      : fallback.saturation;
  return {
    version: 1,
    profileName: typeof raw.profileName === 'string' && raw.profileName.length > 0 ? raw.profileName : fallback.profileName,
    bindings: validateBindingsField(raw.bindings, fallback.bindings),
    deadzone,
    saturation,
    rumble: typeof raw.rumble === 'number' && Number.isFinite(raw.rumble) ? clampRumble(raw.rumble) : fallback.rumble,
    triggerAnalog: typeof raw.triggerAnalog === 'boolean' ? raw.triggerAnalog : fallback.triggerAnalog,
    assist: validateAssistsField(raw.assist, fallback.assist),
  };
}

// ─── Conflict detection (§4.5 "never silently steal") ─────────────────────────

export interface BindingConflict {
  action: ActionId;
  slot: number;
  binding: Binding;
}

/**
 * Same physical input already driving a different action. Ignores `axis.sign`
 * — `KeyW` bound as both "aim up" and, separately, some other action's whole
 * binding would still both fire on one keypress, so the source+code pair is
 * the identity that matters, not which axis component it feeds.
 */
function samePhysicalInput(a: Binding, b: Binding): boolean {
  return a.source === b.source && a.code === b.code;
}

/**
 * Pure query: does `candidate` collide with anything already bound to a
 * DIFFERENT action? Returns every collision found — a caller shows them all
 * rather than only the first. Does not mutate `bindings`.
 */
export function findConflicts(
  bindings: BindingSet['bindings'],
  action: ActionId,
  candidate: Binding,
): BindingConflict[] {
  const conflicts: BindingConflict[] = [];
  for (const other of ACTION_IDS) {
    if (other === action) continue;
    const list = bindings[other] ?? [];
    list.forEach((existing, slot) => {
      if (samePhysicalInput(existing, candidate)) {
        conflicts.push({ action: other, slot, binding: existing });
      }
    });
  }
  return conflicts;
}

export interface BindActionResult {
  set: BindingSet;
  conflicts: BindingConflict[];
  applied: boolean;
}

/**
 * Assign `candidate` to `action` at `slotIndex` (append if out of range).
 * Never mutates `set`. If `candidate` conflicts with another action and
 * `swapConflicts` is not set, the binding is NOT applied — `conflicts` is
 * returned so the caller can show the inline warning from §4.5 and ask the
 * player to confirm. Pass `swapConflicts: true` (after that confirmation) to
 * remove the conflicting entries from their old actions and apply the new
 * binding in the same call.
 */
export function bindAction(
  set: BindingSet,
  action: ActionId,
  slotIndex: number,
  candidate: Binding,
  opts?: { swapConflicts?: boolean },
): BindActionResult {
  const conflicts = findConflicts(set.bindings, action, candidate);
  if (conflicts.length > 0 && !opts?.swapConflicts) {
    return { set, conflicts, applied: false };
  }

  const next = cloneBindingSet(set);
  if (conflicts.length > 0) {
    for (const conflict of conflicts) {
      const list = next.bindings[conflict.action];
      if (!list) continue;
      next.bindings[conflict.action] = list.filter((_, i) => i !== conflict.slot);
    }
  }

  const list = next.bindings[action] ? [...(next.bindings[action] as Binding[])] : [];
  if (slotIndex >= 0 && slotIndex < list.length) {
    list[slotIndex] = candidate;
  } else {
    list.push(candidate);
  }
  next.bindings[action] = list;

  return { set: next, conflicts, applied: true };
}

/** Remove one alternate. A player can always end up with zero bindings for an action — that's their choice, not an error. */
export function unbindAction(set: BindingSet, action: ActionId, slotIndex: number): BindingSet {
  const next = cloneBindingSet(set);
  const list = next.bindings[action];
  if (!list) return next;
  next.bindings[action] = list.filter((_, i) => i !== slotIndex);
  return next;
}

/** "Reset to defaults" for one profile (§4.5). */
export function resetBindingsToDefault(kind: DeviceProfileKind): BindingSet {
  return defaultBindingSetFor(kind);
}
