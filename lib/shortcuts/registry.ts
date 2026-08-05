/**
 * Keyboard shortcut registry (plan B4).
 *
 * Shortcuts are currently declared in the file that binds them — the site set
 * in `components/site/KeyboardShortcuts.tsx`, ⌘K in `CommandPalette.tsx`, and
 * whatever each full-screen game does inside its own `keydown` handler. Nothing
 * can therefore answer the two questions that matter: *what shortcuts exist*
 * (the help sheet hand-maintains its own list, which drifts) and *does this new
 * one collide with an existing one* (nobody can tell, so collisions ship).
 *
 * This is the missing index. It is deliberately a **declaration** registry, not
 * a dispatcher: entries carry the binding as data, and an entry may or may not
 * carry a `run`. `KeyboardShortcuts.tsx` keeps its own handler and is not
 * touched by this change — its bindings are mirrored below as `SITE_SHORTCUTS`
 * so the conflict check has the real site set to test new shortcuts against
 * from day one. When that component is eventually rewritten to dispatch from
 * here, the declarations are already correct.
 *
 * Key notation matches how the existing handlers compare: one array entry per
 * keystroke in the sequence (`['g', 'h']` is "g then h"), each entry a
 * lowercased `KeyboardEvent.key`, optionally prefixed with `mod+` (⌘ on macOS,
 * Ctrl elsewhere), `alt+` or `shift+`.
 */

export type ShortcutScope = 'global' | 'feed' | 'app' | `game:${string}`;

export interface Shortcut {
  /** Stable, unique id (`'site.compose'`, `'altair.pause'`). */
  id: string;
  /**
   * The sequence, one keystroke per entry. Single-key shortcuts are a
   * one-element array; `['g', 'h']` is the "go then home" pattern.
   */
  keys: string[];
  /** Where the shortcut is live. `global` is active everywhere, including games. */
  scope: ShortcutScope;
  /** i18n key for the help-sheet row. */
  labelKey: string;
  /**
   * English text for `t(labelKey, { defaultValue: label })`. The repo's i18n
   * contract requires a defaultValue at the call site, and the renderer cannot
   * invent one for a shortcut it did not declare — so it travels with the
   * declaration.
   */
  label?: string;
  /** Namespace holding `labelKey`. Defaults to the site shortcuts' `'feed'`. */
  ns?: string;
  /** Live guard — a shortcut whose `when` returns false is inert and unlisted. */
  when?: () => boolean;
  /** Optional handler. Entries without one are declarations only (see above). */
  run?: (event: KeyboardEvent) => void;
}

/**
 * How long the first key of a sequence stays armed. Same value the site handler
 * already uses — a shorter window makes "g h" unreachable for slow typists, a
 * longer one turns an unrelated later keypress into a navigation.
 */
export const SEQUENCE_TIMEOUT_MS = 1500;

/* ------------------------------------------------------------------ */
/*  Keystroke matching                                                 */
/* ------------------------------------------------------------------ */

interface ParsedKeystroke {
  key: string;
  mod: boolean;
  alt: boolean;
  shift: boolean;
}

/** Parse `'mod+k'` / `'g'` / `'?'` into its parts. Tolerates a literal `'+'`. */
export function parseKeystroke(spec: string): ParsedKeystroke {
  const lower = spec.trim().toLowerCase();
  if (lower === '+') return { key: '+', mod: false, alt: false, shift: false };
  const parts = lower.split('+');
  // A spec ending in `+` (e.g. `mod++`) means the key IS plus.
  const key = parts.pop() || '+';
  return {
    key,
    mod: parts.includes('mod'),
    alt: parts.includes('alt'),
    shift: parts.includes('shift'),
  };
}

/**
 * Does this event satisfy one keystroke spec?
 *
 * Meta/Ctrl and Alt must match exactly — a bare `c` must not fire while the
 * user is holding ⌘ for a browser shortcut, which is why the existing handlers
 * bail on those modifiers first. Shift is different: it is only checked when
 * the spec asks for it, because `KeyboardEvent.key` has *already* applied it
 * (`?` only exists as a shifted keypress, and requiring `!shiftKey` there would
 * make the help overlay unopenable).
 */
export function matchesKeystroke(spec: string, event: KeyboardEvent): boolean {
  const { key, mod, alt, shift } = parseKeystroke(spec);
  if (event.key.toLowerCase() !== key) return false;
  if (mod !== (event.metaKey || event.ctrlKey)) return false;
  if (alt !== event.altKey) return false;
  if (shift && !event.shiftKey) return false;
  return true;
}

/**
 * Should key handling be suppressed for this event target? Mirrors the rule in
 * `KeyboardShortcuts.tsx`: typing `c` into a search box must type a `c`.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/* ------------------------------------------------------------------ */
/*  The site's declared shortcuts                                      */
/* ------------------------------------------------------------------ */

// "g then <x>" navigation, mirroring GO_TARGETS in KeyboardShortcuts.tsx.
const GO: Array<[key: string, id: string, labelKey: string, label: string]> = [
  ['h', 'site.go.home', 'kbd-go-home', 'Home'],
  ['e', 'site.go.explore', 'kbd-go-explore', 'Explore & search'],
  ['n', 'site.go.notifications', 'kbd-go-notifications', 'Notifications'],
  ['m', 'site.go.messages', 'kbd-go-messages', 'Messages'],
  ['b', 'site.go.bookmarks', 'kbd-go-bookmarks', 'Saved'],
  ['l', 'site.go.library', 'kbd-go-library', 'Library'],
  ['c', 'site.go.communities', 'kbd-go-communities', 'Communities'],
  ['w', 'site.go.wallet', 'kbd-go-wallet', 'Wallet'],
  ['p', 'site.go.progress', 'kbd-go-progress', 'Progress'],
  ['d', 'site.go.daily', 'kbd-go-daily', 'Daily puzzles'],
  ['s', 'site.go.settings', 'kbd-go-settings', 'Settings'],
];

/**
 * What the site binds today, as data. These are declarations — the handlers
 * still live in `KeyboardShortcuts.tsx` and `CommandPalette.tsx` — so nothing
 * here fires anything. They are seeded into the registry at module load so
 * `findShortcutConflicts()` compares new shortcuts against the real set rather
 * than against whatever happens to be mounted.
 *
 * Note the `feed` scope on the `g …` sequences and `c`: those are mounted under
 * `_site` only, which is why a game may safely bind a bare `c` of its own.
 */
export const SITE_SHORTCUTS: readonly Shortcut[] = Object.freeze([
  {
    id: 'site.palette',
    keys: ['mod+k'],
    scope: 'global',
    labelKey: 'kbd-palette',
    label: 'Command palette',
    ns: 'feed',
  },
  {
    id: 'site.search',
    keys: ['/'],
    scope: 'feed',
    labelKey: 'kbd-search',
    label: 'Search',
    ns: 'feed',
  },
  {
    id: 'site.compose',
    keys: ['c'],
    scope: 'feed',
    labelKey: 'kbd-compose',
    label: 'New post',
    ns: 'feed',
  },
  {
    id: 'site.help',
    keys: ['?'],
    scope: 'feed',
    labelKey: 'kbd-help',
    label: 'Show this overlay',
    ns: 'feed',
  },
  ...GO.map(([key, id, labelKey, label]): Shortcut => ({
    id,
    keys: ['g', key],
    scope: 'feed',
    labelKey,
    label,
    ns: 'feed',
  })),
]);

/* ------------------------------------------------------------------ */
/*  The registry                                                       */
/* ------------------------------------------------------------------ */

const registry = new Map<string, Shortcut>(
  SITE_SHORTCUTS.map((s): [string, Shortcut] => [s.id, s]),
);
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Register shortcuts and return the matching unregister. Re-registering an id
 * replaces it, so a component that re-mounts with a new handler wins rather
 * than silently keeping the stale closure.
 */
export function registerShortcuts(list: readonly Shortcut[]): () => void {
  for (const shortcut of list) registry.set(shortcut.id, shortcut);
  emit();
  return () => unregisterShortcuts(list.map((s) => s.id));
}

export function unregisterShortcuts(ids: readonly string[]): void {
  let changed = false;
  for (const id of ids) {
    // The seeded site declarations are permanent — an unmounting component must
    // not be able to empty the help sheet.
    if (registry.get(id) && !SITE_SHORTCUTS.some((s) => s.id === id)) {
      registry.delete(id);
      changed = true;
    }
  }
  if (changed) emit();
}

/** Every registered shortcut. The accessor the conflict test reads. */
export function ALL_SHORTCUTS(): readonly Shortcut[] {
  return Object.freeze([...registry.values()]);
}

/**
 * Shortcuts live in `scope`, i.e. the ones the user can actually press there:
 * the scope's own plus everything `global`. `when` guards are honoured, so a
 * signed-out visitor never sees "New post" in the help sheet.
 */
export function shortcutsForScope(scope: ShortcutScope): Shortcut[] {
  return ALL_SHORTCUTS().filter((s) => scopesOverlap(s.scope, scope) && (s.when ? s.when() : true));
}

/** Subscribe to registry changes (for a help sheet that renders from it). */
export function subscribeShortcuts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Can these two scopes be active at the same moment? */
export function scopesOverlap(a: ShortcutScope, b: ShortcutScope): boolean {
  return a === b || a === 'global' || b === 'global';
}

/* ------------------------------------------------------------------ */
/*  Conflict detection                                                 */
/* ------------------------------------------------------------------ */

export interface ShortcutConflict {
  a: Shortcut;
  b: Shortcut;
  /** `'duplicate'` = same sequence; `'prefix'` = one shadows the other's start. */
  kind: 'duplicate' | 'prefix';
}

function normalize(keys: readonly string[]): string[] {
  return keys.map((k) => {
    const { key, mod, alt, shift } = parseKeystroke(k);
    // Sorted modifier order so `shift+mod+k` and `mod+shift+k` compare equal.
    return `${mod ? 'mod+' : ''}${alt ? 'alt+' : ''}${shift ? 'shift+' : ''}${key}`;
  });
}

function isPrefixOf(shorter: readonly string[], longer: readonly string[]): boolean {
  return shorter.length <= longer.length && shorter.every((k, i) => k === longer[i]);
}

/**
 * Find shortcuts that cannot coexist.
 *
 * Two kinds, and the second is the one people miss: a bare `g` shortcut does
 * not merely *tie* with `g` then `h` — it makes the whole sequence unreachable,
 * because the first key resolves before the second is typed. Prefixes are
 * therefore conflicts, not warnings. Scope keeps this honest: a game's `p`
 * (pause) and the feed's `g p` never share a screen, so they are not reported.
 */
export function findShortcutConflicts(
  list: readonly Shortcut[] = ALL_SHORTCUTS(),
): ShortcutConflict[] {
  const conflicts: ShortcutConflict[] = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      if (!scopesOverlap(a.scope, b.scope)) continue;
      const ka = normalize(a.keys);
      const kb = normalize(b.keys);
      if (ka.length === kb.length && isPrefixOf(ka, kb)) {
        conflicts.push({ a, b, kind: 'duplicate' });
      } else if (isPrefixOf(ka, kb) || isPrefixOf(kb, ka)) {
        conflicts.push({ a, b, kind: 'prefix' });
      }
    }
  }
  return conflicts;
}
