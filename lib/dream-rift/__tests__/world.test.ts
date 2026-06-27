import { describe, it, expect } from 'vitest';
import { World } from '../sim/world';
import { DIFFICULTY, CHAR_STATS, PLAYFIELD_W, PLAYFIELD_H } from '../constants';
import type { BossState, PlayerShip, InputFrame } from '../types';

function makePlayer(slot: number, isLocal: boolean): PlayerShip {
    return {
        slot, userId: 'u' + slot, name: 'P' + slot, charId: 'reika', present: true, joined: true,
        x: PLAYFIELD_W / 2, y: PLAYFIELD_H - 56, lives: 3, bombs: 2, power: 0, graze: 0, score: 0, pointItems: 0,
        hitboxR: CHAR_STATS.reika.hitboxR, invuln: 0, deathbombWindow: 0, bombActive: 0, dead: false, respawnTimer: 0,
        focus: false, firing: false, shotCd: 0, spellMeter: 0, isLocal, renderX: PLAYFIELD_W / 2, renderY: PLAYFIELD_H - 56,
        moveDir: 0, deaths: 0, spellsCaptured: 0, animTime: 0,
    };
}

function makeBoss(pattern: string): BossState {
    return {
        active: true, x: PLAYFIELD_W / 2, y: 100, targetX: PLAYFIELD_W / 2, targetY: 110, hp: 100000, phaseMaxHp: 100000,
        phaseIndex: 0, phaseStartFrame: 0, timeLeftFrames: 3600, themeIndex: 0,
        cards: [{ name: 'Test', hp: 1, timeLimit: 60, pattern, isSpell: true, bonus: 0 }],
        defeated: false, introFrames: 0, moveTimer: 120, fireTimer: 0, subTimer: 0, hitFlash: 0, name: 'Tester',
    };
}

const NO_INPUT: InputFrame = { up: false, down: false, left: false, right: false, shot: false, bomb: false, focus: false };

describe('World simulation', () => {
    it('runs many frames with a firing boss without throwing and spawns bullets', () => {
        const w = new World(DIFFICULTY.normal, 12345);
        w.players = [makePlayer(0, true)];
        w.spawnBoss(makeBoss('spell-spiralRose'));
        let maxBullets = 0;
        expect(() => {
            for (let i = 0; i < 200; i++) {
                w.setLocalInput(0, NO_INPUT);
                w.step(true);
                maxBullets = Math.max(maxBullets, w.bullets.activeCount);
            }
        }).not.toThrow();
        expect(maxBullets).toBeGreaterThan(0);
    });

    it('is deterministic: same seed + inputs → same bullet count', () => {
        const run = () => {
            const w = new World(DIFFICULTY.normal, 555);
            w.players = [makePlayer(0, true)];
            w.spawnBoss(makeBoss('spell-galaxySpiral'));
            for (let i = 0; i < 120; i++) {
                w.setLocalInput(0, NO_INPUT);
                w.step(true);
            }
            return w.bullets.activeCount;
        };
        expect(run()).toBe(run());
    });

    it('kills the local player on a direct bullet hit (client authority)', () => {
        const w = new World(DIFFICULTY.normal, 1);
        const p = makePlayer(0, true);
        w.players = [p];
        // bullet sitting exactly on the player
        w.spawnBullet({ x: p.x, y: p.y, speed: 0, angle: 0, radius: 4, drawRadius: 6, shape: 'orb', color: 'red' });
        w.setLocalInput(0, NO_INPUT);
        w.step(true);
        expect(p.dead).toBe(true);
        expect(p.lives).toBe(2);
    });

    it('does not kill an invulnerable player but still lets them graze', () => {
        const w = new World(DIFFICULTY.normal, 1);
        const p = makePlayer(0, true);
        p.invuln = 60;
        w.players = [p];
        // bullet within graze ring but not invuln-bypassing
        w.spawnBullet({ x: p.x + 14, y: p.y, speed: 0, angle: 0, radius: 4, drawRadius: 6, shape: 'orb', color: 'red' });
        w.setLocalInput(0, NO_INPUT);
        w.step(true);
        expect(p.dead).toBe(false);
        expect(p.graze).toBeGreaterThan(0);
    });

    it('player shots damage and destroy enemies, awarding score', () => {
        const w = new World(DIFFICULTY.normal, 1);
        const p = makePlayer(0, true);
        w.players = [p];
        w.spawnEnemy({ id: 1, x: p.x, y: 80, hp: 6, variant: 'sprite', color: 'red', enterX: p.x, enterY: 80, holdFrames: 600, exitDir: -Math.PI / 2, speed: 1, patternId: 'none', drops: { power: 0, point: 0, life: 0, bomb: 0 }, lifetime: 1200 });
        const shoot: InputFrame = { ...NO_INPUT, shot: true };
        for (let i = 0; i < 120; i++) {
            w.setLocalInput(0, shoot);
            w.step(true);
            if (w.enemies.activeCount === 0) break;
        }
        expect(w.enemies.activeCount).toBe(0);
        expect(p.score).toBeGreaterThan(0);
    });

    it('reports local boss damage when the local player shoots the boss', () => {
        const w = new World(DIFFICULTY.normal, 1);
        const p = makePlayer(0, true);
        p.power = 128;
        w.players = [p];
        w.spawnBoss(makeBoss('nonspell-petals'));
        const shoot: InputFrame = { ...NO_INPUT, shot: true };
        let totalDmg = 0;
        for (let i = 0; i < 60; i++) {
            w.setLocalInput(0, shoot);
            totalDmg += w.step(true).localBossDamage;
        }
        expect(totalDmg).toBeGreaterThan(0);
    });
});