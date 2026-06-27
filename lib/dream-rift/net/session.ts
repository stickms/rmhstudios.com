/**
 * GameSession — orchestrates a single Dream Rift run.
 *
 * Drives a fixed-60Hz loop over the World, walks the stage director, applies
 * the authority split (host owns boss HP / spell-card transitions / stage flow;
 * each client owns its own ship and death), syncs over a Transport, and feeds
 * the renderer, audio and zustand store. Singleplayer is just the host with a
 * LocalTransport and no peers.
 */

import { CHAR_STATS, DIFFICULTY, FPS, LIVES_START, BOMBS_START, MAX_CATCHUP_FRAMES, PLAYFIELD_H, PLAYFIELD_W, PLAYER_SLOT_OFFSETS } from '../constants';
import { World } from '../sim/world';
import { STAGES, STAGE_COUNT, type StageDef, type BossDef, type EnemySpawn } from '../data/stages';
import { STORY, type DialogueLine } from '../data/script';
import { pickCommentBySalt, type CommentEvent } from '../data/comments';
import { CHARACTERS } from '../render/sprites';
import { stageTheme } from '../render/palette';
import { Renderer, type HudView } from '../render/renderer';
import type { Music } from '../sound/music';
import type { MusicLike } from '../sound/musicController';
import type { Sfx } from '../sound/sfx';
import type { LoadedSpriteAssets } from '../assets';
import type { InputManager } from '../input';
import { useDreamRift, type RunResult } from '../store';
import type { Transport } from './transport';
import type { BossState, BulletColorName, Difficulty, PlayerShip, PlayerId } from '../types';
import type { RelayMsg } from './events';

type DirectorPhase = 'intro' | 'waves' | 'midboss' | 'bridge' | 'preDialogue' | 'boss' | 'postDialogue' | 'stageClear' | 'done';

export interface RosterEntry {
    slot: number;
    userId: string;
    name: string;
    charId: PlayerId;
    isHost: boolean;
    isLocal: boolean;
}

export interface SessionOpts {
    transport: Transport;
    difficulty: Difficulty;
    seed: number;
    roster: RosterEntry[];
    canvas: HTMLCanvasElement;
    music: MusicLike;
    sfx: Sfx;
    input: InputManager;
    hiScore: number;
    spriteAssets?: LoadedSpriteAssets | null;
}

export class GameSession {
    private world: World;
    private renderer: Renderer;
    private transport: Transport;
    private music: MusicLike;
    private sfx: Sfx;
    private input: InputManager;
    private difficulty: Difficulty;
    private hiScore: number;

    private isHost: boolean;
    private localSlot: number;
    private coop: boolean;

    private stageIndex = 0;
    private phase: DirectorPhase = 'intro';
    private phaseFrame = 0;
    private wavesSpawned = new Set<number>();
    private pendingPeerDamage = 0;
    private dialogueLines: DialogueLine[] = [];
    private dialogueIndex = 0;
    private dialogueBeat: 'pre' | 'post' = 'pre';
    private advanceLatch = false;

    private raf = 0;
    private last = 0;
    private acc = 0;
    private running = false;
    private netTick = 0;
    private destroyed = false;
    /** Sim frames the run has been active for (drives the "time survived" stat). */
    private runFrames = 0;

    constructor(opts: SessionOpts) {
        this.transport = opts.transport;
        this.music = opts.music;
        this.sfx = opts.sfx;
        this.input = opts.input;
        this.difficulty = opts.difficulty;
        this.hiScore = opts.hiScore;
        this.isHost = opts.transport.isHost;
        this.localSlot = opts.transport.localSlot;
        this.coop = opts.roster.length > 1;

        const diff = DIFFICULTY[opts.difficulty];
        this.world = new World(diff, opts.seed);
        this.world.localSlot = this.localSlot;
        this.world.isHostBoss = this.isHost;
        this.world.players = opts.roster.map((r) => makePlayer(r, this.localSlot));
        this.renderer = new Renderer(opts.canvas, 0);
        this.renderer.showHitboxAlways = useDreamRift.getState().showHitbox;
        this.renderer.setSpriteAssets(opts.spriteAssets ?? null);
        opts.input.setBindings(useDreamRift.getState().bindings);

        this.transport.start((msg) => this.onRelay(msg));
    }

    // ── lifecycle ──

    start(): void {
        this.running = true;
        this.enterStage(0);
        this.last = performance.now();
        this.loop(this.last);
    }

    private loop = (now: number): void => {
        if (!this.running) return;
        this.raf = requestAnimationFrame(this.loop);
        let dt = now - this.last;
        this.last = now;
        if (dt > 250) dt = 250;
        this.acc += dt;
        const step = 1000 / FPS;
        let frames = 0;
        // The sim always advances in whole fixed 60Hz steps (deterministic, MP-safe).
        while (this.acc >= step && frames < MAX_CATCHUP_FRAMES) {
            this.acc -= step;
            frames++;
            this.tick();
        }
        // Render as often as the display allows. `alpha` is how far we are into the
        // next sim frame; the renderer lerps positions by it for smooth >60fps
        // motion, and `dt` (real elapsed ms) keeps render-only animation at normal
        // speed no matter the refresh rate.
        const alpha = step > 0 ? Math.min(1, Math.max(0, this.acc / step)) : 1;
        this.render(alpha, dt);
    };

    private render(alpha = 1, dtMs = 1000 / FPS): void {
        const hud = this.buildHud();
        this.renderer.render(this.world, hud, this.localSlot, alpha, dtMs);
    }

    destroy(): void {
        this.destroyed = true;
        this.running = false;
        cancelAnimationFrame(this.raf);
        this.transport.stop();
        this.music.stop();
    }

    private get simActive(): boolean {
        return this.phase !== 'preDialogue' && this.phase !== 'postDialogue' && !useDreamRift.getState().paused;
    }

    // ── per-frame tick ──

    private tick(): void {
        const poll = this.input.poll();
        if (poll.pausePressed && this.phase !== 'done') {
            const paused = !useDreamRift.getState().paused;
            useDreamRift.getState().setPaused(paused);
            this.sfx.play('pause');
        }
        if (useDreamRift.getState().paused) return;

        // dialogue advancing
        if (this.phase === 'preDialogue' || this.phase === 'postDialogue') {
            if (poll.advancePressed && !this.advanceLatch) {
                this.advanceLatch = true;
                this.requestAdvance();
            }
            if (!poll.advancePressed) this.advanceLatch = false;
            return;
        }

        // feed local input to sim
        this.world.setLocalInput(this.localSlot, poll.frame);

        const result = this.world.step(this.isHost);
        this.phaseFrame++;
        this.runFrames++;

        // sfx for local events
        for (const ev of result.events) {
            if (ev.slot !== this.localSlot) continue;
            switch (ev.kind) {
                case 'graze': this.sfx.play('graze'); break;
                case 'bomb': this.sfx.play('bomb'); this.renderer.flashScreen('#ffffff', 0.4); break;
                case 'playerDeath': this.sfx.play('death'); this.onLocalDeath(); break;
                case 'extend': this.sfx.play('extend'); this.maybeComment('extend'); break;
                case 'itemCollect': break;
                case 'enemyKilled': if (Math.random() < 0.08) this.sfx.play('enemyDown'); break;
            }
        }
        if (this.world.players[this.localSlot]?.firing && this.world.frame % 6 === 0) this.sfx.play('shot');

        // personal streak / milestone danmaku comments (local — each player sees their own)
        const lp0 = this.world.players[this.localSlot];
        if (lp0) {
            if (lp0.graze >= this.nextGrazeMilestone) {
                this.nextGrazeMilestone += 500;
                this.localComment('grazeStreak');
            }
            if (lp0.score >= this.nextScoreMilestone) {
                this.nextScoreMilestone = this.nextScoreMilestone < 1_000_000 ? 1_000_000 : this.nextScoreMilestone * 2;
                this.localComment('milestone');
            }
        }

        // host accumulates boss damage; clients report theirs
        if (result.localBossDamage > 0) {
            if (this.isHost) this.pendingPeerDamage += result.localBossDamage;
            else this.transport.send({ k: 'dmg', d: { v: result.localBossDamage } });
        }
        if (result.localDied) this.transport.send({ k: 'death', slot: this.localSlot });
        if (result.localBombed) this.transport.send({ k: 'bomb', slot: this.localSlot });

        // director
        this.director();

        // networking
        this.netTick++;
        this.syncNet();
        this.updateHiScore();
    }

    // ── stage director (host authoritative transitions) ──

    private director(): void {
        const stage = STAGES[this.stageIndex];
        switch (this.phase) {
            case 'intro':
                this.runWavelessIntro(stage);
                if (this.isHost && this.phaseFrame >= stage.introFrames) this.gotoPhase('waves');
                break;
            case 'waves':
                this.spawnWaves(stage.waves);
                if (this.isHost && this.phaseFrame >= stage.wavesDuration && this.world.enemies.activeCount === 0) {
                    this.gotoPhase('midboss');
                }
                break;
            case 'midboss':
                this.tickBoss(stage.midboss, false);
                break;
            case 'bridge':
                this.spawnWaves(stage.bridge);
                if (this.isHost && this.phaseFrame >= stage.bridgeDuration && this.world.enemies.activeCount === 0) {
                    this.gotoPhase('preDialogue');
                }
                break;
            case 'boss':
                this.tickBoss(stage.boss, true);
                break;
            case 'stageClear':
                if (this.isHost && this.phaseFrame > 90) {
                    if (this.stageIndex + 1 < STAGE_COUNT) {
                        this.transport.send({ k: 'cmd', d: { t: 'stage', stage: this.stageIndex + 1 } });
                        this.enterStage(this.stageIndex + 1);
                    } else {
                        this.transport.send({ k: 'cmd', d: { t: 'victory' } });
                        this.onVictory();
                    }
                }
                break;
        }

        // host game-over check
        if (this.isHost && this.phase !== 'done' && this.allPlayersOut()) {
            this.transport.send({ k: 'cmd', d: { t: 'gameover' } });
            this.onGameOver();
        }
    }

    private runWavelessIntro(stage: StageDef): void {
        if (this.phaseFrame === 1) {
            useDreamRift.getState().setStageBanner({ title: stage.name, subtitle: stage.subtitle });
            this.music.play(stage.music.stage as Parameters<Music['play']>[0]);
            this.maybeComment('stageStart');
        }
        if (this.phaseFrame === 150) useDreamRift.getState().setStageBanner(null);
    }

    private spawnWaves(waves: StageDef['waves']): void {
        for (let i = 0; i < waves.length; i++) {
            const w = waves[i];
            const key = i;
            if (!this.wavesSpawned.has(key) && this.phaseFrame >= w.atFrame) {
                this.wavesSpawned.add(key);
                for (const e of w.enemies) this.spawnEnemyLine(e);
            }
        }
    }

    private spawnEnemyLine(def: EnemySpawn): void {
        const count = def.count ?? 1;
        for (let i = 0; i < count; i++) {
            const delay = (def.delayStep ?? 0) * i;
            const x = def.x + (def.xStep ?? 0) * i;
            // stagger via a tiny scheduled spawn using frame offset baked into holdFrames is messy;
            // instead spawn immediately but offset enter position so they trail in
            const e = this.world.spawnEnemy({
                id: this.nextEnemyId(),
                variant: def.variant,
                color: def.color,
                hp: Math.round(def.hp * this.world.diff.enemyHp),
                x: clampSpawnX(x),
                y: -20 - delay * 0.6,
                enterX: clampSpawnX(x),
                enterY: def.y,
                holdFrames: def.holdFrames,
                exitDir: def.exitDir,
                speed: def.speed,
                patternId: def.patternId,
                drops: def.drops,
                lifetime: def.holdFrames + 240,
            });
            void e;
        }
    }

    private enemyIdCounter = 1;
    private nextEnemyId(): number {
        return this.enemyIdCounter++;
    }

    // ── boss handling ──

    private tickBoss(def: BossDef, isMainBoss: boolean): void {
        const boss = this.world.boss;
        if (!boss) {
            // spawn boss on entering the phase (host & clients construct locally)
            this.spawnBoss(def, isMainBoss);
            return;
        }
        if (boss.introFrames > 0) {
            this.world.bossVulnerable = false;
            return;
        }
        this.world.bossVulnerable = true;

        if (this.isHost) {
            const card = boss.cards[boss.phaseIndex];
            const dmg = this.pendingPeerDamage;
            this.pendingPeerDamage = 0;
            boss.hp -= dmg;
            let captured = false;
            let timeout = false;
            if (boss.timeLeftFrames <= 0 && card?.timeLimit > 0) timeout = true;
            if (boss.hp <= 0 || timeout) {
                captured = boss.hp <= 0 && !!card?.isSpell;
                if (boss.phaseIndex + 1 < boss.cards.length) {
                    this.advanceBossCard(def, boss.phaseIndex + 1, captured);
                } else {
                    this.defeatBoss(isMainBoss, captured);
                }
            }
        }
    }

    private spawnBoss(def: BossDef, isMainBoss: boolean): void {
        const card0 = def.cards[0];
        const hp0 = def.baseHp * card0.hp * this.world.diff.bossHp;
        const boss: BossState = {
            active: true,
            x: PLAYFIELD_W / 2,
            y: -40,
            prevX: PLAYFIELD_W / 2,
            prevY: -40,
            targetX: PLAYFIELD_W / 2,
            targetY: 110,
            hp: hp0,
            phaseMaxHp: hp0,
            phaseIndex: 0,
            phaseStartFrame: this.world.frame,
            timeLeftFrames: Math.round(card0.timeLimit * FPS),
            themeIndex: def.themeIndex,
            cards: def.cards,
            defeated: false,
            introFrames: 90,
            moveTimer: 120,
            fireTimer: 0,
            subTimer: 0,
            hitFlash: 0,
            name: def.name,
        };
        this.world.spawnBoss(boss);
        this.world.themeColors = stageTheme(this.stageIndex).bulletColors as BulletColorName[];
        this.renderer.setStage(this.stageIndex, def.themeIndex);
        this.renderer.setBossSheet(def.bossSprite);
        this.music.play((isMainBoss ? STAGES[this.stageIndex].music.boss : STAGES[this.stageIndex].music.boss) as Parameters<Music['play']>[0]);
        if (this.phaseFrame < 4) this.maybeComment('bossStart');
    }

    private advanceBossCard(def: BossDef, index: number, captured: boolean): void {
        this.transport.send({ k: 'cmd', d: { t: 'card', index, captured: captured ? 1 : 0 } });
        this.applyBossCard(def, index, captured);
    }

    private applyBossCard(def: BossDef, index: number, captured: boolean): void {
        const boss = this.world.boss;
        if (!boss) return;
        const card = def.cards[index];
        const hp = def.baseHp * card.hp * this.world.diff.bossHp;
        boss.phaseIndex = index;
        boss.hp = hp;
        boss.phaseMaxHp = hp;
        boss.phaseStartFrame = this.world.frame;
        boss.timeLeftFrames = Math.round(card.timeLimit * FPS);
        this.world.clearAllBullets(true);
        this.renderer.flashScreen(stageTheme(this.stageIndex).glow, 0.5);
        if (captured) {
            this.sfx.play('spell');
            const lp = this.world.players[this.localSlot];
            if (lp) lp.spellsCaptured++;
            this.maybeComment('spellCapture');
        }
    }

    private defeatBoss(isMainBoss: boolean, captured: boolean): void {
        const boss = this.world.boss;
        if (boss) boss.defeated = true;
        this.sfx.play('bossDown');
        this.renderer.flashScreen('#ffffff', 0.8);
        this.world.clearAllBullets(true);
        if (captured) {
            const lp = this.world.players[this.localSlot];
            if (lp) lp.spellsCaptured++;
        }
        this.maybeComment('bossDefeat');
        this.world.boss = null;
        if (isMainBoss) {
            this.gotoPhase('postDialogue');
        } else {
            this.gotoPhase('bridge');
        }
    }

    // ── dialogue ──

    private gotoPhase(phase: DirectorPhase): void {
        // host broadcasts; both apply locally
        if (this.isHost) this.transport.send({ k: 'cmd', d: { t: 'phase', phase } });
        this.applyPhase(phase);
    }

    private applyPhase(phase: DirectorPhase): void {
        this.phase = phase;
        this.phaseFrame = 0;
        this.wavesSpawned.clear();
        if (phase === 'preDialogue') this.startDialogue('pre');
        else if (phase === 'postDialogue') this.startDialogue('post');
        else if (phase === 'midboss' || phase === 'boss') {
            // boss spawns on first tickBoss
            this.world.boss = null;
        } else if (phase === 'stageClear') {
            useDreamRift.getState().setStageBanner({ title: 'Stage Clear', subtitle: STAGES[this.stageIndex].name });
            this.sfx.play('menuSelect');
        }
    }

    private startDialogue(beat: 'pre' | 'post'): void {
        const story = STORY[this.stageIndex];
        this.dialogueBeat = beat;
        this.dialogueLines = beat === 'pre' ? story.pre.lines : story.post.lines;
        this.dialogueIndex = 0;
        this.showDialogueLine();
    }

    private showDialogueLine(): void {
        const line = this.dialogueLines[this.dialogueIndex];
        if (!line) {
            useDreamRift.getState().setDialogue(null);
            return;
        }
        const leadChar = this.world.players[this.localSlot]?.charId ?? 'bllm';
        const story = STORY[this.stageIndex];
        const bossName = this.dialogueBeat === 'pre' ? story.pre.bossName : story.post.bossName;
        useDreamRift.getState().setDialogue({
            speakerSide: line.speaker === 'player' ? 'left' : 'right',
            speakerName: line.speaker === 'player' ? CHARACTERS[leadChar].name : line.name ?? bossName,
            speakerChar: line.speaker === 'player' ? leadChar : null,
            bossThemeIndex: STAGES[this.stageIndex].boss.themeIndex,
            bossSprite: STAGES[this.stageIndex].boss.bossSprite,
            text: line.text,
            index: this.dialogueIndex,
            total: this.dialogueLines.length,
            canAdvance: true,
        });
    }

    private requestAdvance(): void {
        if (this.isHost) this.advanceDialogue();
        else this.transport.send({ k: 'advance' });
    }

    private advanceDialogue(): void {
        this.dialogueIndex++;
        if (this.dialogueIndex >= this.dialogueLines.length) {
            this.transport.send({ k: 'cmd', d: { t: 'dlgAdvance', index: this.dialogueIndex } });
            this.endDialogue();
        } else {
            this.transport.send({ k: 'cmd', d: { t: 'dlgAdvance', index: this.dialogueIndex } });
            this.showDialogueLine();
        }
    }

    private endDialogue(): void {
        useDreamRift.getState().setDialogue(null);
        this.sfx.play('menuSelect');
        if (this.dialogueBeat === 'pre') {
            this.applyPhase('boss');
        } else {
            this.applyPhase('stageClear');
        }
    }

    // ── stage / run lifecycle ──

    private enterStage(index: number): void {
        this.stageIndex = index;
        this.world.themeColors = stageTheme(index).bulletColors as BulletColorName[];
        this.renderer.setStage(index, STAGES[index].boss.themeIndex);
        this.applyPhase('intro');
    }

    private onLocalDeath(): void {
        this.maybeComment('death');
    }

    private onVictory(): void {
        this.phase = 'done';
        this.music.play('victory');
        this.maybeComment('victory');
        this.finishRun(true);
    }

    private onGameOver(): void {
        this.phase = 'done';
        this.music.play('gameover');
        this.maybeComment('gameOver');
        this.finishRun(false);
    }

    private finishRun(cleared: boolean): void {
        this.running = false;
        cancelAnimationFrame(this.raf);
        const lp = this.world.players[this.localSlot] ?? this.world.players[0];
        const joined = this.world.players.filter((p) => p.joined);
        const result: RunResult = {
            cleared,
            stageReached: this.stageIndex + 1,
            score: Math.floor(lp?.score ?? 0),
            graze: lp?.graze ?? 0,
            spellsCaptured: lp?.spellsCaptured ?? 0,
            deaths: lp?.deaths ?? 0,
            character: lp?.charId ?? 'bllm',
            difficulty: this.difficulty,
            perPlayer: joined.map((p) => ({ name: p.name, score: Math.floor(p.score), charId: p.charId })),
            // Co-op leaderboard metrics (combined squad score + how long they lasted).
            combinedScore: joined.reduce((sum, p) => sum + Math.floor(p.score), 0),
            timeSurvived: Math.round(this.runFrames / FPS),
            playerCount: joined.length,
            isHost: this.isHost,
        };
        useDreamRift.getState().setResult(result);
        useDreamRift.getState().setScreen(cleared ? 'victory' : 'game-over');
        // render one final frame
        this.render();
    }

    private allPlayersOut(): boolean {
        const joined = this.world.players.filter((p) => p.joined);
        if (joined.length === 0) return true;
        return joined.every((p) => p.lives <= 0 && p.dead);
    }

    // ── networking ──

    private syncNet(): void {
        const lp = this.world.players[this.localSlot];
        if (lp && this.netTick % 3 === 0 && this.coop) {
            this.transport.send({
                k: 'p',
                slot: this.localSlot,
                d: {
                    x: Math.round(lp.x), y: Math.round(lp.y), f: lp.firing ? 1 : 0, fo: lp.focus ? 1 : 0,
                    l: lp.lives, b: lp.bombs, d: lp.dead ? 1 : 0, s: Math.floor(lp.score), p: lp.power, m: lp.moveDir,
                },
            });
        }
        if (this.isHost && this.coop && this.netTick % 6 === 0 && this.world.boss?.active) {
            const b = this.world.boss;
            this.transport.send({ k: 'world', d: { hp: Math.max(0, Math.round(b.hp)), mx: Math.round(b.phaseMaxHp), idx: b.phaseIndex, bx: Math.round(b.x), by: Math.round(b.y), tl: b.timeLeftFrames } });
        }
    }

    private onRelay(msg: RelayMsg): void {
        if (this.destroyed) return;
        switch (msg.k) {
            case 'p': {
                const slot = msg.slot ?? -1;
                const d = msg.d ?? {};
                this.world.setRemoteState(slot, Number(d.x), Number(d.y), d.f === 1, d.fo === 1, Number(d.l), Number(d.b), d.d === 1);
                const p = this.world.players[slot];
                if (p && !p.isLocal) {
                    p.score = Number(d.s) || p.score;
                    p.power = Number(d.p) || p.power;
                    p.moveDir = Number(d.m) || 0;
                }
                break;
            }
            case 'death': {
                const p = this.world.players[msg.slot ?? -1];
                if (p && !p.isLocal) this.world.spawnEffect('death', p.renderX, p.renderY, '#ff5577', 36, 30);
                break;
            }
            case 'bomb': {
                const p = this.world.players[msg.slot ?? -1];
                if (p && !p.isLocal) this.world.spawnEffect('spell', p.renderX, p.renderY, '#ffffff', 50, 36);
                break;
            }
            case 'dmg':
                if (this.isHost) this.pendingPeerDamage += Number(msg.d?.v) || 0;
                break;
            case 'advance':
                if (this.isHost && (this.phase === 'preDialogue' || this.phase === 'postDialogue')) this.advanceDialogue();
                break;
            case 'world': {
                const b = this.world.boss;
                const d = msg.d ?? {};
                if (b && !this.isHost) {
                    b.hp = Number(d.hp);
                    b.phaseMaxHp = Number(d.mx) || b.phaseMaxHp;
                    b.targetX = Number(d.bx);
                    b.targetY = Number(d.by);
                    b.timeLeftFrames = Number(d.tl) || b.timeLeftFrames;
                }
                break;
            }
            case 'comment':
                this.renderer.addComment(String(msg.d?.text ?? ''), String(msg.d?.color ?? '#ffffff'));
                this.sfx.play('comment');
                break;
            case 'cmd':
                this.onCommand(msg.d ?? {});
                break;
        }
    }

    private onCommand(d: Record<string, number | string | boolean | null>): void {
        if (this.isHost) return; // host already applied locally
        switch (d.t) {
            case 'phase':
                this.applyPhase(d.phase as DirectorPhase);
                break;
            case 'stage':
                this.enterStage(Number(d.stage));
                break;
            case 'card': {
                const def = this.phase === 'boss' ? STAGES[this.stageIndex].boss : STAGES[this.stageIndex].midboss;
                this.applyBossCard(def, Number(d.index), d.captured === 1);
                break;
            }
            case 'dlgAdvance':
                this.dialogueIndex = Number(d.index);
                if (this.dialogueIndex >= this.dialogueLines.length) this.endDialogue();
                else this.showDialogueLine();
                break;
            case 'victory':
                this.onVictory();
                break;
            case 'gameover':
                this.onGameOver();
                break;
        }
    }

    // ── comments ──

    private nextGrazeMilestone = 500;
    private nextScoreMilestone = 1_000_000;

    /** A comment only the local player sees (personal streaks/milestones). */
    private localComment(event: CommentEvent): void {
        this.commentSalt = (this.commentSalt * 1103515245 + 12345) & 0x7fffffff;
        this.renderer.addComment(pickCommentBySalt(event, this.commentSalt), stageTheme(this.stageIndex).glow);
        this.sfx.play('comment');
    }

    private commentSalt = 1;
    private maybeComment(event: CommentEvent): void {
        // host (or SP) decides and broadcasts so everyone sees the same text
        if (!this.isHost) return;
        this.commentSalt = (this.commentSalt * 1103515245 + 12345) & 0x7fffffff;
        const text = pickCommentBySalt(event, this.commentSalt);
        const color = stageTheme(this.stageIndex).star;
        this.renderer.addComment(text, color);
        this.sfx.play('comment');
        this.transport.send({ k: 'comment', d: { text, color } });
    }

    /** Public hook so the HUD/score systems can fire milestone/streak comments. */
    fireComment(event: CommentEvent): void {
        this.maybeComment(event);
    }

    // ── hud ──

    private updateHiScore(): void {
        const lp = this.world.players[this.localSlot];
        if (lp && lp.score > this.hiScore) this.hiScore = lp.score;
    }

    private buildHud(): HudView {
        const stage = STAGES[this.stageIndex];
        const boss = this.world.boss;
        const card = boss?.cards[boss.phaseIndex];
        return {
            stageIndex: this.stageIndex,
            stageName: stage.name,
            bossActive: !!boss?.active,
            bossName: boss?.name ?? '',
            bossHp: boss?.hp ?? 0,
            bossMaxHp: boss?.phaseMaxHp ?? 0,
            bossCards: boss?.cards.length ?? 0,
            bossCardIndex: boss?.phaseIndex ?? 0,
            spellName: card?.isSpell ? card.name : '',
            spellTimeLeft: boss && card?.timeLimit ? boss.timeLeftFrames / FPS : -1,
            hiScore: this.hiScore,
            coop: this.coop,
        };
    }

    resize(w: number, h: number, dpr: number): void {
        this.renderer.resize(w, h, dpr);
    }

    setShowHitbox(v: boolean): void {
        this.renderer.showHitboxAlways = v;
    }
}

// ── helpers ──

function makePlayer(r: RosterEntry, localSlot: number): PlayerShip {
    const st = CHAR_STATS[r.charId];
    const x = PLAYFIELD_W / 2 + (PLAYER_SLOT_OFFSETS[r.slot] ?? 0);
    const y = PLAYFIELD_H - 56;
    return {
        slot: r.slot,
        userId: r.userId,
        name: r.name,
        charId: r.charId,
        present: true,
        joined: true,
        x,
        y,
        lives: LIVES_START,
        bombs: BOMBS_START,
        power: 0,
        graze: 0,
        score: 0,
        pointItems: 0,
        hitboxR: st.hitboxR,
        invuln: 180,
        deathbombWindow: 0,
        bombActive: 0,
        dead: false,
        respawnTimer: 0,
        focus: false,
        firing: false,
        shotCd: 0,
        spellMeter: 0,
        isLocal: r.slot === localSlot,
        renderX: x,
        renderY: y,
        prevRenderX: x,
        prevRenderY: y,
        moveDir: 0,
        deaths: 0,
        spellsCaptured: 0,
        animTime: 0,
    };
}

function clampSpawnX(x: number): number {
    return Math.max(16, Math.min(PLAYFIELD_W - 16, x));
}
