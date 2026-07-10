/**
 * Configurable key bindings for Dream Rift.
 *
 * Each in-game action maps to a list of keyboard keys (normalised the same way
 * InputManager records them). Players can rebind everything from Settings; the
 * map is persisted to localStorage.
 */

export type BindAction = 'up' | 'down' | 'left' | 'right' | 'shot' | 'bomb' | 'focus' | 'pause';

export const BIND_ACTIONS: BindAction[] = ['up', 'down', 'left', 'right', 'shot', 'bomb', 'focus', 'pause'];

export const BIND_LABELS: Record<BindAction, string> = {
    up: 'Move Up',
    down: 'Move Down',
    left: 'Move Left',
    right: 'Move Right',
    shot: 'Shoot / Confirm',
    bomb: 'Bomb',
    focus: 'Focus (slow + show hitbox)',
    pause: 'Pause',
};

export type Bindings = Record<BindAction, string[]>;

export const DEFAULT_BINDINGS: Bindings = {
    up: ['ArrowUp', 'w'],
    down: ['ArrowDown', 's'],
    left: ['ArrowLeft', 'a'],
    right: ['ArrowRight', 'd'],
    shot: ['z', 'j', ' '],
    bomb: ['x', 'k'],
    focus: ['Shift'],
    pause: ['Escape', 'p'],
};

const STORAGE_KEY = 'dr.binds';

/** Normalise a KeyboardEvent into our stored key form (single chars lowercased). */
export function normalizeKey(e: KeyboardEvent): string {
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

/** Pretty label for a stored key. */
export function keyLabel(k: string): string {
    switch (k) {
        case ' ':
            return 'Space';
        case 'ArrowUp':
            return '↑';
        case 'ArrowDown':
            return '↓';
        case 'ArrowLeft':
            return '←';
        case 'ArrowRight':
            return '→';
        case 'Escape':
            return 'Esc';
        case 'Control':
            return 'Ctrl';
        default:
            return k.length === 1 ? k.toUpperCase() : k;
    }
}

export function loadBindings(): Bindings {
    if (typeof localStorage === 'undefined') return clone(DEFAULT_BINDINGS);
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return clone(DEFAULT_BINDINGS);
        const parsed = JSON.parse(raw) as Partial<Bindings>;
        const merged = clone(DEFAULT_BINDINGS);
        for (const a of BIND_ACTIONS) {
            if (Array.isArray(parsed[a]) && parsed[a]!.length) merged[a] = parsed[a]!.filter((k) => typeof k === 'string');
        }
        return merged;
    } catch {
        return clone(DEFAULT_BINDINGS);
    }
}

export function saveBindings(b: Bindings): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
    } catch {
        /* ignore quota errors */
    }
}

/** Return a copy of `bindings` with `key` assigned to `action` (removed elsewhere). */
export function rebind(bindings: Bindings, action: BindAction, key: string): Bindings {
    const next = clone(bindings);
    for (const a of BIND_ACTIONS) next[a] = next[a].filter((k) => k !== key);
    next[action] = [key];
    if (next[action].length === 0) next[action] = [key];
    return next;
}

function clone(b: Bindings): Bindings {
    return Object.fromEntries(BIND_ACTIONS.map((a) => [a, [...b[a]]])) as Bindings;
}
