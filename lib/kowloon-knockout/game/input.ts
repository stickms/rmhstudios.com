// ============================================================
// Local Input — keyboard + virtual (mobile) → InputCommand
//
// Movement is analog on the ground plane (WASD / arrows or an
// on-screen joystick). Punches are edge-triggered (J/K/L/U or the
// on-screen buttons). Block is held (Space / Shift or the block pad).
// ============================================================

import type { InputCommand, PunchType } from './fighters/types';

const MOVE_KEYS: Record<string, [number, number]> = {
    w: [0, -1], arrowup: [0, -1],
    s: [0, 1], arrowdown: [0, 1],
    a: [-1, 0], arrowleft: [-1, 0],
    d: [1, 0], arrowright: [1, 0],
};

const PUNCH_KEYS: Record<string, PunchType> = {
    j: 'jab',
    k: 'cross',
    l: 'hook',
    u: 'uppercut',
};

const BLOCK_KEYS = new Set([' ', 'shift', 'control']);

export class LocalInputSource {
    private held = new Set<string>();
    private queuedPunch: PunchType | null = null;

    // Virtual (mobile) state, written by the on-screen controls.
    private vMoveX = 0;
    private vMoveZ = 0;
    private vBlock = false;
    private detachFn: (() => void) | null = null;

    attach(): void {
        const onKeyDown = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            if (key in MOVE_KEYS || key in PUNCH_KEYS || BLOCK_KEYS.has(key)) {
                e.preventDefault();
            }
            if (key in PUNCH_KEYS && !this.held.has(key)) {
                this.queuedPunch = PUNCH_KEYS[key];
            }
            this.held.add(key);
        };
        const onKeyUp = (e: KeyboardEvent) => {
            this.held.delete(e.key.toLowerCase());
        };
        const onBlur = () => this.held.clear();

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);
        this.detachFn = () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
        };
    }

    detach(): void {
        this.detachFn?.();
        this.detachFn = null;
        this.held.clear();
    }

    // ── Virtual control surface (mobile) ──
    setVirtualMove(x: number, z: number): void { this.vMoveX = x; this.vMoveZ = z; }
    setVirtualBlock(b: boolean): void { this.vBlock = b; }
    pressVirtualPunch(type: PunchType): void { this.queuedPunch = type; }

    /** Build this frame's command and consume the edge-triggered punch. */
    consume(): InputCommand {
        let mx = this.vMoveX;
        let mz = this.vMoveZ;
        for (const key of this.held) {
            const m = MOVE_KEYS[key];
            if (m) { mx += m[0]; mz += m[1]; }
        }
        const mag = Math.hypot(mx, mz);
        if (mag > 1) { mx /= mag; mz /= mag; }

        let block = this.vBlock;
        for (const key of this.held) {
            if (BLOCK_KEYS.has(key)) { block = true; break; }
        }

        const punch = this.queuedPunch;
        this.queuedPunch = null;
        return { moveX: mx, moveZ: mz, block, punch };
    }
}
