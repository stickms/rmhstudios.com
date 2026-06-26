// ============================================================
// Match Configuration — seats, mode, spawn layout
// ============================================================

import type { FighterClass, MatchMode } from './fighters/types';
import { ARENA_RADIUS } from './fighters/types';
import { CLASS_DISPLAY } from './fighters/stats';

export type SeatKind = 'human-local' | 'ai' | 'remote';

export interface SeatConfig {
    seat: number;
    className: FighterClass;
    team: number;        // FFA: equals seat. Teams: 0 or 1.
    kind: SeatKind;
    displayName: string;
}

export interface MatchConfig {
    mode: MatchMode;
    maxRounds: number;
    aiDifficulty: number; // 0..1
    seats: SeatConfig[];  // 2..4 seats
}

/** Evenly distribute spawn points around the ring, facing the centre. */
export function spawnPositions(count: number): { x: number; z: number }[] {
    const r = ARENA_RADIUS * 0.62;
    const out: { x: number; z: number }[] = [];
    if (count === 2) {
        // Classic 1v1 — left vs right.
        return [{ x: -r, z: 0 }, { x: r, z: 0 }];
    }
    // 3–4 fighters: evenly spaced around the ring, starting at the top.
    for (let i = 0; i < count; i++) {
        const a = -Math.PI / 2 + (i / count) * Math.PI * 2;
        out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
    }
    return out;
}

/** Default human-readable name for a seat. */
export function defaultSeatName(seat: number, className: FighterClass, kind: SeatKind): string {
    if (kind === 'ai') return `CPU ${seat + 1}`;
    return CLASS_DISPLAY[className].name;
}

/** Team colour used by HUD / team-mode tinting. */
export const TEAM_COLORS = ['#33ccff', '#ff3366'];
