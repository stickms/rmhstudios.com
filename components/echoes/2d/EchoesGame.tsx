'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useGameStore, PlayerStats } from '@/lib/echoes/game2d/GameStore';
import { buildGrid, steerToward, isBlocked, EnemyNav } from '@/lib/echoes/game2d/Pathfinding';
import { AbilityState, makeAbilityStates, GameClass } from '@/lib/echoes/game2d/ClassStore';
import { Keybinds, loadKeybinds } from '@/lib/echoes/game2d/KeybindStore';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Enemy {
    id: number; x: number; y: number;
    hp: number; maxHp: number;
    speed: number; radius: number;
    xpValue: number; color: string; flashTimer: number;
    type: 'basic' | 'elite' | 'boss';
    shootTimer: number; dashTimer: number; dashVx: number; dashVy: number;
    nav: EnemyNav;
}
interface Bullet {
    id: number; x: number; y: number; vx: number; vy: number;
    damage: number; pierceLeft: number; chainLeft: number;
    isCrit: boolean; hitEnemyIds: Set<number>; aoeRadius: number;
    distanceTraveled: number; isEnemy?: boolean;
}
interface XPOrb { id: number; x: number; y: number; value: number; radius: number; }
interface Pickup { id: number; x: number; y: number; type: 'health' | 'xp_boost' | 'shield' | 'speed'; collected: boolean; }
interface Obstacle { x: number; y: number; w: number; h: number; type: 'wall' | 'rock' | 'crate' | 'pillar'; color: string; borderColor: string; }
interface Particle { id: number; x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; radius: number; }

// ─── Difficulty ───────────────────────────────────────────────────────────────
function getDifficulty(wave: number) {
    const scale = Math.pow(1.18, wave - 1);
    return {
        basicHp: Math.floor(12 * scale), basicSpeed: Math.min(220, 65 + wave * 9), basicDamage: 8 + wave * 2,
        eliteHp: Math.floor(80 * scale), eliteSpeed: Math.min(180, 55 + wave * 7), eliteDamage: 18 + wave * 4,
        bossHp: Math.floor(600 * scale), bossSpeed: Math.min(120, 40 + wave * 4), bossDamage: 35 + wave * 6,
        spawnInterval: Math.max(0.15, 1.5 - wave * 0.08),
        spawnCount: Math.min(8, 1 + Math.floor(wave / 2)),
        eliteChance: Math.min(0.45, 0.05 + wave * 0.04),
        bossWave: wave % 5 === 0,
    };
}

// ─── World ────────────────────────────────────────────────────────────────────
const WORLD_W = 3200, WORLD_H = 3200, MAX_ENEMIES = 200;
let nextId = 1;
const uid = () => nextId++;

function generateObstacles(): Obstacle[] {
    const obs: Obstacle[] = [];
    const rng = (a: number, b: number) => a + Math.random() * (b - a);
    const wt = 40, wc = '#1a1a2e', wb = '#4444aa';
    obs.push({ x: 0, y: 0, w: WORLD_W, h: wt, type: 'wall', color: wc, borderColor: wb });
    obs.push({ x: 0, y: WORLD_H - wt, w: WORLD_W, h: wt, type: 'wall', color: wc, borderColor: wb });
    obs.push({ x: 0, y: 0, w: wt, h: WORLD_H, type: 'wall', color: wc, borderColor: wb });
    obs.push({ x: WORLD_W - wt, y: 0, w: wt, h: WORLD_H, type: 'wall', color: wc, borderColor: wb });
    for (let i = 0; i < 40; i++) {
        const cx = rng(200, WORLD_W - 200), cy = rng(200, WORLD_H - 200);
        if (Math.abs(cx - WORLD_W / 2) < 200 && Math.abs(cy - WORLD_H / 2) < 200) continue;
        for (let j = 0; j < Math.floor(rng(2, 6)); j++) {
            const s = rng(30, 90);
            obs.push({ x: cx + rng(-60, 60), y: cy + rng(-60, 60), w: s, h: s * rng(0.6, 1.4), type: 'rock', color: '#2a2a3a', borderColor: '#555577' });
        }
    }
    for (let i = 0; i < 20; i++) {
        const x = rng(200, WORLD_W - 400), y = rng(200, WORLD_H - 200);
        if (Math.abs(x - WORLD_W / 2) < 200 && Math.abs(y - WORLD_H / 2) < 200) continue;
        const h = Math.random() > 0.5;
        obs.push({ x, y, w: h ? rng(100, 300) : rng(20, 40), h: h ? rng(20, 40) : rng(100, 300), type: 'wall', color: '#1e1e30', borderColor: '#3344aa' });
    }
    for (let i = 0; i < 60; i++) {
        const x = rng(100, WORLD_W - 100), y = rng(100, WORLD_H - 100);
        if (Math.abs(x - WORLD_W / 2) < 150 && Math.abs(y - WORLD_H / 2) < 150) continue;
        const s = rng(24, 48);
        obs.push({ x, y, w: s, h: s, type: 'crate', color: '#3a2a1a', borderColor: '#aa6622' });
    }
    for (let i = 0; i < 30; i++) {
        const x = rng(150, WORLD_W - 150), y = rng(150, WORLD_H - 150);
        if (Math.abs(x - WORLD_W / 2) < 180 && Math.abs(y - WORLD_H / 2) < 180) continue;
        const s = rng(20, 40);
        obs.push({ x, y, w: s, h: s, type: 'pillar', color: '#222233', borderColor: '#6666cc' });
    }
    return obs;
}

function generatePickups(): Pickup[] {
    const types: Pickup['type'][] = ['health', 'xp_boost', 'shield', 'speed'];
    return Array.from({ length: 80 }, () => {
        const x = 100 + Math.random() * (WORLD_W - 200);
        const y = 100 + Math.random() * (WORLD_H - 200);
        return { id: uid(), x, y, type: types[Math.floor(Math.random() * 4)], collected: false };
    }).filter(p => !(Math.abs(p.x - WORLD_W / 2) < 200 && Math.abs(p.y - WORLD_H / 2) < 200));
}

// ─── Collision ────────────────────────────────────────────────────────────────
function circleVsRect(cx: number, cy: number, r: number, rx: number, ry: number, rw: number, rh: number) {
    const nx = Math.max(rx, Math.min(cx, rx + rw)), ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
}
function resolveCircleRect(cx: number, cy: number, r: number, rx: number, ry: number, rw: number, rh: number) {
    const nx = Math.max(rx, Math.min(cx, rx + rw)), ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx, dy = cy - ny;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
    return { nx: (dx / dist) * (r - dist), ny: (dy / dist) * (r - dist) };
}

// ─── Map Renderer ─────────────────────────────────────────────────────────────
function renderMapToOffscreen(obstacles: Obstacle[]): HTMLCanvasElement {
    const oc = document.createElement('canvas');
    oc.width = WORLD_W; oc.height = WORLD_H;
    const ctx = oc.getContext('2d')!;
    ctx.fillStyle = '#0d0d1a'; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    const ts = 80;
    for (let tx = 0; tx < WORLD_W; tx += ts) for (let ty = 0; ty < WORLD_H; ty += ts) {
        const shade = (Math.floor(tx / ts) + Math.floor(ty / ts)) % 2 === 0 ? 0.03 : 0;
        ctx.fillStyle = `rgba(100,100,255,${shade})`; ctx.fillRect(tx, ty, ts, ts);
    }
    ctx.strokeStyle = 'rgba(80,80,180,0.12)'; ctx.lineWidth = 1;
    for (let x = 0; x < WORLD_W; x += ts) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); ctx.stroke(); }
    for (let y = 0; y < WORLD_H; y += ts) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(0,200,255,0.06)'; ctx.lineWidth = 2;
    for (let x = 0; x < WORLD_W; x += 320) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); ctx.stroke(); }
    for (let y = 0; y < WORLD_H; y += 320) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); ctx.stroke(); }
    for (let i = 0; i < 400; i++) {
        const x = Math.random() * WORLD_W, y = Math.random() * WORLD_H, r = 20 + Math.random() * 80;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(0,0,0,0.15)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    for (const obs of obstacles) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(obs.x + 4, obs.y + 4, obs.w, obs.h);
        if (obs.type === 'pillar') {
            ctx.fillStyle = obs.color; ctx.beginPath(); ctx.arc(obs.x + obs.w / 2, obs.y + obs.h / 2, obs.w / 2, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = obs.borderColor; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(obs.x + obs.w / 2, obs.y + obs.h / 2, obs.w / 2, 0, Math.PI * 2); ctx.stroke();
        } else {
            ctx.fillStyle = obs.color; ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
            ctx.strokeStyle = obs.borderColor; ctx.lineWidth = obs.type === 'wall' ? 2 : 1.5; ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
            if (obs.type === 'crate') {
                ctx.strokeStyle = obs.borderColor + '88'; ctx.lineWidth = 1; ctx.beginPath();
                ctx.moveTo(obs.x, obs.y); ctx.lineTo(obs.x + obs.w, obs.y + obs.h);
                ctx.moveTo(obs.x + obs.w, obs.y); ctx.lineTo(obs.x, obs.y + obs.h); ctx.stroke();
            }
        }
        if (obs.type === 'wall' || obs.type === 'pillar') {
            ctx.shadowColor = obs.borderColor; ctx.shadowBlur = 8;
            ctx.strokeStyle = obs.borderColor + '44'; ctx.lineWidth = 1; ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
            ctx.shadowBlur = 0;
        }
    }
    return oc;
}

// ─── Pickup helpers ───────────────────────────────────────────────────────────
function pickupColor(t: Pickup['type']) { return t === 'health' ? '#22ee66' : t === 'xp_boost' ? '#aa44ff' : t === 'shield' ? '#00ccff' : '#ffcc00'; }
function pickupIcon(t: Pickup['type']) { return t === 'health' ? '♥' : t === 'xp_boost' ? '★' : t === 'shield' ? '◈' : '⚡'; }

// ─── Minimap ──────────────────────────────────────────────────────────────────
function drawMinimap(ctx: CanvasRenderingContext2D, g: { player: { x: number; y: number }; enemies: Enemy[]; camX: number; camY: number }, w: number, h: number, pickups: Pickup[], obstacles: Obstacle[]) {
    const mm = { x: w - 140, y: h - 140, size: 120, scale: 120 / WORLD_W };
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(mm.x - 4, mm.y - 4, mm.size + 8, mm.size + 8);
    ctx.strokeStyle = 'rgba(100,100,255,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(mm.x - 4, mm.y - 4, mm.size + 8, mm.size + 8);
    ctx.fillStyle = '#334466';
    for (const obs of obstacles) ctx.fillRect(mm.x + obs.x * mm.scale, mm.y + obs.y * mm.scale, Math.max(1, obs.w * mm.scale), Math.max(1, obs.h * mm.scale));
    for (const p of pickups) { if (p.collected) continue; ctx.fillStyle = pickupColor(p.type); ctx.fillRect(mm.x + p.x * mm.scale - 1, mm.y + p.y * mm.scale - 1, 2, 2); }
    ctx.fillStyle = '#ff3344';
    for (const e of g.enemies) ctx.fillRect(mm.x + e.x * mm.scale - 1, mm.y + e.y * mm.scale - 1, 2, 2);
    ctx.fillStyle = '#44aaff'; ctx.beginPath(); ctx.arc(mm.x + g.player.x * mm.scale, mm.y + g.player.y * mm.scale, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
    ctx.strokeRect(mm.x + g.camX * mm.scale, mm.y + g.camY * mm.scale, window.innerWidth * mm.scale, window.innerHeight * mm.scale);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function EchoesGame({
    mobileInput,
    onAbilityStatesChange,
    abilityTrigger,
}: {
    mobileInput?: { dx: number; dy: number };
    onAbilityStatesChange?: (states: AbilityState[]) => void;
    abilityTrigger?: number | null; // index 0/1/2 when mobile button tapped
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const keysRef = useRef<Set<string>>(new Set());
    const keybindsRef = useRef<Keybinds>(loadKeybinds());
    const sizeRef = useRef({ w: typeof window !== 'undefined' ? window.innerWidth : 800, h: typeof window !== 'undefined' ? window.innerHeight : 600 });
    const [canvasSize, setCanvasSize] = useState(sizeRef.current);

    const obstaclesRef = useRef<Obstacle[]>([]);
    const pickupsRef = useRef<Pickup[]>([]);
    const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const gameRef = useRef({
        player: { x: WORLD_W / 2, y: WORLD_H / 2 },
        camX: 0, camY: 0,
        enemies: [] as Enemy[],
        bullets: [] as Bullet[],
        xpOrbs: [] as XPOrb[],
        particles: [] as Particle[],
        lastTime: 0, spawnTimer: 0, fireTimer: 0, running: false,
        shieldTimer: 0, speedBoostTimer: 0,
        moveDir: { dx: 0, dy: 0 },
        // Ability state
        abilityStates: makeAbilityStates() as AbilityState[],
        deathMarkShots: 0, deathMarkMult: 1,
        soulDrainActive: false, soulDrainHeal: 0, soulDrainTimer: 0,
        regenBurstRate: 0, regenBurstTimer: 0,
        overdriveTimer: 0, overdriveMultiplier: 1,
        fanHammerTimer: 0, fanHammerMultiplier: 1,
        ricochetTimer: 0, ricochetActive: false,
        deadEyeTimer: 0, deadEyeActive: false,
    });

    const store = useGameStore();
    const storeRef = useRef(store);
    storeRef.current = store;
    const mobileRef = useRef(mobileInput);
    mobileRef.current = mobileInput;
    const abilityTriggerRef = useRef(abilityTrigger);
    abilityTriggerRef.current = abilityTrigger;

    // Reload keybinds when they change (settings panel saves to localStorage)
    useEffect(() => {
        const onStorage = () => { keybindsRef.current = loadKeybinds(); };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    // Resize
    useEffect(() => {
        const onResize = () => { const w = window.innerWidth, h = window.innerHeight; sizeRef.current = { w, h }; setCanvasSize({ w, h }); };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // ── Ability activation ────────────────────────────────────────────────────
    const activateAbility = useCallback((index: number) => {
        const g = gameRef.current;
        const s = storeRef.current;
        const cls = s.selectedClass;
        if (!cls) return;
        const as = g.abilityStates[index];
        if (as.cooldownRemaining > 0) return;
        const ability = cls.abilities[index];
        const effect = ability.effect;
        as.cooldownRemaining = ability.cooldown;
        as.active = true;
        as.activeTimer = ('duration' in effect ? (effect as { duration: number }).duration : 1);

        switch (effect.type) {
            case 'shield':       g.shieldTimer = effect.duration; break;
            case 'aoe_slam':
            case 'scythe': {
                const { radius, damage } = effect;
                for (const e of g.enemies) {
                    const dx = e.x - g.player.x, dy = e.y - g.player.y;
                    if (Math.sqrt(dx * dx + dy * dy) < radius) { e.hp -= damage; e.flashTimer = 0.15; }
                }
                for (let i = 0; i < 20; i++) {
                    const a = Math.random() * Math.PI * 2, r = Math.random() * radius;
                    g.particles.push({ id: uid(), x: g.player.x + Math.cos(a) * r, y: g.player.y + Math.sin(a) * r, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, life: 0.5, maxLife: 0.5, color: effect.type === 'scythe' ? '#ff4400' : '#4488ff', radius: 4 });
                }
                break;
            }
            case 'hp_boost':
            case 'heal_pulse':   s.heal(effect.amount); break;
            case 'death_mark':   g.deathMarkShots = 3; g.deathMarkMult = effect.multiplier; break;
            case 'soul_drain':   g.soulDrainActive = true; g.soulDrainHeal = effect.healPerKill; g.soulDrainTimer = effect.duration; break;
            case 'regen_burst':  g.regenBurstRate = effect.rate; g.regenBurstTimer = effect.duration; break;
            case 'overdrive':    g.overdriveMultiplier = effect.fireRateMultiplier; g.overdriveTimer = effect.duration; break;
            case 'fan_hammer':   g.fanHammerMultiplier = effect.fireRateMultiplier; g.fanHammerTimer = effect.duration; break;
            case 'ricochet':     g.ricochetActive = true; g.ricochetTimer = effect.duration; break;
            case 'dead_eye':     g.deadEyeActive = true; g.deadEyeTimer = effect.duration; break;
            case 'blink': {
                const { dx, dy } = g.moveDir;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                let bx = g.player.x + (dx / len) * effect.distance;
                let by = g.player.y + (dy / len) * effect.distance;
                if (!isBlocked(bx, by)) { g.player.x = Math.max(60, Math.min(WORLD_W - 60, bx)); g.player.y = Math.max(60, Math.min(WORLD_H - 60, by)); }
                for (let i = 0; i < 12; i++) { const a = Math.random() * Math.PI * 2; g.particles.push({ id: uid(), x: g.player.x, y: g.player.y, vx: Math.cos(a) * 100, vy: Math.sin(a) * 100, life: 0.4, maxLife: 0.4, color: '#cc44ff', radius: 3 }); }
                break;
            }
            case 'shadow_burst': {
                g.shieldTimer = Math.max(g.shieldTimer, effect.invincible);
                for (const e of g.enemies) {
                    const dx = e.x - g.player.x, dy = e.y - g.player.y;
                    if (Math.sqrt(dx * dx + dy * dy) < effect.radius) { e.hp -= effect.damage; e.flashTimer = 0.15; }
                }
                for (let i = 0; i < 24; i++) { const a = Math.random() * Math.PI * 2; g.particles.push({ id: uid(), x: g.player.x, y: g.player.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, life: 0.6, maxLife: 0.6, color: '#cc44ff', radius: 5 }); }
                break;
            }
            case 'chain_nova': {
                let targets = g.enemies.filter(e => { const dx = e.x - g.player.x, dy = e.y - g.player.y; return Math.sqrt(dx * dx + dy * dy) < effect.radius; }).slice(0, effect.chains);
                for (const e of targets) { e.hp -= effect.damage; e.flashTimer = 0.15; g.particles.push({ id: uid(), x: e.x, y: e.y, vx: 0, vy: 0, life: 0.3, maxLife: 0.3, color: '#ffff00', radius: 8 }); }
                break;
            }
        }
    }, []);

    // ── Spawn enemy ───────────────────────────────────────────────────────────
    const spawnEnemy = useCallback((wave: number, type: Enemy['type'] = 'basic') => {
        const g = gameRef.current;
        if (g.enemies.length >= MAX_ENEMIES) return;
        const px = g.player.x, py = g.player.y;
        const spawnDist = 200 + Math.random() * 400;
        const angle = Math.random() * Math.PI * 2;
        let x = Math.max(60, Math.min(WORLD_W - 60, px + Math.cos(angle) * spawnDist));
        let y = Math.max(60, Math.min(WORLD_H - 60, py + Math.sin(angle) * spawnDist));
        for (let attempt = 0; attempt < 10; attempt++) {
            if (!isBlocked(x, y)) break;
            const a2 = Math.random() * Math.PI * 2, d2 = 200 + Math.random() * 400;
            x = Math.max(60, Math.min(WORLD_W - 60, px + Math.cos(a2) * d2));
            y = Math.max(60, Math.min(WORLD_H - 60, py + Math.sin(a2) * d2));
        }
        const diff = getDifficulty(wave);
        const cfg = { basic: { hp: diff.basicHp, speed: diff.basicSpeed, radius: 12, xpValue: 1, color: '#ff0066' }, elite: { hp: diff.eliteHp, speed: diff.eliteSpeed, radius: 18, xpValue: 8, color: '#ff8800' }, boss: { hp: diff.bossHp, speed: diff.bossSpeed, radius: 36, xpValue: 30, color: '#cc00ff' } }[type];
        g.enemies.push({ id: uid(), x, y, hp: cfg.hp, maxHp: cfg.hp, speed: cfg.speed, radius: cfg.radius, xpValue: cfg.xpValue, color: cfg.color, flashTimer: 0, type, shootTimer: 0, dashTimer: 0, dashVx: 0, dashVy: 0, nav: { path: [], timer: 0 } });
    }, []);

    // ── Particles ─────────────────────────────────────────────────────────────
    const spawnParticles = useCallback((x: number, y: number, color: string, count = 6) => {
        const g = gameRef.current;
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2, spd = 30 + Math.random() * 80;
            g.particles.push({ id: uid(), x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.4 + Math.random() * 0.3, maxLife: 0.6, color, radius: 2 + Math.random() * 3 });
        }
    }, []);

    // ── Fire bullet ───────────────────────────────────────────────────────────
    const fireBullet = useCallback((stats: PlayerStats, pierceAll: boolean, forceCrit: boolean, damageMult: number) => {
        const g = gameRef.current;
        const p = g.player;
        const obstacles = obstaclesRef.current;
        const hasLOS = (ex: number, ey: number) => {
            for (let i = 1; i <= 12; i++) {
                const t = i / 12, rx = p.x + (ex - p.x) * t, ry = p.y + (ey - p.y) * t;
                for (const obs of obstacles) if (rx >= obs.x && rx <= obs.x + obs.w && ry >= obs.y && ry <= obs.y + obs.h) return false;
            }
            return true;
        };
        let nearest: Enemy | null = null, nearestDist = Infinity;
        for (const e of g.enemies) {
            const dx = e.x - p.x, dy = e.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
            if (d > stats.bulletRange) continue;
            if (d < nearestDist && hasLOS(e.x, e.y)) { nearestDist = d; nearest = e; }
        }
        if (!nearest) return;
        const baseAngle = Math.atan2(nearest.y - p.y, nearest.x - p.x);
        const count = stats.bulletCount, spread = count > 1 ? 0.25 : 0;
        for (let i = 0; i < count; i++) {
            // For even counts, shift the spread so one bullet is always centered (0 offset)
            const offset = (count % 2 === 0) ? (i - (count / 2 - 1)) : (i - (count - 1) / 2);
            const angle = baseAngle + (count > 1 ? offset * spread : 0);
            const isCrit = forceCrit || Math.random() < stats.critChance;
            const dmg = stats.damage * (isCrit ? stats.critMultiplier : 1) * damageMult;
            g.bullets.push({ id: uid(), x: p.x, y: p.y, vx: Math.cos(angle) * stats.bulletSpeed, vy: Math.sin(angle) * stats.bulletSpeed, damage: dmg, pierceLeft: pierceAll ? 999 : stats.piercing, chainLeft: stats.chainCount, isCrit, hitEnemyIds: new Set(), aoeRadius: stats.aoeRadius, distanceTraveled: 0 });
        }
    }, []);

    // ── Game loop ─────────────────────────────────────────────────────────────
    const gameLoop = useCallback((timestamp: number) => {
        const g = gameRef.current;
        if (!g.running) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const delta = Math.min((timestamp - g.lastTime) / 1000, 0.05);
        g.lastTime = timestamp;
        const s = storeRef.current;
        if (s.phase !== 'playing') { requestAnimationFrame(gameLoop); return; }
        const stats = s.stats;
        s.tick(delta);
        const { w, h } = sizeRef.current;
        const obstacles = obstaclesRef.current;
        const pickups = pickupsRef.current;

        // Timers
        g.shieldTimer = Math.max(0, g.shieldTimer - delta);
        g.speedBoostTimer = Math.max(0, g.speedBoostTimer - delta);
        g.regenBurstTimer = Math.max(0, g.regenBurstTimer - delta);
        g.overdriveTimer = Math.max(0, g.overdriveTimer - delta);
        g.fanHammerTimer = Math.max(0, g.fanHammerTimer - delta);
        g.ricochetTimer = Math.max(0, g.ricochetTimer - delta);
        g.deadEyeTimer = Math.max(0, g.deadEyeTimer - delta);
        g.soulDrainTimer = Math.max(0, g.soulDrainTimer - delta);
        if (g.regenBurstTimer <= 0) g.regenBurstRate = 0;
        if (g.overdriveTimer <= 0) g.overdriveMultiplier = 1;
        if (g.fanHammerTimer <= 0) g.fanHammerMultiplier = 1;
        if (g.ricochetTimer <= 0) g.ricochetActive = false;
        if (g.deadEyeTimer <= 0) g.deadEyeActive = false;
        if (g.soulDrainTimer <= 0) g.soulDrainActive = false;
        if (g.regenBurstRate > 0) s.heal(g.regenBurstRate * delta);
        // Ability cooldowns
        for (const as of g.abilityStates) {
            if (as.cooldownRemaining > 0) { as.cooldownRemaining = Math.max(0, as.cooldownRemaining - delta); if (as.cooldownRemaining <= 0) as.active = false; }
        }
        onAbilityStatesChange?.([...g.abilityStates]);

        // Movement
        const keys = keysRef.current;
        const kb = keybindsRef.current;
        const mob = mobileRef.current;
        let dx = mob?.dx ?? 0, dy = mob?.dy ?? 0;
        if (keys.has(kb.up)) dy -= 1;
        if (keys.has(kb.down)) dy += 1;
        if (keys.has(kb.left)) dx -= 1;
        if (keys.has(kb.right)) dx += 1;
        g.moveDir = { dx, dy };
        const effectiveSpeed = stats.moveSpeed * (g.speedBoostTimer > 0 ? 1.5 : 1);
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dx !== 0 || dy !== 0) {
            let nx = g.player.x + (dx / len) * effectiveSpeed * delta;
            let ny = g.player.y + (dy / len) * effectiveSpeed * delta;
            for (const obs of obstacles) { if (circleVsRect(nx, ny, 14, obs.x, obs.y, obs.w, obs.h)) { const r = resolveCircleRect(nx, ny, 14, obs.x, obs.y, obs.w, obs.h); nx += r.nx; ny += r.ny; } }
            g.player.x = Math.max(60, Math.min(WORLD_W - 60, nx));
            g.player.y = Math.max(60, Math.min(WORLD_H - 60, ny));
        }

        // Camera
        g.camX = Math.max(0, Math.min(WORLD_W - w, g.player.x - w / 2));
        g.camY = Math.max(0, Math.min(WORLD_H - h, g.player.y - h / 2));

        // Pickups
        for (const pickup of pickups) {
            if (pickup.collected) continue;
            const pdx = g.player.x - pickup.x, pdy = g.player.y - pickup.y;
            if (Math.sqrt(pdx * pdx + pdy * pdy) < 24) {
                pickup.collected = true; spawnParticles(pickup.x, pickup.y, pickupColor(pickup.type), 10);
                if (pickup.type === 'health') s.heal(40);
                else if (pickup.type === 'xp_boost') s.addXP(30);
                else if (pickup.type === 'shield') g.shieldTimer = 5;
                else if (pickup.type === 'speed') g.speedBoostTimer = 6;
            }
        }

        // Auto-fire
        g.fireTimer -= delta;
        const effectiveFireRate = stats.fireRate * g.overdriveMultiplier * g.fanHammerMultiplier;
        if (g.fireTimer <= 0 && g.enemies.length > 0) {
            fireBullet(stats, g.ricochetActive, g.deadEyeActive, g.deathMarkShots > 0 ? g.deathMarkMult : 1);
            if (g.deathMarkShots > 0) g.deathMarkShots--;
            g.fireTimer = 1 / effectiveFireRate;
        }

        // Spawn enemies
        g.spawnTimer -= delta;
        if (g.spawnTimer <= 0) {
            const diff = getDifficulty(s.wave);
            if (diff.bossWave && !g.enemies.some(e => e.type === 'boss')) spawnEnemy(s.wave, 'boss');
            for (let i = 0; i < diff.spawnCount; i++) spawnEnemy(s.wave, Math.random() < diff.eliteChance ? 'elite' : 'basic');
            g.spawnTimer = getDifficulty(s.wave).spawnInterval;
        }

        // Update bullets
        g.bullets = g.bullets.filter(b => {
            const sx = b.vx * delta, sy = b.vy * delta;
            b.x += sx; b.y += sy; b.distanceTraveled += Math.sqrt(sx * sx + sy * sy);
            if (stats.bulletRange > 0 && b.distanceTraveled > stats.bulletRange) return false;
            if (b.x < 0 || b.x > WORLD_W || b.y < 0 || b.y > WORLD_H) return false;
            for (const obs of obstacles) { if (circleVsRect(b.x, b.y, 4, obs.x, obs.y, obs.w, obs.h)) { spawnParticles(b.x, b.y, '#aaaaff', 3); return false; } }
            if (b.isEnemy) {
                const pdx = b.x - g.player.x, pdy = b.y - g.player.y;
                if (Math.sqrt(pdx * pdx + pdy * pdy) < 14 && g.shieldTimer <= 0) { spawnParticles(b.x, b.y, '#ff3300', 4); s.takeDamage(b.damage); return false; }
                return true;
            }
            for (const e of g.enemies) {
                if (b.hitEnemyIds.has(e.id)) continue;
                const dx = b.x - e.x, dy = b.y - e.y;
                if (Math.sqrt(dx * dx + dy * dy) < e.radius + 5) {
                    e.hp -= b.damage; e.flashTimer = 0.1; b.hitEnemyIds.add(e.id);
                    spawnParticles(b.x, b.y, b.isCrit ? '#ffff00' : '#ff8800', b.isCrit ? 10 : 5);
                    if (b.aoeRadius > 0) for (const e2 of g.enemies) { if (e2.id === e.id) continue; const dx2 = b.x - e2.x, dy2 = b.y - e2.y; if (Math.sqrt(dx2 * dx2 + dy2 * dy2) < b.aoeRadius) { e2.hp -= b.damage * 0.5; e2.flashTimer = 0.1; } }
                    if (b.pierceLeft <= 0) return false;
                    b.pierceLeft--;
                }
            }
            return true;
        });

        // Update enemies
        const dead: Enemy[] = [];
        g.enemies = g.enemies.filter(e => {
            if (e.hp <= 0) { dead.push(e); return false; }
            const diff = getDifficulty(s.wave);
            const dx = g.player.x - e.x, dy = g.player.y - e.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
            if (e.type === 'boss') {
                e.dashTimer -= delta;
                if (e.dashTimer <= 0) { e.dashVx = (dx / dist) * 350; e.dashVy = (dy / dist) * 350; e.dashTimer = 3 + Math.random() * 2; }
                e.x += e.dashVx * delta * 0.3; e.y += e.dashVy * delta * 0.3; e.dashVx *= 0.92; e.dashVy *= 0.92;
            }
            if (e.type === 'elite') {
                e.dashTimer -= delta;
                if (e.dashTimer <= 0 && dist < 300) { e.dashVx = (dx / dist) * 280; e.dashVy = (dy / dist) * 280; e.dashTimer = 2 + Math.random(); }
                e.x += e.dashVx * delta; e.y += e.dashVy * delta; e.dashVx *= 0.85; e.dashVy *= 0.85;
            }
            let steerDx: number, steerDy: number;
            if (e.type === 'basic') { const st = steerToward(e.x, e.y, g.player.x, g.player.y, e.nav, delta); steerDx = st.dx; steerDy = st.dy; }
            else { steerDx = dx / dist; steerDy = dy / dist; }
            let nx = e.x + steerDx * e.speed * delta, ny = e.y + steerDy * e.speed * delta;
            for (const obs of obstacles) { if (circleVsRect(nx, ny, e.radius, obs.x, obs.y, obs.w, obs.h)) { const r = resolveCircleRect(nx, ny, e.radius, obs.x, obs.y, obs.w, obs.h); nx += r.nx; ny += r.ny; } }
            if (e.type !== 'boss' && e.type !== 'elite') { e.x = nx; e.y = ny; }
            if (e.type === 'elite' || e.type === 'boss') {
                e.shootTimer -= delta;
                const si = e.type === 'boss' ? 0.8 : 1.8;
                if (e.shootTimer <= 0 && dist < 500) {
                    e.shootTimer = si;
                    const bc = e.type === 'boss' ? 8 : 1;
                    for (let i = 0; i < bc; i++) {
                        const a = e.type === 'boss' ? (i / bc) * Math.PI * 2 : Math.atan2(g.player.y - e.y, g.player.x - e.x);
                        const spd = e.type === 'boss' ? 200 : 250;
                        g.bullets.push({ id: uid(), x: e.x, y: e.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, damage: e.type === 'boss' ? diff.bossDamage : diff.eliteDamage, pierceLeft: 99, chainLeft: 0, isCrit: false, hitEnemyIds: new Set(), aoeRadius: 0, distanceTraveled: 0, isEnemy: true });
                    }
                }
            }
            e.flashTimer = Math.max(0, e.flashTimer - delta);
            if (dist < e.radius + 14 && g.shieldTimer <= 0) {
                const dmg = e.type === 'boss' ? diff.bossDamage : e.type === 'elite' ? diff.eliteDamage : diff.basicDamage;
                s.takeDamage(dmg * delta);
            }
            return true;
        });
        for (const e of dead) {
            spawnParticles(e.x, e.y, e.color, e.type === 'boss' ? 30 : e.type === 'elite' ? 18 : 12);
            g.xpOrbs.push({ id: uid(), x: e.x, y: e.y, value: e.type === 'boss' ? 30 : e.type === 'elite' ? 8 : e.xpValue, radius: 6 });
            if (g.soulDrainActive) s.heal(g.soulDrainHeal);
            s.addKill();
        }

        // XP orbs
        g.xpOrbs = g.xpOrbs.filter(orb => {
            const dx = g.player.x - orb.x, dy = g.player.y - orb.y, dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < stats.xpMagnetRadius) { orb.x += (dx / dist) * 200 * delta; orb.y += (dy / dist) * 200 * delta; }
            if (dist < 16) { s.addXP(orb.value); return false; }
            return true;
        });

        // Particles
        g.particles = g.particles.filter(p => { p.x += p.vx * delta; p.y += p.vy * delta; p.vx *= 0.9; p.vy *= 0.9; p.life -= delta; return p.life > 0; });

        // ── RENDER ────────────────────────────────────────────────────────────
        ctx.clearRect(0, 0, w, h);
        if (mapCanvasRef.current) ctx.drawImage(mapCanvasRef.current, -g.camX, -g.camY);
        const wx = (x: number) => x - g.camX, wy = (y: number) => y - g.camY;

        // Pickups
        for (const pickup of pickups) {
            if (pickup.collected) continue;
            const px = wx(pickup.x), py = wy(pickup.y);
            if (px < -40 || px > w + 40 || py < -40 || py > h + 40) continue;
            const col = pickupColor(pickup.type), pulse = 0.7 + 0.3 * Math.sin(timestamp * 0.004);
            ctx.beginPath(); ctx.arc(px, py, 12 * pulse, 0, Math.PI * 2); ctx.fillStyle = col + '44'; ctx.fill();
            ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.fill(); ctx.shadowBlur = 0;
            ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(pickupIcon(pickup.type), px, py);
        }
        // XP orbs
        for (const orb of g.xpOrbs) {
            const ox = wx(orb.x), oy = wy(orb.y);
            if (ox < -20 || ox > w + 20 || oy < -20 || oy > h + 20) continue;
            ctx.beginPath(); ctx.arc(ox, oy, orb.radius, 0, Math.PI * 2); ctx.fillStyle = '#aa44ff'; ctx.shadowColor = '#cc88ff'; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0;
        }
        // Enemies
        for (const e of g.enemies) {
            const ex = wx(e.x), ey = wy(e.y);
            if (ex < -50 || ex > w + 50 || ey < -50 || ey > h + 50) continue;
            ctx.beginPath(); ctx.arc(ex, ey, e.radius, 0, Math.PI * 2);
            ctx.fillStyle = e.flashTimer > 0 ? '#ffffff' : e.color; ctx.shadowColor = e.color; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;
            if (e.hp < e.maxHp) { const bw = e.radius * 2; ctx.fillStyle = '#333'; ctx.fillRect(ex - e.radius, ey - e.radius - 8, bw, 4); ctx.fillStyle = '#ff4444'; ctx.fillRect(ex - e.radius, ey - e.radius - 8, bw * (e.hp / e.maxHp), 4); }
        }
        // Bullets
        for (const b of g.bullets) {
            const bx = wx(b.x), by = wy(b.y);
            if (bx < -20 || bx > w + 20 || by < -20 || by > h + 20) continue;
            if (b.isEnemy) { ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.fillStyle = '#ff3300'; ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0; }
            else { ctx.beginPath(); ctx.arc(bx, by, b.isCrit ? 6 : 4, 0, Math.PI * 2); ctx.fillStyle = b.isCrit ? '#ffff00' : '#ffcc00'; ctx.shadowColor = b.isCrit ? '#ffff00' : '#ff8800'; ctx.shadowBlur = b.isCrit ? 16 : 8; ctx.fill(); ctx.shadowBlur = 0; }
        }
        // Particles
        for (const p of g.particles) {
            const alpha = p.life / p.maxLife, ppx = wx(p.x), ppy = wy(p.y);
            ctx.beginPath(); ctx.arc(ppx, ppy, p.radius * alpha, 0, Math.PI * 2);
            ctx.fillStyle = p.color + Math.floor(alpha * 255).toString(16).padStart(2, '0'); ctx.fill();
        }
        // Player
        const ppx = wx(g.player.x), ppy = wy(g.player.y);
        const cls = s.selectedClass;
        const playerColor = cls?.color ?? '#44aaff';
        if (g.shieldTimer > 0) { ctx.beginPath(); ctx.arc(ppx, ppy, 22, 0, Math.PI * 2); ctx.strokeStyle = `rgba(0,200,255,${Math.min(1, g.shieldTimer)})`; ctx.lineWidth = 3; ctx.shadowColor = '#00ccff'; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0; }
        if (g.speedBoostTimer > 0) { ctx.beginPath(); ctx.arc(ppx, ppy, 18, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,200,0,0.5)'; ctx.lineWidth = 2; ctx.stroke(); }
        if (g.deathMarkShots > 0) { ctx.beginPath(); ctx.arc(ppx, ppy, 20, 0, Math.PI * 2); ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]); }
        const grad = ctx.createRadialGradient(ppx, ppy, 0, ppx, ppy, 24);
        grad.addColorStop(0, playerColor + '55'); grad.addColorStop(1, playerColor + '00');
        ctx.beginPath(); ctx.arc(ppx, ppy, 24, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
        ctx.beginPath(); ctx.arc(ppx, ppy, 14, 0, Math.PI * 2); ctx.fillStyle = playerColor; ctx.shadowColor = playerColor; ctx.shadowBlur = 20; ctx.fill(); ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(ppx, ppy, 7, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
        // Class icon
        if (cls) { ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(cls.icon, ppx, ppy); }

        drawMinimap(ctx, g, w, h, pickups, obstacles);
        requestAnimationFrame(gameLoop);
    }, [fireBullet, spawnEnemy, spawnParticles, onAbilityStatesChange]);

    // ── Start / stop ──────────────────────────────────────────────────────────
    const prevPhaseRef = useRef('');
    useEffect(() => {
        const g = gameRef.current;
        const s = storeRef.current;
        const prev = prevPhaseRef.current;
        prevPhaseRef.current = s.phase;
        if (s.phase === 'playing' && (prev === 'menu' || prev === 'dead' || prev === '' || prev === 'class_select')) {
            obstaclesRef.current = generateObstacles();
            pickupsRef.current = generatePickups();
            mapCanvasRef.current = renderMapToOffscreen(obstaclesRef.current);
            buildGrid(WORLD_W, WORLD_H, obstaclesRef.current);
            g.player = { x: WORLD_W / 2, y: WORLD_H / 2 };
            g.enemies = []; g.bullets = []; g.xpOrbs = []; g.particles = [];
            g.spawnTimer = 0; g.fireTimer = 0; g.shieldTimer = 0; g.speedBoostTimer = 0;
            g.abilityStates = makeAbilityStates();
            g.deathMarkShots = 0; g.soulDrainActive = false; g.regenBurstRate = 0;
            g.overdriveMultiplier = 1; g.fanHammerMultiplier = 1; g.ricochetActive = false; g.deadEyeActive = false;
            g.running = true; g.lastTime = performance.now();
            requestAnimationFrame(gameLoop);
        } else if (s.phase === 'playing' && prev === 'upgrading') {
            if (!g.running) { g.running = true; g.lastTime = performance.now(); requestAnimationFrame(gameLoop); }
        } else if (s.phase === 'dead') {
            g.running = false;
        }
    }, [store.phase, gameLoop]);

    // ── Keyboard ──────────────────────────────────────────────────────────────
    useEffect(() => {
        const onDown = (e: KeyboardEvent) => {
            keysRef.current.add(e.code);
            const kb = keybindsRef.current;
            const s = storeRef.current;
            if (s.phase !== 'playing') return;
            if (e.code === kb.ability0) activateAbility(0);
            if (e.code === kb.ability1) activateAbility(1);
            if (e.code === kb.ability2) activateAbility(2);
        };
        const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
        window.addEventListener('keydown', onDown);
        window.addEventListener('keyup', onUp);
        return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
    }, [activateAbility]);

    // ── Mobile ability trigger ────────────────────────────────────────────────
    useEffect(() => {
        if (abilityTrigger !== null && abilityTrigger !== undefined) {
            activateAbility(abilityTrigger);
        }
    }, [abilityTrigger, activateAbility]);

    return (
        <canvas ref={canvasRef} width={canvasSize.w} height={canvasSize.h} style={{ display: 'block', width: '100%', height: '100%' }} />
    );
}
