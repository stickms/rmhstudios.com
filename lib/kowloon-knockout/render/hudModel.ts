// ============================================================
// HUD model — the pure decisions behind the in-fight HUD and touch controls.
// No React, no DOM: tested in hudModel.test.ts, used by HUD.tsx / MobileControls.tsx.
// ============================================================

export type HpTone = 'ok' | 'warn' | 'low';

/** Health fraction at or below which the bar warns (yellow) and then alarms (pink, pulsing). */
export const HP_WARN = 0.5;
export const HP_LOW = 0.25;

export function hpFraction(health: number, maxHealth: number): number {
    if (!(maxHealth > 0)) return 0;
    return Math.min(1, Math.max(0, health / maxHealth));
}

export function hpTone(pct: number): HpTone {
    return pct > HP_WARN ? 'ok' : pct > HP_LOW ? 'warn' : 'low';
}

/** Low-health alarm applies only while the fighter is still up. */
export function isLowHealth(pct: number, alive: boolean): boolean {
    return alive && pct <= HP_LOW;
}

/** How many of `segments` neon cells are lit: any health at all keeps one lit. */
export function litSegments(pct: number, segments = 10): number {
    if (pct <= 0) return 0;
    return Math.min(segments, Math.max(1, Math.ceil(pct * segments)));
}

/**
 * Local fighter first, then the rest in seat order, then dealt to two columns:
 * 1st and 3rd on the left, 2nd and 4th on the right. Only four are shown.
 */
export function hudColumns<T extends { isLocal: boolean; seat: number }>(fighters: readonly T[]): { left: T[]; right: T[] } {
    const ordered = [...fighters]
        .sort((a, b) => (Number(b.isLocal) - Number(a.isLocal)) || a.seat - b.seat)
        .slice(0, 4);
    return {
        left: ordered.filter((_, i) => i % 2 === 0),
        right: ordered.filter((_, i) => i % 2 === 1),
    };
}

export type RoundEndKind = 'ko' | 'draw' | 'wins' | 'decision' | 'other';

/** Classify the sim's round-end text ('K.O.', 'DRAW', 'DECISION', '<name> WINS'). */
export function classifyRoundEnd(text: string): { kind: RoundEndKind; name?: string } {
    if (text === 'K.O.') return { kind: 'ko' };
    if (text === 'DRAW') return { kind: 'draw' };
    if (text === 'DECISION') return { kind: 'decision' };
    const m = /^(.*) WINS$/.exec(text);
    if (m) return { kind: 'wins', name: m[1] };
    return { kind: 'other' };
}

/** Whole seconds left from the sim's 60 fps frame counter. */
export function secondsLeft(roundTimeFrames: number): number {
    return Math.max(0, Math.ceil(roundTimeFrames / 60));
}

/** The timer turns urgent for the last ten seconds. */
export const TIMER_URGENT_SECONDS = 10;

// ---- Touch stick ------------------------------------------------------------

export interface StickResult {
    /** Move vector for LocalInputSource.setVirtualMove (x right, z down, |v| <= 1). */
    moveX: number;
    moveZ: number;
    /** Knob offset in px from the stick origin, clamped to the radius. */
    knobX: number;
    knobY: number;
}

export const STICK_DEADZONE = 0.14;

/**
 * Thumb displacement (px) from the stick origin -> move vector + knob offset.
 * Inside the dead zone the character stands still; outside it the response is
 * rescaled so it ramps from 0 at the edge of the dead zone to 1 at the radius.
 */
export function stickVector(dx: number, dy: number, radius: number, deadzone = STICK_DEADZONE): StickResult {
    const mag = Math.hypot(dx, dy);
    if (!(radius > 0) || mag === 0) return { moveX: 0, moveZ: 0, knobX: 0, knobY: 0 };
    const ux = dx / mag;
    const uy = dy / mag;
    const clamped = Math.min(mag, radius);
    const n = clamped / radius;
    const scaled = n < deadzone ? 0 : (n - deadzone) / (1 - deadzone);
    return { moveX: ux * scaled, moveZ: uy * scaled, knobX: ux * clamped, knobY: uy * clamped };
}

/** Keep a floating stick's origin far enough inside its zone that the whole ring stays on screen. */
export function clampOrigin(v: number, size: number, radius: number): number {
    const lo = radius;
    const hi = Math.max(lo, size - radius);
    return Math.min(hi, Math.max(lo, v));
}
