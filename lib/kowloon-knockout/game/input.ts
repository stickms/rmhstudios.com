// ============================================================
// Input Handler — Keyboard mapping for boxing controls
// ============================================================

import { InputState } from './fighters/types';

export function createInputState(): InputState {
    return {
        left: false,
        right: false,
        block: false,
        jab: false,
        cross: false,
        hook: false,
        uppercut: false,
        jabPressed: false,
        crossPressed: false,
        hookPressed: false,
        uppercutPressed: false,
    };
}

const KEY_MAP: Record<string, keyof InputState> = {
    'a': 'left',
    'arrowleft': 'left',
    'd': 'right',
    'arrowright': 'right',
    's': 'block',
    'arrowdown': 'block',
    'j': 'jab',
    'k': 'cross',
    'l': 'hook',
    'u': 'uppercut',
};

/**
 * Attach keyboard listeners. Returns cleanup function.
 */
export function attachInputListeners(state: InputState): () => void {
    const onKeyDown = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        const mapped = KEY_MAP[key];
        if (mapped) {
            e.preventDefault();
            // For punches, track "just pressed" this frame
            if (mapped === 'jab' && !state.jab) state.jabPressed = true;
            if (mapped === 'cross' && !state.cross) state.crossPressed = true;
            if (mapped === 'hook' && !state.hook) state.hookPressed = true;
            if (mapped === 'uppercut' && !state.uppercut) state.uppercutPressed = true;

            (state as unknown as Record<string, boolean>)[mapped] = true;
        }
    };

    const onKeyUp = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        const mapped = KEY_MAP[key];
        if (mapped) {
            e.preventDefault();
            (state as unknown as Record<string, boolean>)[mapped] = false;
        }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
    };
}

/**
 * Clear "just pressed" flags — call at end of each frame
 */
export function clearPressedFlags(state: InputState): void {
    state.jabPressed = false;
    state.crossPressed = false;
    state.hookPressed = false;
    state.uppercutPressed = false;
}
