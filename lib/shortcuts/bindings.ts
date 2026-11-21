/**
 * Effective keyboard bindings (WCAG 2.1.4, Character Key Shortcuts).
 *
 * The registry (`registry.ts`) declares the site's DEFAULT shortcuts. A person
 * can change two things about them: the mode for character-key shortcuts, and
 * any single shortcut's keys. This module is the pure arithmetic between the
 * two: `defaults + overrides + mode = what is actually bound`. The dispatcher
 * (`KeyboardShortcuts.tsx`), the help sheet and the settings page all read the
 * same result, so a remap is applied in exactly one place.
 *
 * A "character-key shortcut" is a binding whose keystrokes carry no `mod+` or
 * `alt+` — single keys (`c`, `?`, `/`) and plain sequences (`g h`). The mode
 * treats them as a group:
 *
 *   on   today's behaviour
 *   off  they are removed
 *   alt  `alt+` is added to the FIRST keystroke (`alt+c`, `alt+g h`)
 *
 * Bindings that already use a modifier are never touched by the mode.
 */

import { findShortcutConflicts, parseKeystroke, type Shortcut } from './registry';

export type SingleKeyMode = 'on' | 'off' | 'alt';

export interface KeyboardPrefs {
  singleKeys: SingleKeyMode;
  /** Shortcut id → replacement keystroke sequence (one or two steps). */
  overrides: Record<string, string[]>;
}

export const DEFAULT_KEYBOARD_PREFS: KeyboardPrefs = Object.freeze({
  singleKeys: 'on' as SingleKeyMode,
  overrides: Object.freeze({}) as Record<string, string[]>,
});

export const SINGLE_KEY_MODES: readonly SingleKeyMode[] = ['on', 'off', 'alt'];

/** The most overrides one account may store (the site has far fewer shortcuts). */
export const MAX_OVERRIDES = 64;
/** The longest sequence a shortcut may be remapped to ("g then h"). */
export const MAX_SEQUENCE_STEPS = 2;

/** Shortcuts whose handler takes one keystroke only (the palette toggles on it). */
export const SINGLE_STEP_IDS: ReadonlySet<string> = new Set(['site.palette']);

/**
 * Keystrokes the browser or the OS owns. A page that swallows them breaks
 * closing, opening and reloading tabs, or leaves a person unable to tab away or
 * dismiss a dialog. Refused as any step of a remap.
 */
export const RESERVED: readonly string[] = Object.freeze([
  'mod+w',
  'mod+t',
  'mod+n',
  'mod+l',
  'mod+r',
  'mod+q',
  'tab',
  'escape',
]);

/**
 * One keystroke: optional `mod+`, `alt+`, `shift+` in that order, then either
 * one printable character (a literal `+` allowed) or a lowercase key name such
 * as `enter` or `arrowup`.
 */
const KEYSTROKE = /^(?:mod\+)?(?:alt\+)?(?:shift\+)?(?:[^\s]|[a-z][a-z0-9]{1,15})$/;

const MODIFIER_NAMES = ['mod', 'alt', 'shift', 'control', 'ctrl', 'meta'];

export function isValidKeystroke(spec: unknown): spec is string {
  return (
    typeof spec === 'string' &&
    spec.length <= 24 &&
    KEYSTROKE.test(spec) &&
    !MODIFIER_NAMES.includes(parseKeystroke(spec).key)
  );
}

export function isValidSequence(keys: unknown): keys is string[] {
  return (
    Array.isArray(keys) &&
    keys.length >= 1 &&
    keys.length <= MAX_SEQUENCE_STEPS &&
    keys.every(isValidKeystroke)
  );
}

/** Canonical form of a keystroke, so `shift+mod+k` style variants compare equal. */
function canonical(spec: string): string {
  const { key, mod, alt, shift } = parseKeystroke(spec);
  return `${mod ? 'mod+' : ''}${alt ? 'alt+' : ''}${shift ? 'shift+' : ''}${key}`;
}

export function isReserved(spec: string): boolean {
  return RESERVED.includes(canonical(spec));
}

/** True when no step carries `mod+` or `alt+`: the keys WCAG 2.1.4 is about. */
export function isCharacterKeyBinding(keys: readonly string[]): boolean {
  return keys.every((k) => {
    const { mod, alt } = parseKeystroke(k);
    return !mod && !alt;
  });
}

/** Defaults with the per-shortcut overrides applied (before the mode). */
export function applyOverrides(
  shortcuts: readonly Shortcut[],
  overrides: Readonly<Record<string, string[]>>,
): Shortcut[] {
  return shortcuts.map((s) => {
    const own = overrides[s.id];
    return own && isValidSequence(own)
      ? {
          ...s,
          keys: own,
        }
      : s;
  });
}

function withMode(shortcut: Shortcut, mode: SingleKeyMode): Shortcut | null {
  if (mode === 'on' || !isCharacterKeyBinding(shortcut.keys)) return shortcut;
  if (mode === 'off') return null;
  const [first, ...rest] = shortcut.keys;
  return {
    ...shortcut,
    keys: [`alt+${canonical(first)}`, ...rest],
  };
}

/**
 * What is bound right now: overrides first, then the mode. Computed once per
 * change of `shortcuts` or `prefs`, never per keystroke.
 */
export function effectiveBindings(
  shortcuts: readonly Shortcut[],
  prefs: KeyboardPrefs,
): Shortcut[] {
  const out: Shortcut[] = [];
  for (const s of applyOverrides(shortcuts, prefs.overrides)) {
    const bound = withMode(s, prefs.singleKeys);
    if (bound) out.push(bound);
  }
  return out;
}

export type OverrideError =
  | {
      reason: 'unknown';
    }
  | {
      reason: 'grammar';
    }
  | {
      reason: 'reserved';
      keystroke: string;
    }
  | {
      reason: 'conflict';
      with: Shortcut;
    };

export type OverrideResult =
  | {
      ok: true;
    }
  | ({
      ok: false;
    } & OverrideError);

/**
 * Can `id` be rebound to `keys`? `shortcuts` is the set to test against with
 * overrides already applied (`applyOverrides`), so a clash is judged against
 * what the other shortcuts are bound to now, not what they were by default. A
 * clash is a duplicate or a prefix (a bare `g` would shadow every `g …`), and
 * is reported with the shortcut it clashes with so the UI can name it.
 */
export function validateOverride(
  id: string,
  keys: unknown,
  shortcuts: readonly Shortcut[],
): OverrideResult {
  const target = shortcuts.find((s) => s.id === id);
  if (!target)
    return {
      ok: false,
      reason: 'unknown',
    };
  if (!isValidSequence(keys) || (SINGLE_STEP_IDS.has(id) && keys.length > 1)) {
    return { ok: false, reason: 'grammar' };
  }
  const blocked = keys.find(isReserved);
  if (blocked !== undefined)
    return {
      ok: false,
      reason: 'reserved',
      keystroke: blocked,
    };
  const candidate: Shortcut = {
    ...target,
    keys,
  };
  const trial = shortcuts.map((s) => (s.id === id ? candidate : s));
  const clash = findShortcutConflicts(trial).find((c) => c.a.id === id || c.b.id === id);
  if (clash)
    return {
      ok: false,
      reason: 'conflict',
      with: clash.a.id === id ? clash.b : clash.a,
    };
  return {
    ok: true,
  };
}

/**
 * Validate a whole override map (what the server receives). Every id must be a
 * known shortcut and each override must pass `validateOverride` against the
 * others as they will be after the save. Returns the first failing id.
 */
export function validateOverrides(
  overrides: Readonly<Record<string, unknown>>,
  shortcuts: readonly Shortcut[],
):
  | {
      ok: true;
    }
  | {
      ok: false;
      id: string;
      error: OverrideError;
    } {
  const ids = Object.keys(overrides);
  if (ids.length > MAX_OVERRIDES)
    return {
      ok: false,
      id: ids[0] ?? '',
      error: {
        reason: 'grammar',
      },
    };
  const valid: Record<string, string[]> = {};
  for (const id of ids) {
    const keys = overrides[id];
    if (!shortcuts.some((s) => s.id === id))
      return {
        ok: false,
        id,
        error: {
          reason: 'unknown',
        },
      };
    if (!isValidSequence(keys))
      return {
        ok: false,
        id,
        error: {
          reason: 'grammar',
        },
      };
    valid[id] = keys;
  }
  const applied = applyOverrides(shortcuts, valid);
  for (const id of ids) {
    const r = validateOverride(id, valid[id], applied);
    if (!r.ok) {
      const { ok: _ok, ...error } = r;
      return {
        ok: false,
        id,
        error,
      };
    }
  }
  return {
    ok: true,
  };
}

/**
 * Turn stored or parsed data of unknown shape into usable prefs: a bad mode
 * becomes `on`, an override with a malformed sequence or an id outside
 * `knownIds` is dropped. Never throws.
 */
export function sanitizePrefs(raw: unknown, knownIds?: ReadonlySet<string>): KeyboardPrefs {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_KEYBOARD_PREFS;
  const { singleKeys, overrides } = raw as {
    singleKeys?: unknown;
    overrides?: unknown;
  };
  const mode = SINGLE_KEY_MODES.find((m) => m === singleKeys) ?? 'on';
  const kept: Record<string, string[]> = {};
  if (typeof overrides === 'object' && overrides !== null && !Array.isArray(overrides)) {
    for (const [id, keys] of Object.entries(overrides)) {
      if (knownIds && !knownIds.has(id)) continue;
      if (isValidSequence(keys) && !keys.some(isReserved)) kept[id] = keys;
      if (Object.keys(kept).length >= MAX_OVERRIDES) break;
    }
  }
  return {
    singleKeys: mode,
    overrides: kept,
  };
}

/* ------------------------------------------------------------------ */
/*  Matching and labels                                                */
/* ------------------------------------------------------------------ */

/**
 * `matchesKeystroke` compares `event.key`, which macOS rewrites while Option is
 * held (Option+N reports a dead key, not `n`). For an `alt+` binding on a
 * letter or digit the physical key is the stable answer, so fall back to it.
 */
export function eventMatchesKeystroke(spec: string, event: KeyboardEvent): boolean {
  const { key, mod, alt, shift } = parseKeystroke(spec);
  if (mod !== (event.metaKey || event.ctrlKey)) return false;
  if (alt !== event.altKey) return false;
  if (shift && !event.shiftKey) return false;
  if (event.key.toLowerCase() === key) return true;
  if (!alt || !event.code) return false;
  if (/^[a-z]$/.test(key)) return event.code === `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return event.code === `Digit${key}`;
  return false;
}

/** Is this keydown only a modifier being pressed (it must not break a sequence)? */
export function isModifierKey(event: KeyboardEvent): boolean {
  return ['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(event.key);
}

/**
 * The spec for a keydown, as the capture field records it, or `null` for a bare
 * modifier press. Shift is kept only for letters and digits (for a symbol such
 * as `?` it is already part of the key).
 */
export function keystrokeFromEvent(event: KeyboardEvent): string | null {
  if (isModifierKey(event)) return null;
  let key = event.key.toLowerCase();
  if (event.altKey) {
    const fromCode = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(event.code ?? '');
    if (fromCode) key = (fromCode[1] ?? fromCode[2]).toLowerCase();
  }
  if (key === ' ') key = 'space';
  const shiftMatters = event.shiftKey && /^[a-z0-9]$/.test(key);
  return `${event.metaKey || event.ctrlKey ? 'mod+' : ''}${event.altKey ? 'alt+' : ''}${
    shiftMatters ? 'shift+' : ''
  }${key}`;
}

export type KeyPlatform = 'mac' | 'other';

const NAMED_KEYS: Record<string, string> = {
  escape: 'Esc',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  space: 'Space',
  enter: 'Enter',
  backspace: 'Backspace',
  delete: 'Del',
  pageup: 'Page up',
  pagedown: 'Page down',
};

/**
 * The caps to draw for one keystroke, modifiers first (`mod+k` → `⌘`, `K` on
 * macOS and `Ctrl`, `K` elsewhere). Key names are not translated: they are
 * what is printed on the keyboard.
 */
export function keyLabel(spec: string, platform: KeyPlatform): string[] {
  const { key, mod, alt, shift } = parseKeystroke(spec);
  const mac = platform === 'mac';
  const parts: string[] = [];
  if (mod) parts.push(mac ? '⌘' : 'Ctrl');
  if (alt) parts.push(mac ? '⌥' : 'Alt');
  if (shift) parts.push(mac ? '⇧' : 'Shift');
  parts.push(
    NAMED_KEYS[key] ?? (key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1)),
  );
  return parts;
}

/** A spoken-friendly string for a whole sequence: `G then H`, `Ctrl+K`. */
export function sequenceText(
  keys: readonly string[],
  platform: KeyPlatform,
  thenWord = 'then',
): string {
  return keys.map((k) => keyLabel(k, platform).join('+')).join(` ${thenWord} `);
}
