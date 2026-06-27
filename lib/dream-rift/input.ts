/**
 * Input manager for Dream Rift — merges keyboard and on-screen (touch) input
 * into a single per-frame InputFrame plus pause/advance edges.
 *
 * Keyboard controls are fully rebindable: actions map to keys via a `Bindings`
 * table (see keybinds.ts) that players can change in Settings. Touch input from
 * the on-screen controls is merged in on top.
 */

import type { InputFrame } from './types';
import { DEFAULT_BINDINGS, normalizeKey, type BindAction, type Bindings } from './keybinds';

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
    private bindings: Bindings = DEFAULT_BINDINGS;
    private boundKeys = new Set<string>(flattenBindings(DEFAULT_BINDINGS));

    /** Suspend gameplay key capture (e.g. while rebinding in a menu). */
    captureSuspended = false;

    setBindings(b: Bindings): void {
        this.bindings = b;
        this.boundKeys = new Set(flattenBindings(b));
    }

    private onKeyDown = (e: KeyboardEvent): void => {
        if (this.captureSuspended) return;
        const k = normalizeKey(e);
        this.keys.add(k);
        if (this.boundKeys.has(k) || k === ' ' || k.startsWith('Arrow')) e.preventDefault();
    };
    private onKeyUp = (e: KeyboardEvent): void => {
        this.keys.delete(normalizeKey(e));
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

    private action(a: BindAction): boolean {
        const list = this.bindings[a];
        for (let i = 0; i < list.length; i++) if (this.keys.has(list[i])) return true;
        return false;
    }

    poll(): PollResult {
        const v = this.virtual;
        const dead = 0.28;
        const frame: InputFrame = {
            up: this.action('up') || v.my < -dead,
            down: this.action('down') || v.my > dead,
            left: this.action('left') || v.mx < -dead,
            right: this.action('right') || v.mx > dead,
            shot: this.action('shot') || v.shot,
            bomb: this.action('bomb') || v.bomb,
            focus: this.action('focus') || v.focus,
        };
        const pauseNow = this.action('pause') || v.pause;
        const pausePressed = pauseNow && !this.prevPause;
        this.prevPause = pauseNow;
        const advancePressed = this.action('shot') || this.keys.has('Enter') || v.shot;
        return { frame, pausePressed, advancePressed };
    }
}

function flattenBindings(b: Bindings): string[] {
    return Object.values(b).flat();
}
