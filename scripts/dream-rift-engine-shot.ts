/**
 * Renders REAL gameplay frames straight from the Dream Rift engine — the actual
 * World simulation drawn by the actual Renderer — to PNGs. Doubles as an
 * integration smoke test of sim + renderer + sprites + atlas + background.
 * Run: pnpm exec tsx scripts/dream-rift-engine-shot.ts [outDir]
 */

import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'node:fs';
import { setCanvasFactory } from '../lib/dream-rift/render/surface';
import { World } from '../lib/dream-rift/sim/world';
import { Renderer, type HudView } from '../lib/dream-rift/render/renderer';
import { DIFFICULTY, CHAR_STATS, CANVAS_W, CANVAS_H, PLAYFIELD_W, PLAYFIELD_H, FPS } from '../lib/dream-rift/constants';
import { STAGES } from '../lib/dream-rift/data/stages';
import { stageTheme } from '../lib/dream-rift/render/palette';
import { pickCommentBySalt } from '../lib/dream-rift/data/comments';
import type { BossState, BulletColorName, PlayerShip, PlayerId, InputFrame } from '../lib/dream-rift/types';

setCanvasFactory((w, h) => {
    const canvas = createCanvas(w, h);
    return { canvas, ctx: canvas.getContext('2d') };
});

function makePlayer(charId: PlayerId, x: number): PlayerShip {
    return {
        slot: 0, userId: 'u', name: 'You', charId, present: true, joined: true,
        x, y: PLAYFIELD_H - 70, lives: 3, bombs: 2, power: 96, graze: 1284, score: 4127360, pointItems: 30,
        hitboxR: CHAR_STATS[charId].hitboxR, invuln: 0, deathbombWindow: 0, bombActive: 0, dead: false, respawnTimer: 0,
        focus: true, firing: true, shotCd: 0, spellMeter: 0, isLocal: true, renderX: x, renderY: PLAYFIELD_H - 70,
        moveDir: 0, deaths: 1, spellsCaptured: 2, animTime: 30,
    };
}

function makeBoss(stageIdx: number): BossState {
    const def = STAGES[stageIdx].boss;
    const card = def.cards[Math.min(1, def.cards.length - 1)];
    const hp = def.baseHp * card.hp;
    return {
        active: true, x: PLAYFIELD_W / 2, y: 104, targetX: PLAYFIELD_W / 2 + 30, targetY: 110, hp: hp * 0.62, phaseMaxHp: hp,
        phaseIndex: Math.min(1, def.cards.length - 1), phaseStartFrame: 0, timeLeftFrames: 28 * FPS, themeIndex: def.themeIndex,
        cards: def.cards, defeated: false, introFrames: 0, moveTimer: 200, fireTimer: 0, subTimer: 0, hitFlash: 0, name: def.name,
    };
}

const W = CANVAS_W;
const H = CANVAS_H;
const SCALE = 2;

function render(stageIdx: number, charId: PlayerId): Buffer {
    const canvas = createCanvas(W * SCALE, H * SCALE);
    const world = new World(DIFFICULTY.normal, 1000 + stageIdx);
    world.localSlot = 0;
    world.players = [makePlayer(charId, PLAYFIELD_W / 2 + 8)];
    world.themeColors = stageTheme(stageIdx).bulletColors as BulletColorName[];
    world.spawnBoss(makeBoss(stageIdx));

    const renderer = new Renderer(canvas as unknown as HTMLCanvasElement, stageIdx);
    renderer.setStage(stageIdx, STAGES[stageIdx].boss.themeIndex);
    renderer.resize(W * SCALE, H * SCALE, 1);

    // simulate a real bullet field building up
    const input: InputFrame = { up: false, down: false, left: false, right: false, shot: true, bomb: false, focus: true };
    for (let i = 0; i < 240; i++) {
        world.setLocalInput(0, input);
        world.step(true);
    }

    // a few danmaku comments flying across
    ['stageStart', 'spellCapture', 'grazeStreak'].forEach((ev, i) => {
        renderer.addComment(pickCommentBySalt(ev as Parameters<typeof pickCommentBySalt>[0], i + stageIdx + 1), stageTheme(stageIdx).star);
    });

    const boss = world.boss!;
    const card = boss.cards[boss.phaseIndex];
    const hud: HudView = {
        stageIndex: stageIdx,
        stageName: STAGES[stageIdx].name,
        bossActive: true,
        bossName: boss.name,
        bossHp: boss.hp,
        bossMaxHp: boss.phaseMaxHp,
        bossCards: boss.cards.length,
        bossCardIndex: boss.phaseIndex,
        spellName: card.isSpell ? card.name : '',
        spellTimeLeft: boss.timeLeftFrames / FPS,
        hiScore: 12480990,
        coop: false,
    };
    renderer.render(world, hud, 0);

    return (canvas as unknown as { toBuffer: (m: string) => Buffer }).toBuffer('image/png');
}

const outDir = process.argv[2] || '/tmp/dream-rift-engine';
mkdirSync(outDir, { recursive: true });
const chars: PlayerId[] = ['reika', 'aoi', 'nyx'];
STAGES.forEach((s, i) => {
    writeFileSync(`${outDir}/engine-stage-${i + 1}.png`, render(i, chars[i % chars.length]));
    console.log('rendered real engine frame for stage', i + 1, `(bullets simulated)`);
});
console.log('done');
