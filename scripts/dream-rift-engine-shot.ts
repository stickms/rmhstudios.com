/**
 * Renders REAL gameplay frames from the Dream Rift engine using the external
 * sprite sheets (players + bosses) from public/dream-rift, to verify the asset
 * pipeline end-to-end. Run: pnpm exec tsx scripts/dream-rift-engine-shot.ts [outDir]
 */

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { setCanvasFactory } from '../lib/dream-rift/render/surface';
import { World } from '../lib/dream-rift/sim/world';
import { Renderer, type HudView } from '../lib/dream-rift/render/renderer';
import { DIFFICULTY, CHAR_STATS, CANVAS_W, CANVAS_H, PLAYFIELD_W, PLAYFIELD_H, FPS } from '../lib/dream-rift/constants';
import { STAGES } from '../lib/dream-rift/data/stages';
import { stageTheme } from '../lib/dream-rift/render/palette';
import { CHARACTERS, PLAYER_IDS } from '../lib/dream-rift/render/sprites';
import type { LoadedSpriteAssets } from '../lib/dream-rift/assets';
import type { BossState, BulletColorName, PlayerShip, PlayerId, InputFrame } from '../lib/dream-rift/types';

setCanvasFactory((w, h) => {
    const canvas = createCanvas(w, h);
    return { canvas, ctx: canvas.getContext('2d') };
});

const W = CANVAS_W;
const H = CANVAS_H;
const SCALE = 2;

async function loadAssets(): Promise<LoadedSpriteAssets> {
    const manifest = JSON.parse(readFileSync('public/dream-rift/manifest.json', 'utf8'));
    const out: LoadedSpriteAssets = { players: {}, bosses: {} };
    for (const id of Object.keys(manifest.sprites.players)) {
        const def = manifest.sprites.players[id];
        const image = await loadImage(`public${def.url}`);
        out.players[id as PlayerId] = { image: image as unknown as HTMLImageElement, def };
    }
    for (const key of Object.keys(manifest.sprites.bosses)) {
        const def = manifest.sprites.bosses[key];
        const image = await loadImage(`public${def.url}`);
        out.bosses[key] = { image: image as unknown as HTMLImageElement, def };
    }
    return out;
}

function makePlayer(charId: PlayerId, x: number): PlayerShip {
    return {
        slot: 0, userId: 'u', name: CHARACTERS[charId].name, charId, present: true, joined: true,
        x, y: PLAYFIELD_H - 70, lives: 3, bombs: 2, power: 96, graze: 1284, score: 4127360, pointItems: 30,
        hitboxR: CHAR_STATS[charId].hitboxR, invuln: 999, deathbombWindow: 0, bombActive: 0, dead: false, respawnTimer: 0,
        focus: true, firing: true, shotCd: 0, spellMeter: 0, isLocal: true, renderX: x, renderY: PLAYFIELD_H - 70,
        prevRenderX: x, prevRenderY: PLAYFIELD_H - 70,
        moveDir: 0, deaths: 1, spellsCaptured: 2, animTime: 30,
    };
}

function makeBoss(stageIdx: number): BossState {
    const def = STAGES[stageIdx].boss;
    const card = def.cards[Math.min(1, def.cards.length - 1)];
    const hp = def.baseHp * card.hp;
    return {
        active: true, x: PLAYFIELD_W / 2, y: 104, prevX: PLAYFIELD_W / 2, prevY: 104, targetX: PLAYFIELD_W / 2 + 30, targetY: 110, hp: hp * 0.62, phaseMaxHp: hp,
        phaseIndex: Math.min(1, def.cards.length - 1), phaseStartFrame: 0, timeLeftFrames: 28 * FPS, themeIndex: def.themeIndex,
        cards: def.cards, defeated: false, introFrames: 0, moveTimer: 200, fireTimer: 0, subTimer: 0, hitFlash: 0, name: def.name,
    };
}

function render(stageIdx: number, charId: PlayerId, assets: LoadedSpriteAssets): Buffer {
    const canvas = createCanvas(W * SCALE, H * SCALE);
    const world = new World(DIFFICULTY.normal, 1000 + stageIdx);
    world.localSlot = 0;
    world.players = [makePlayer(charId, PLAYFIELD_W / 2 + 8)];
    world.themeColors = stageTheme(stageIdx).bulletColors as BulletColorName[];
    world.spawnBoss(makeBoss(stageIdx));

    const renderer = new Renderer(canvas as unknown as HTMLCanvasElement, stageIdx);
    renderer.setStage(stageIdx, STAGES[stageIdx].boss.themeIndex);
    renderer.setSpriteAssets(assets);
    renderer.setBossSheet(STAGES[stageIdx].boss.bossSprite);
    renderer.resize(W * SCALE, H * SCALE, 1);

    const input: InputFrame = { up: false, down: false, left: false, right: false, shot: true, bomb: false, focus: true };
    for (let i = 0; i < 240; i++) {
        world.setLocalInput(0, input);
        world.step(true);
    }

    const boss = world.boss!;
    const card = boss.cards[boss.phaseIndex];
    const hud: HudView = {
        stageIndex: stageIdx, stageName: STAGES[stageIdx].name, bossActive: true, bossName: boss.name,
        bossHp: boss.hp, bossMaxHp: boss.phaseMaxHp, bossCards: boss.cards.length, bossCardIndex: boss.phaseIndex,
        spellName: card.isSpell ? card.name : '', spellTimeLeft: boss.timeLeftFrames / FPS, hiScore: 12480990, coop: false,
    };
    renderer.render(world, hud, 0);
    return (canvas as unknown as { toBuffer: (m: string) => Buffer }).toBuffer('image/png');
}

const outDir = process.argv[2] || '/tmp/dream-rift-engine';
mkdirSync(outDir, { recursive: true });
const assets = await loadAssets();
const chars = PLAYER_IDS;
STAGES.forEach((s, i) => {
    writeFileSync(`${outDir}/engine-stage-${i + 1}.png`, render(i, chars[i % chars.length], assets));
    console.log('rendered real-sprite engine frame for stage', i + 1);
});
console.log('done');
