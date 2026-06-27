/**
 * Generates a stand-in game-card image (public/images/games/dream-rift.webp)
 * from the real engine art, so the /games card renders until the bespoke key
 * art is dropped in. Run: pnpm exec tsx scripts/dream-rift-card.ts
 */

import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { setCanvasFactory } from '../lib/dream-rift/render/surface';
import { World } from '../lib/dream-rift/sim/world';
import { Renderer } from '../lib/dream-rift/render/renderer';
import { DIFFICULTY, CHAR_STATS, CANVAS_W, CANVAS_H, PLAYFIELD_W, PLAYFIELD_H } from '../lib/dream-rift/constants';
import { STAGES } from '../lib/dream-rift/data/stages';
import { stageTheme } from '../lib/dream-rift/render/palette';
import type { BossState, BulletColorName, PlayerShip, InputFrame } from '../lib/dream-rift/types';

setCanvasFactory((w, h) => {
    const canvas = createCanvas(w, h);
    return { canvas, ctx: canvas.getContext('2d') };
});

const stageIdx = 2; // Astral Rift — most striking
const SCALE = 2;

const world = new World(DIFFICULTY.normal, 4242);
world.localSlot = 0;
const player: PlayerShip = {
    slot: 0, userId: 'u', name: 'You', charId: 'aoi', present: true, joined: true,
    x: PLAYFIELD_W / 2, y: PLAYFIELD_H - 84, lives: 3, bombs: 2, power: 96, graze: 0, score: 0, pointItems: 0,
    hitboxR: CHAR_STATS.aoi.hitboxR, invuln: 999, deathbombWindow: 0, bombActive: 0, dead: false, respawnTimer: 0,
    focus: true, firing: true, shotCd: 0, spellMeter: 0, isLocal: true, renderX: PLAYFIELD_W / 2, renderY: PLAYFIELD_H - 84,
    moveDir: 0, deaths: 0, spellsCaptured: 0, animTime: 30,
};
world.players = [player];
world.themeColors = stageTheme(stageIdx).bulletColors as BulletColorName[];
const def = STAGES[stageIdx].boss;
const boss: BossState = {
    active: true, x: PLAYFIELD_W / 2, y: 100, targetX: PLAYFIELD_W / 2, targetY: 104, hp: 9999, phaseMaxHp: 9999,
    phaseIndex: 1, phaseStartFrame: 0, timeLeftFrames: 1800, themeIndex: def.themeIndex, cards: def.cards,
    defeated: false, introFrames: 0, moveTimer: 999, fireTimer: 0, subTimer: 0, hitFlash: 0, name: def.name,
};
world.spawnBoss(boss);

const full = createCanvas(CANVAS_W * SCALE, CANVAS_H * SCALE);
const renderer = new Renderer(full as unknown as HTMLCanvasElement, stageIdx);
renderer.setStage(stageIdx, def.themeIndex);
renderer.resize(CANVAS_W * SCALE, CANVAS_H * SCALE, 1);
const input: InputFrame = { up: false, down: false, left: false, right: false, shot: false, bomb: false, focus: true };
for (let i = 0; i < 200; i++) {
    world.setLocalInput(0, input);
    world.step(true);
    player.invuln = 999; // keep alive for the shot
}
renderer.render(world, {
    stageIndex: stageIdx, stageName: STAGES[stageIdx].name, bossActive: true, bossName: def.name,
    bossHp: 6000, bossMaxHp: 9999, bossCards: def.cards.length, bossCardIndex: 1, spellName: '', spellTimeLeft: -1,
    hiScore: 0, coop: false,
}, 0);

// ── compose portrait card: crop the playfield, add a title plate ──
const pfW = PLAYFIELD_W * SCALE;
const pfH = PLAYFIELD_H * SCALE;
const cardW = 800;
const imgH = Math.round((cardW / pfW) * pfH);
const plate = 150;
const card = createCanvas(cardW, imgH + plate);
const ctx = card.getContext('2d') as unknown as CanvasRenderingContext2D;
ctx.fillStyle = '#06010f';
ctx.fillRect(0, 0, cardW, imgH + plate);
ctx.drawImage(full as unknown as CanvasImageSource, 0, 0, pfW, pfH, 0, 0, cardW, imgH);

// title plate
const grad = ctx.createLinearGradient(0, imgH - 60, 0, imgH + plate);
grad.addColorStop(0, 'rgba(6,1,15,0)');
grad.addColorStop(0.35, 'rgba(10,3,24,0.95)');
grad.addColorStop(1, '#0a0118');
ctx.fillStyle = grad;
ctx.fillRect(0, imgH - 80, cardW, plate + 80);
ctx.textAlign = 'center';
ctx.fillStyle = '#fff';
ctx.font = 'bold 76px Georgia, serif';
ctx.fillText('Dream Rift', cardW / 2, imgH + 64);
ctx.fillStyle = stageTheme(stageIdx).glow;
ctx.font = '26px sans-serif';
ctx.fillText('TOUHOU-STYLE CO-OP BULLET HELL', cardW / 2, imgH + 106);
// neon border
ctx.strokeStyle = stageTheme(stageIdx).glow;
ctx.lineWidth = 4;
ctx.strokeRect(2, 2, cardW - 4, imgH + plate - 4);

let buf: Buffer;
try {
    buf = (card as unknown as { toBuffer: (m: string, q?: number) => Buffer }).toBuffer('image/webp', 90);
    console.log('encoded webp');
} catch {
    buf = (card as unknown as { toBuffer: (m: string) => Buffer }).toBuffer('image/png');
    console.log('webp unsupported — wrote png bytes (rename needed)');
}
const out = `${process.cwd()}/public/images/games/dream-rift.webp`;
writeFileSync(out, buf);
console.log('wrote', out, buf.length, 'bytes');
