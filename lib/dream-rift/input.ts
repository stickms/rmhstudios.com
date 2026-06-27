/**
 * Input manager for Dream Rift — merges keyboard and on-screen (touch) input
 * into a single per-frame InputFrame plus pause/advance edges.
 *
 * Controls: arrows/WASD move, Z (or J / on-screen A) shoot, X (or K / on-screen
 * B) bomb, Shift (or on-screen focus) for focus mode, Esc/P pause, Z/Enter to
 * advance dialogue.
 */

import type { InputFrame } from './types';

export interface PollResult {
    frame: InputFrame;
    pausePressed: boolean;
    advancePressed: boolean;
}

interface Virtual {
    mx: number; // -1..1
    my: number;
    shot: boolean;
    bomb: boolean;
    focus: boolean;
    pause: boolean;
}

export class InputManager {
    private keys = new Set<string>();
    private virtual: Virtual = { mx: 0, my: 0, shot: false, bomb: false, focus: false, pause: false };
    private prevPause = false;
    private bound = false;

    private onKeyDown = (e: KeyboardEvent): void => {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        this.keys.add(k);
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'z', 'x'].includes(k)) e.preventDefault();
    };
    private onKeyUp = (e: KeyboardEvent): void => {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        this.keys.delete(k);
    };
    private onBlur = (): void => this.keys.clear();

    bind(): void {
        if (this.bound || typeof window === 'undefined') return;
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onBlur);
        this.bound = true;
    }

    unbind(): void {
        if (!this.bound || typeof window === 'undefined') return;
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('blur', this.onBlur);
        this.bound = false;
    }

    /** Set the on-screen joystick vector (normalised -1..1). */
    setStick(mx: number, my: number): void {
        this.virtual.mx = mx;
        this.virtual.my = my;
    }
    setButton(btn: 'shot' | 'bomb' | 'focus' | 'pause', down: boolean): void {
        this.virtual[btn] = down;
    }
    clearVirtual(): void {
        this.virtual = { mx: 0, my: 0, shot: false, bomb: false, focus: false, pause: false };
    }

    private has(...k: string[]): boolean {
        return k.some((key) => this.keys.has(key));
    }

    poll(): PollResult {
        const v = this.virtual;
        const dead = 0.28;
        const frame: InputFrame = {
            up: this.has('ArrowUp', 'w') || v.my < -dead,
            down: this.has('ArrowDown', 's') || v.my > dead,
            left: this.has('ArrowLeft', 'a') || v.mx < -dead,
            right: this.has('ArrowRight', 'd') || v.mx > dead,
            shot: this.has('z', 'j', ' ') || v.shot,
            bomb: this.has('x', 'k') || v.bomb,
            focus: this.has('Shift', 'shift') || v.focus,
        };
        const pauseNow = this.has('Escape', 'p') || v.pause;
        const pausePressed = pauseNow && !this.prevPause;
        this.prevPause = pauseNow;
        const advancePressed = this.has('z', 'Enter', ' ', 'j') || v.shot;
        return { frame, pausePressed, advancePressed };
    }
}
