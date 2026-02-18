/**
 * Keybind store — persists to localStorage.
 * Stores key codes for movement and the 3 ability slots.
 */

export interface Keybinds {
    up: string;
    down: string;
    left: string;
    right: string;
    ability0: string; // Q
    ability1: string; // E
    ability2: string; // R
}

export const DEFAULT_KEYBINDS: Keybinds = {
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    ability0: 'KeyQ',
    ability1: 'KeyE',
    ability2: 'KeyR',
};

const STORAGE_KEY = 'echoes_keybinds';

export function loadKeybinds(): Keybinds {
    if (typeof window === 'undefined') return { ...DEFAULT_KEYBINDS };
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_KEYBINDS };
        return { ...DEFAULT_KEYBINDS, ...JSON.parse(raw) };
    } catch {
        return { ...DEFAULT_KEYBINDS };
    }
}

export function saveKeybinds(binds: Keybinds): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(binds));
}

/** Human-readable label for a key code */
export function keyLabel(code: string): string {
    const map: Record<string, string> = {
        KeyQ: 'Q', KeyW: 'W', KeyE: 'E', KeyR: 'R', KeyT: 'T',
        KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyF: 'F', KeyG: 'G',
        KeyZ: 'Z', KeyX: 'X', KeyC: 'C', KeyV: 'V', KeyB: 'B',
        Space: 'Space', ShiftLeft: 'Shift', ControlLeft: 'Ctrl',
        ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
        Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
    };
    return map[code] ?? code.replace('Key', '');
}
