/**
 * RMH Farming Simulator — Authoritative game handler for the unified socket
 * server.
 *
 * Each authenticated user owns exactly one persistent farm (a "homestead"),
 * keyed by their userId and reachable by a short join code. Players can visit
 * other farms co-operatively: visiting requires a join request that the host
 * approves, and the host can kick anyone at any time. While inside a farm,
 * every player shares that farm's wallet, inventory and land — all economic
 * actions (till / plant / water / harvest / buy / sell / upgrade / sleep) are
 * validated and applied server-side so competitive/co-op play can't be forged.
 *
 * State lives in memory for the lifetime of the process (same model as the
 * other realtime games here). The client persists its own "previously joined
 * farms" list in localStorage; the server is the source of truth for the live
 * world and the game catalog, which it ships to clients on join.
 */

import type { Server, Socket } from 'socket.io';
import { generateRoomCode } from '../utils';

// ── Event constants ────────────────────────────────────────────────
const C2S = {
    HELLO: 'rfs:hello',
    MOVE: 'rfs:move',
    TILL: 'rfs:till',
    PLANT: 'rfs:plant',
    WATER: 'rfs:water',
    HARVEST: 'rfs:harvest',
    CLEAR: 'rfs:clear',
    BUY: 'rfs:buy',
    SELL: 'rfs:sell',
    UPGRADE_TOOL: 'rfs:upgrade_tool',
    SLEEP: 'rfs:sleep',
    CHAT: 'rfs:chat',
    JOIN_FARM: 'rfs:join_farm',
    APPROVE_JOIN: 'rfs:approve_join',
    DENY_JOIN: 'rfs:deny_join',
    KICK: 'rfs:kick',
    LEAVE_FARM: 'rfs:leave_farm',
    RENAME_FARM: 'rfs:rename_farm',
} as const;

const S2C = {
    WELCOME: 'rfs:welcome',         // catalog + your identity
    FARM_STATE: 'rfs:farm_state',   // full snapshot of the farm you're in
    TILES: 'rfs:tiles',             // tile deltas
    STATS: 'rfs:stats',             // money / day / season / weather / energy
    PRESENCE: 'rfs:presence',       // player positions in current farm
    MEMBERS: 'rfs:members',         // member + join-request lists
    JOIN_REQUESTED: 'rfs:join_requested', // host notified of a request
    KICKED: 'rfs:kicked',           // you were kicked / farm closed
    CHAT: 'rfs:chat',
    TOAST: 'rfs:toast',             // transient notice for the actor
    ERROR: 'rfs:error',
} as const;

// ── World constants ────────────────────────────────────────────────
const GRID = 24;
const TILE_COUNT = GRID * GRID;
const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;
const DAYS_PER_SEASON = 7;
const STARTING_MONEY = 500;
const MAX_ENERGY = 100;
const ENERGY_COST = 2;            // per till / plant / water / harvest
const ACTION_RANGE = 4;           // tiles a player may reach from their position
const SHIPPING_RATE = 1.0;        // shop pays full price (shipping bin model)
const CHAT_MAX = 160;

type Season = (typeof SEASONS)[number];

// ── Catalog: crops ─────────────────────────────────────────────────
interface CropDef {
    id: string;
    name: string;
    seedPrice: number;
    sellPrice: number;
    growthDays: number;          // waterings needed to mature
    seasons: Season[];
    color: string;               // hex, for the pixel-3D plant
    regrowDays?: number;         // if set, re-fruits this many days after harvest
}

const CROPS: CropDef[] = [
    { id: 'parsnip', name: 'Parsnip', seedPrice: 20, sellPrice: 35, growthDays: 3, seasons: ['spring'], color: '#e8d39a' },
    { id: 'potato', name: 'Potato', seedPrice: 25, sellPrice: 40, growthDays: 4, seasons: ['spring'], color: '#c9a26b' },
    { id: 'cauliflower', name: 'Cauliflower', seedPrice: 40, sellPrice: 95, growthDays: 5, seasons: ['spring'], color: '#f3f0e0' },
    { id: 'strawberry', name: 'Strawberry', seedPrice: 60, sellPrice: 60, growthDays: 4, seasons: ['spring'], color: '#e8485f', regrowDays: 2 },
    { id: 'tomato', name: 'Tomato', seedPrice: 30, sellPrice: 60, growthDays: 4, seasons: ['summer'], color: '#e0452f', regrowDays: 2 },
    { id: 'blueberry', name: 'Blueberry', seedPrice: 40, sellPrice: 55, growthDays: 5, seasons: ['summer'], color: '#4763c9', regrowDays: 3 },
    { id: 'melon', name: 'Melon', seedPrice: 50, sellPrice: 150, growthDays: 6, seasons: ['summer'], color: '#7cc46b' },
    { id: 'corn', name: 'Corn', seedPrice: 75, sellPrice: 55, growthDays: 6, seasons: ['summer', 'fall'], color: '#f2cd4d', regrowDays: 2 },
    { id: 'pumpkin', name: 'Pumpkin', seedPrice: 50, sellPrice: 170, growthDays: 6, seasons: ['fall'], color: '#e08a2f' },
    { id: 'cranberry', name: 'Cranberry', seedPrice: 120, sellPrice: 80, growthDays: 5, seasons: ['fall'], color: '#b02038', regrowDays: 3 },
    { id: 'wheat', name: 'Wheat', seedPrice: 10, sellPrice: 22, growthDays: 3, seasons: ['summer', 'fall'], color: '#d9c179' },
];
const CROP_BY_ID = new Map(CROPS.map((c) => [c.id, c]));

// ── Catalog: tools ─────────────────────────────────────────────────
type ToolId = 'hoe' | 'can' | 'scythe';
interface ToolUpgrade { level: number; cost: number; radius: number; label: string; }
const TOOL_DEFS: Record<ToolId, { name: string; upgrades: ToolUpgrade[] }> = {
    hoe: {
        name: 'Hoe',
        upgrades: [
            { level: 1, cost: 0, radius: 0, label: 'Basic' },
            { level: 2, cost: 800, radius: 1, label: 'Copper' },
            { level: 3, cost: 2000, radius: 2, label: 'Iron' },
            { level: 4, cost: 5000, radius: 3, label: 'Gold' },
        ],
    },
    can: {
        name: 'Watering Can',
        upgrades: [
            { level: 1, cost: 0, radius: 0, label: 'Basic' },
            { level: 2, cost: 700, radius: 1, label: 'Copper' },
            { level: 3, cost: 1800, radius: 2, label: 'Iron' },
            { level: 4, cost: 4500, radius: 3, label: 'Gold' },
        ],
    },
    scythe: {
        name: 'Scythe',
        upgrades: [
            { level: 1, cost: 0, radius: 0, label: 'Basic' },
            { level: 2, cost: 600, radius: 1, label: 'Steel' },
            { level: 3, cost: 1600, radius: 2, label: 'Iridium' },
            { level: 4, cost: 4000, radius: 3, label: 'Mythic' },
        ],
    },
};

// ── Tile + farm model ──────────────────────────────────────────────
type Terrain = 0 | 1; // 0 grass, 1 tilled
interface CropInstance {
    cropId: string;
    stage: number;      // 0..growthDays (growthDays = mature)
    watered: boolean;
    wateredCount: number;
    regrowTimer: number; // counts down after a regrow harvest; 0 = bearing
}
interface Tile { terrain: Terrain; crop: CropInstance | null; }

interface MemberRec { userId: string; name: string; }
interface PresenceRec { userId: string; socketId: string; name: string; x: number; z: number; dir: number; energy: number; }

interface Farm {
    id: string;          // = owner userId
    code: string;
    name: string;
    ownerUserId: string;
    ownerName: string;
    tiles: Tile[];
    money: number;
    day: number;         // 1-based, total days elapsed
    seasonIndex: number;
    weather: 'sunny' | 'rain';
    inventory: Record<string, number>; // itemId -> qty (seeds keyed `seed:<crop>`, produce keyed crop id)
    seeds: Record<string, number>;     // crop id -> seed packets owned
    tools: Record<ToolId, number>;     // tool -> level
    members: MemberRec[];              // allowed users (owner first)
    joinRequests: MemberRec[];
    presence: Map<string, PresenceRec>; // userId -> presence (currently inside)
    shippedValue: number;              // lifetime earnings (leaderboard-ish)
}

// ── Indices ────────────────────────────────────────────────────────
const farms = new Map<string, Farm>();       // farmId -> Farm
const codeToFarm = new Map<string, string>(); // code -> farmId
const socketState = new Map<string, { userId: string; name: string; farmId: string }>();
let ioRef: Server;

// ── Helpers ────────────────────────────────────────────────────────
function idx(x: number, z: number): number { return z * GRID + x; }
function inBounds(x: number, z: number): boolean { return x >= 0 && z >= 0 && x < GRID && z < GRID; }
function uniqueCode(): string {
    for (let i = 0; i < 40; i++) {
        const c = generateRoomCode();
        if (!codeToFarm.has(c)) return c;
    }
    throw new Error('no unique farm code');
}

function freshTiles(): Tile[] {
    const tiles: Tile[] = new Array(TILE_COUNT);
    for (let i = 0; i < TILE_COUNT; i++) tiles[i] = { terrain: 0, crop: null };
    return tiles;
}

function ensureFarm(userId: string, userName: string): Farm {
    let farm = farms.get(userId);
    if (farm) return farm;
    const code = uniqueCode();
    farm = {
        id: userId,
        code,
        name: `${userName}'s Farm`,
        ownerUserId: userId,
        ownerName: userName,
        tiles: freshTiles(),
        money: STARTING_MONEY,
        day: 1,
        seasonIndex: 0,
        weather: 'sunny',
        inventory: {},
        seeds: { parsnip: 5, potato: 3 },
        tools: { hoe: 1, can: 1, scythe: 1 },
        members: [{ userId, name: userName }],
        joinRequests: [],
        presence: new Map(),
        shippedValue: 0,
    };
    farms.set(userId, farm);
    codeToFarm.set(code, userId);
    return farm;
}

function isMember(farm: Farm, userId: string): boolean {
    return farm.members.some((m) => m.userId === userId);
}
function isHost(farm: Farm, userId: string): boolean {
    return farm.ownerUserId === userId;
}
function toolRadius(farm: Farm, tool: ToolId): number {
    const lvl = farm.tools[tool] ?? 1;
    return TOOL_DEFS[tool].upgrades[lvl - 1]?.radius ?? 0;
}
function season(farm: Farm): Season { return SEASONS[farm.seasonIndex]; }

function socketsInFarm(farm: Farm): Socket[] {
    const out: Socket[] = [];
    for (const p of farm.presence.values()) {
        const s = ioRef.sockets.sockets.get(p.socketId);
        if (s) out.push(s);
    }
    return out;
}

function toast(socket: Socket, message: string, kind: 'info' | 'success' | 'error' = 'info'): void {
    socket.emit(S2C.TOAST, { message, kind });
}
function err(socket: Socket, message: string): void {
    socket.emit(S2C.ERROR, { message });
}

// ── Serialization ──────────────────────────────────────────────────
function serializeTile(t: Tile) {
    if (!t.crop) return { t: t.terrain, c: null };
    const def = CROP_BY_ID.get(t.crop.cropId)!;
    return {
        t: t.terrain,
        c: {
            id: t.crop.cropId,
            stage: t.crop.stage,
            max: def.growthDays,
            watered: t.crop.watered,
            ready: t.crop.stage >= def.growthDays && t.crop.regrowTimer === 0,
            regrow: t.crop.regrowTimer,
        },
    };
}

function serializeStats(farm: Farm, p?: PresenceRec) {
    return {
        money: farm.money,
        day: farm.day,
        season: season(farm),
        dayOfSeason: ((farm.day - 1) % DAYS_PER_SEASON) + 1,
        daysPerSeason: DAYS_PER_SEASON,
        weather: farm.weather,
        shippedValue: farm.shippedValue,
        energy: p?.energy ?? MAX_ENERGY,
    };
}

function serializeMembers(farm: Farm) {
    return {
        ownerUserId: farm.ownerUserId,
        members: farm.members.map((m) => ({
            userId: m.userId,
            name: m.name,
            online: farm.presence.has(m.userId),
            isHost: m.userId === farm.ownerUserId,
        })),
        joinRequests: farm.joinRequests.map((r) => ({ userId: r.userId, name: r.name })),
    };
}

function serializePresence(farm: Farm) {
    return Array.from(farm.presence.values()).map((p) => ({
        userId: p.userId, name: p.name, x: p.x, z: p.z, dir: p.dir,
    }));
}

function fullFarmState(farm: Farm) {
    return {
        id: farm.id,
        code: farm.code,
        name: farm.name,
        grid: GRID,
        tiles: farm.tiles.map(serializeTile),
        seeds: farm.seeds,
        inventory: farm.inventory,
        tools: farm.tools,
    };
}

// ── Broadcast helpers ──────────────────────────────────────────────
function broadcastStats(farm: Farm): void {
    for (const p of farm.presence.values()) {
        ioRef.sockets.sockets.get(p.socketId)?.emit(S2C.STATS, serializeStats(farm, p));
    }
}
function broadcastMembers(farm: Farm): void {
    const payload = serializeMembers(farm);
    for (const s of socketsInFarm(farm)) s.emit(S2C.MEMBERS, payload);
}
function broadcastPresence(farm: Farm): void {
    const payload = serializePresence(farm);
    for (const s of socketsInFarm(farm)) s.emit(S2C.PRESENCE, payload);
}
function broadcastTiles(farm: Farm, indices: number[]): void {
    if (indices.length === 0) return;
    const deltas = indices.map((i) => ({ i, ...serializeTile(farm.tiles[i]) }));
    for (const s of socketsInFarm(farm)) s.emit(S2C.TILES, deltas);
}
function broadcastFarmInventory(farm: Farm): void {
    // seeds / inventory / tools changed → push fresh state header to everyone
    for (const s of socketsInFarm(farm)) {
        s.emit(S2C.FARM_STATE, fullFarmState(farm));
    }
}

// ── Joining / leaving a farm ───────────────────────────────────────
function placeInFarm(socket: Socket, farm: Farm, userId: string, name: string): void {
    const st = socketState.get(socket.id);
    if (st) st.farmId = farm.id;

    const spawn = { x: GRID / 2, z: GRID / 2, dir: 0 };
    farm.presence.set(userId, { userId, socketId: socket.id, name, ...spawn, energy: MAX_ENERGY });

    socket.emit(S2C.FARM_STATE, fullFarmState(farm));
    socket.emit(S2C.STATS, serializeStats(farm, farm.presence.get(userId)));
    broadcastMembers(farm);
    broadcastPresence(farm);
}

function removeFromCurrentFarm(socket: Socket, opts: { notifyKick?: boolean } = {}): Farm | null {
    const st = socketState.get(socket.id);
    if (!st) return null;
    const farm = farms.get(st.farmId);
    if (!farm) return null;
    if (farm.presence.get(st.userId)?.socketId === socket.id) {
        farm.presence.delete(st.userId);
    }
    broadcastPresence(farm);
    broadcastMembers(farm);
    if (opts.notifyKick) socket.emit(S2C.KICKED, { reason: 'kicked' });
    return farm;
}

// ── Handlers ───────────────────────────────────────────────────────
function onHello(socket: Socket): void {
    const userId = socket.data.userId as string | undefined;
    const name = (socket.data.userName as string) || 'Farmer';
    if (!userId) {
        err(socket, 'Please sign in to play RMH Farming Simulator.');
        return;
    }
    const farm = ensureFarm(userId, name);
    // keep displayed owner name fresh
    if (farm.ownerUserId === userId && farm.ownerName !== name) {
        farm.ownerName = name;
    }
    socketState.set(socket.id, { userId, name, farmId: farm.id });

    socket.emit(S2C.WELCOME, {
        userId,
        name,
        crops: CROPS,
        tools: TOOL_DEFS,
        ownFarmCode: farm.code,
        seasons: SEASONS,
        daysPerSeason: DAYS_PER_SEASON,
        grid: GRID,
        maxEnergy: MAX_ENERGY,
        actionRange: ACTION_RANGE,
    });
    placeInFarm(socket, farm, userId, name);
}

function currentFarm(socket: Socket): { farm: Farm; userId: string; name: string; p: PresenceRec } | null {
    const st = socketState.get(socket.id);
    if (!st) return null;
    const farm = farms.get(st.farmId);
    if (!farm) return null;
    const p = farm.presence.get(st.userId);
    if (!p || p.socketId !== socket.id) return null;
    return { farm, userId: st.userId, name: st.name, p };
}

function withinRange(p: PresenceRec, x: number, z: number): boolean {
    return Math.abs(p.x - (x + 0.5)) <= ACTION_RANGE && Math.abs(p.z - (z + 0.5)) <= ACTION_RANGE;
}

function spendEnergy(farm: Farm, p: PresenceRec, socket: Socket, cost: number): boolean {
    if (p.energy < cost) {
        toast(socket, 'Too exhausted — sleep to restore energy.', 'error');
        return false;
    }
    p.energy -= cost;
    socket.emit(S2C.STATS, serializeStats(farm, p));
    return true;
}

function areaTiles(cx: number, cz: number, radius: number): number[] {
    const out: number[] = [];
    for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
            const x = cx + dx, z = cz + dz;
            if (inBounds(x, z)) out.push(idx(x, z));
        }
    }
    return out;
}

function onMove(socket: Socket, payload: any): void {
    const ctx = currentFarm(socket);
    if (!ctx) return;
    const { p } = ctx;
    const x = Number(payload?.x), z = Number(payload?.z), dir = Number(payload?.dir);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    p.x = Math.max(0, Math.min(GRID, x));
    p.z = Math.max(0, Math.min(GRID, z));
    if (Number.isFinite(dir)) p.dir = dir;
    // presence is broadcast on a timer (see startPresenceLoop) to keep it cheap
}

function onTill(socket: Socket, payload: any): void {
    const ctx = currentFarm(socket);
    if (!ctx) return;
    const { farm, p } = ctx;
    const tx = Number(payload?.x), tz = Number(payload?.z);
    if (!inBounds(tx, tz) || !withinRange(p, tx, tz)) return;
    if (!spendEnergy(farm, p, socket, ENERGY_COST)) return;

    const radius = toolRadius(farm, 'hoe');
    const changed: number[] = [];
    for (const i of areaTiles(tx, tz, radius)) {
        const t = farm.tiles[i];
        if (t.terrain === 0 && !t.crop) { t.terrain = 1; changed.push(i); }
    }
    broadcastTiles(farm, changed);
}

function onClear(socket: Socket, payload: any): void {
    // revert tilled soil back to grass (also removes an unwanted crop)
    const ctx = currentFarm(socket);
    if (!ctx) return;
    const { farm, p } = ctx;
    const tx = Number(payload?.x), tz = Number(payload?.z);
    if (!inBounds(tx, tz) || !withinRange(p, tx, tz)) return;
    const t = farm.tiles[idx(tx, tz)];
    if (t.terrain === 1 || t.crop) {
        t.terrain = 0;
        t.crop = null;
        broadcastTiles(farm, [idx(tx, tz)]);
    }
}

function onPlant(socket: Socket, payload: any): void {
    const ctx = currentFarm(socket);
    if (!ctx) return;
    const { farm, p } = ctx;
    const tx = Number(payload?.x), tz = Number(payload?.z);
    const cropId = String(payload?.cropId || '');
    const def = CROP_BY_ID.get(cropId);
    if (!def || !inBounds(tx, tz) || !withinRange(p, tx, tz)) return;
    const t = farm.tiles[idx(tx, tz)];
    if (t.terrain !== 1) { toast(socket, 'Till the soil first.', 'error'); return; }
    if (t.crop) { toast(socket, 'Something is already planted here.', 'error'); return; }
    if (!def.seasons.includes(season(farm))) {
        toast(socket, `${def.name} can't grow in ${season(farm)}.`, 'error');
        return;
    }
    if ((farm.seeds[cropId] ?? 0) <= 0) { toast(socket, `No ${def.name} seeds.`, 'error'); return; }
    if (!spendEnergy(farm, p, socket, ENERGY_COST)) return;

    farm.seeds[cropId] -= 1;
    t.crop = { cropId, stage: 0, watered: false, wateredCount: 0, regrowTimer: 0 };
    broadcastTiles(farm, [idx(tx, tz)]);
    broadcastFarmInventory(farm);
}

function onWater(socket: Socket, payload: any): void {
    const ctx = currentFarm(socket);
    if (!ctx) return;
    const { farm, p } = ctx;
    const tx = Number(payload?.x), tz = Number(payload?.z);
    if (!inBounds(tx, tz) || !withinRange(p, tx, tz)) return;
    if (!spendEnergy(farm, p, socket, ENERGY_COST)) return;

    const radius = toolRadius(farm, 'can');
    const changed: number[] = [];
    for (const i of areaTiles(tx, tz, radius)) {
        const t = farm.tiles[i];
        if (t.crop && !t.crop.watered) { t.crop.watered = true; changed.push(i); }
    }
    broadcastTiles(farm, changed);
}

function qualityMultiplier(crop: CropInstance, def: CropDef): { mult: number; label: string } {
    const ratio = def.growthDays > 0 ? crop.wateredCount / def.growthDays : 1;
    if (ratio >= 0.9) return { mult: 2, label: 'Gold' };
    if (ratio >= 0.6) return { mult: 1.5, label: 'Silver' };
    return { mult: 1, label: 'Normal' };
}

function onHarvest(socket: Socket, payload: any): void {
    const ctx = currentFarm(socket);
    if (!ctx) return;
    const { farm, p } = ctx;
    const tx = Number(payload?.x), tz = Number(payload?.z);
    if (!inBounds(tx, tz) || !withinRange(p, tx, tz)) return;

    const radius = toolRadius(farm, 'scythe');
    const changed: number[] = [];
    let harvested = 0;
    let exhausted = false;
    for (const i of areaTiles(tx, tz, radius)) {
        const t = farm.tiles[i];
        const crop = t.crop;
        if (!crop) continue;
        const def = CROP_BY_ID.get(crop.cropId)!;
        const ready = crop.stage >= def.growthDays && crop.regrowTimer === 0;
        if (!ready) continue;
        if (p.energy < ENERGY_COST) { exhausted = true; break; }
        p.energy -= ENERGY_COST;

        const { mult } = qualityMultiplier(crop, def);
        // store produce keyed with quality so sell value is preserved
        const key = mult >= 2 ? `${crop.cropId}#gold` : mult >= 1.5 ? `${crop.cropId}#silver` : crop.cropId;
        farm.inventory[key] = (farm.inventory[key] ?? 0) + 1;
        harvested++;

        if (def.regrowDays) {
            crop.regrowTimer = def.regrowDays; // will re-bear after regrowDays waterings
            crop.watered = false;
        } else {
            t.crop = null;
        }
        changed.push(i);
    }
    if (harvested > 0) {
        broadcastTiles(farm, changed);
        broadcastFarmInventory(farm);
        socket.emit(S2C.STATS, serializeStats(farm, p));
        toast(socket, `Harvested ${harvested} crop${harvested > 1 ? 's' : ''}.`, 'success');
    } else if (exhausted) {
        toast(socket, 'Too exhausted — sleep to restore energy.', 'error');
    }
}

function onBuy(socket: Socket, payload: any): void {
    const ctx = currentFarm(socket);
    if (!ctx) return;
    const { farm } = ctx;
    const kind = String(payload?.kind || ''); // 'seed'
    const itemId = String(payload?.itemId || '');
    const qty = Math.max(1, Math.min(999, Math.floor(Number(payload?.qty) || 1)));
    if (kind !== 'seed') return;
    const def = CROP_BY_ID.get(itemId);
    if (!def) return;
    const cost = def.seedPrice * qty;
    if (farm.money < cost) { toast(socket, 'Not enough money.', 'error'); return; }
    farm.money -= cost;
    farm.seeds[itemId] = (farm.seeds[itemId] ?? 0) + qty;
    broadcastFarmInventory(farm);
    broadcastStats(farm);
    toast(socket, `Bought ${qty} ${def.name} seed${qty > 1 ? 's' : ''}.`, 'success');
}

function produceSellValue(key: string): { value: number; name: string } | null {
    const [cropId, q] = key.split('#');
    const def = CROP_BY_ID.get(cropId);
    if (!def) return null;
    const mult = q === 'gold' ? 2 : q === 'silver' ? 1.5 : 1;
    const label = q === 'gold' ? ' (Gold)' : q === 'silver' ? ' (Silver)' : '';
    return { value: Math.round(def.sellPrice * mult * SHIPPING_RATE), name: def.name + label };
}

function onSell(socket: Socket, payload: any): void {
    const ctx = currentFarm(socket);
    if (!ctx) return;
    const { farm } = ctx;
    const itemId = String(payload?.itemId || '');
    const have = farm.inventory[itemId] ?? 0;
    if (have <= 0) return;
    const qty = Math.max(1, Math.min(have, Math.floor(Number(payload?.qty) || have)));
    const info = produceSellValue(itemId);
    if (!info) return;
    const total = info.value * qty;
    farm.inventory[itemId] = have - qty;
    if (farm.inventory[itemId] <= 0) delete farm.inventory[itemId];
    farm.money += total;
    farm.shippedValue += total;
    broadcastFarmInventory(farm);
    broadcastStats(farm);
    toast(socket, `Sold ${qty}× ${info.name} for ${total}g.`, 'success');
}

function onUpgradeTool(socket: Socket, payload: any): void {
    const ctx = currentFarm(socket);
    if (!ctx) return;
    const { farm, userId } = ctx;
    if (!isHost(farm, userId)) { toast(socket, 'Only the farm host can upgrade equipment.', 'error'); return; }
    const tool = String(payload?.tool || '') as ToolId;
    if (!TOOL_DEFS[tool]) return;
    const cur = farm.tools[tool] ?? 1;
    const next = TOOL_DEFS[tool].upgrades[cur]; // upgrades[cur] is level cur+1
    if (!next) { toast(socket, 'Already at max level.', 'error'); return; }
    if (farm.money < next.cost) { toast(socket, 'Not enough money.', 'error'); return; }
    farm.money -= next.cost;
    farm.tools[tool] = next.level;
    broadcastFarmInventory(farm);
    broadcastStats(farm);
    toast(socket, `${TOOL_DEFS[tool].name} upgraded to ${next.label}!`, 'success');
}

function onSleep(socket: Socket): void {
    const ctx = currentFarm(socket);
    if (!ctx) return;
    const { farm, userId } = ctx;
    if (!isHost(farm, userId)) { toast(socket, 'Only the host can end the day (sleep).', 'error'); return; }

    advanceDay(farm);

    // refresh everyone
    for (const s of socketsInFarm(farm)) s.emit(S2C.FARM_STATE, fullFarmState(farm));
    for (const p of farm.presence.values()) {
        p.energy = MAX_ENERGY;
        ioRef.sockets.sockets.get(p.socketId)?.emit(S2C.STATS, serializeStats(farm, p));
    }
    for (const s of socketsInFarm(farm)) {
        s.emit(S2C.TOAST, { message: `Day ${farm.day} — ${season(farm)}, ${farm.weather}.`, kind: 'info' });
    }
}

// Deterministic-ish weather without Math.random dependence concerns: simple LCG seeded by day.
function nextWeather(day: number): 'sunny' | 'rain' {
    const v = (day * 1103515245 + 12345) & 0x7fffffff;
    return (v % 100) < 32 ? 'rain' : 'sunny';
}

function advanceDay(farm: Farm): void {
    farm.day += 1;
    farm.seasonIndex = Math.floor((farm.day - 1) / DAYS_PER_SEASON) % SEASONS.length;
    farm.weather = nextWeather(farm.day);
    const raining = farm.weather === 'rain';

    const changed: number[] = [];
    for (let i = 0; i < farm.tiles.length; i++) {
        const t = farm.tiles[i];
        if (!t.crop) continue;
        const crop = t.crop;
        const def = CROP_BY_ID.get(crop.cropId)!;
        const watered = crop.watered || raining;

        // Out-of-season crops wither (except they survive their own seasons).
        if (!def.seasons.includes(season(farm))) {
            t.crop = null;
            t.terrain = 1;
            changed.push(i);
            continue;
        }

        if (crop.regrowTimer > 0) {
            if (watered) { crop.regrowTimer -= 1; crop.wateredCount += 1; }
        } else if (crop.stage < def.growthDays) {
            if (watered) { crop.stage += 1; crop.wateredCount += 1; }
        }
        crop.watered = false;
        changed.push(i);
    }
    // tilled soil left empty stays tilled; broadcast handled by caller via FARM_STATE,
    // but push tile deltas too so growth is reflected immediately.
    broadcastTiles(farm, changed);
    broadcastStats(farm);
}

function onChat(socket: Socket, payload: any): void {
    const ctx = currentFarm(socket);
    if (!ctx) return;
    const { farm, name } = ctx;
    const text = String(payload?.text || '').slice(0, CHAT_MAX).replace(/[<>]/g, '');
    if (!text.trim()) return;
    const msg = { name, text, ts: Date.now() };
    for (const s of socketsInFarm(farm)) s.emit(S2C.CHAT, msg);
}

// ── Multiplayer: joining other farms ───────────────────────────────
function onJoinFarm(socket: Socket, payload: any): void {
    const st = socketState.get(socket.id);
    if (!st) { err(socket, 'Not initialized.'); return; }
    const code = String(payload?.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) { err(socket, 'Enter a farm code.'); return; }
    const farmId = codeToFarm.get(code);
    const farm = farmId ? farms.get(farmId) : undefined;
    if (!farm) { err(socket, 'No farm found with that code.'); return; }

    if (farm.ownerUserId === st.userId) {
        toast(socket, 'That is your own farm.', 'info');
        return;
    }

    // already a member → go straight in
    if (isMember(farm, st.userId)) {
        removeFromCurrentFarm(socket);
        placeInFarm(socket, farm, st.userId, st.name);
        toast(socket, `Welcome back to ${farm.name}.`, 'success');
        return;
    }

    // otherwise create / refresh a join request and notify the host
    if (!farm.joinRequests.some((r) => r.userId === st.userId)) {
        farm.joinRequests.push({ userId: st.userId, name: st.name });
    }
    broadcastMembers(farm);
    // notify any online host sockets
    const hostPresence = farm.presence.get(farm.ownerUserId);
    if (hostPresence) {
        ioRef.sockets.sockets.get(hostPresence.socketId)?.emit(S2C.JOIN_REQUESTED, {
            userId: st.userId, name: st.name, farmName: farm.name,
        });
    }
    toast(socket, `Requested to join ${farm.name}. Waiting for the host…`, 'info');
}

function onApproveJoin(socket: Socket, payload: any): void {
    const ctx = currentFarm(socket);
    if (!ctx) return;
    const { farm, userId } = ctx;
    if (!isHost(farm, userId)) return;
    const targetId = String(payload?.userId || '');
    const reqIdx = farm.joinRequests.findIndex((r) => r.userId === targetId);
    if (reqIdx === -1) return;
    const req = farm.joinRequests.splice(reqIdx, 1)[0];
    if (!isMember(farm, req.userId)) farm.members.push({ userId: req.userId, name: req.name });
    broadcastMembers(farm);

    // if the requester is online (anywhere), pull them into the farm
    const targetSocket = findUserSocket(req.userId);
    if (targetSocket) {
        removeFromCurrentFarm(targetSocket);
        placeInFarm(targetSocket, farm, req.userId, req.name);
        toast(targetSocket, `You were approved to join ${farm.name}!`, 'success');
    }
}

function onDenyJoin(socket: Socket, payload: any): void {
    const ctx = currentFarm(socket);
    if (!ctx) return;
    const { farm, userId } = ctx;
    if (!isHost(farm, userId)) return;
    const targetId = String(payload?.userId || '');
    farm.joinRequests = farm.joinRequests.filter((r) => r.userId !== targetId);
    broadcastMembers(farm);
    const targetSocket = findUserSocket(targetId);
    if (targetSocket) toast(targetSocket, `Your request to join ${farm.name} was declined.`, 'error');
}

function onKick(socket: Socket, payload: any): void {
    const ctx = currentFarm(socket);
    if (!ctx) return;
    const { farm, userId } = ctx;
    if (!isHost(farm, userId)) return;
    const targetId = String(payload?.userId || '');
    if (targetId === farm.ownerUserId) return; // can't kick the host
    farm.members = farm.members.filter((m) => m.userId !== targetId);
    farm.joinRequests = farm.joinRequests.filter((r) => r.userId !== targetId);

    const targetSocket = findUserSocket(targetId);
    if (targetSocket && farm.presence.get(targetId)?.socketId === targetSocket.id) {
        // send them home to their own farm
        farm.presence.delete(targetId);
        targetSocket.emit(S2C.KICKED, { reason: 'kicked', farmName: farm.name });
        const tState = socketState.get(targetSocket.id);
        if (tState) {
            const home = ensureFarm(tState.userId, tState.name);
            placeInFarm(targetSocket, home, tState.userId, tState.name);
        }
    } else {
        farm.presence.delete(targetId);
    }
    broadcastMembers(farm);
    broadcastPresence(farm);
    toast(socket, 'Player removed.', 'info');
}

function onLeaveFarm(socket: Socket): void {
    const st = socketState.get(socket.id);
    if (!st) return;
    const cur = farms.get(st.farmId);
    if (cur && cur.ownerUserId !== st.userId) {
        if (cur.presence.get(st.userId)?.socketId === socket.id) cur.presence.delete(st.userId);
        broadcastPresence(cur);
        broadcastMembers(cur);
    }
    const home = ensureFarm(st.userId, st.name);
    placeInFarm(socket, home, st.userId, st.name);
    toast(socket, 'Returned to your farm.', 'info');
}

function onRenameFarm(socket: Socket, payload: any): void {
    const ctx = currentFarm(socket);
    if (!ctx) return;
    const { farm, userId } = ctx;
    if (!isHost(farm, userId)) return;
    const name = String(payload?.name || '').slice(0, 32).replace(/[<>]/g, '').trim();
    if (!name) return;
    farm.name = name;
    broadcastFarmInventory(farm);
    broadcastMembers(farm);
}

function findUserSocket(userId: string): Socket | null {
    for (const [sid, st] of socketState.entries()) {
        if (st.userId === userId) {
            const s = ioRef.sockets.sockets.get(sid);
            if (s) return s;
        }
    }
    return null;
}

// ── Presence broadcast loop (throttled) ────────────────────────────
let presenceTimer: NodeJS.Timeout | null = null;
function startPresenceLoop(): void {
    if (presenceTimer) return;
    presenceTimer = setInterval(() => {
        for (const farm of farms.values()) {
            if (farm.presence.size > 0) broadcastPresence(farm);
        }
    }, 100);
    if (presenceTimer.unref) presenceTimer.unref();
}

// ── Public API ─────────────────────────────────────────────────────
export function registerRmhFarmingSimHandlers(io: Server, socket: Socket): void {
    ioRef = io;
    startPresenceLoop();
    socket.on(C2S.HELLO, () => onHello(socket));
    socket.on(C2S.MOVE, (p) => onMove(socket, p));
    socket.on(C2S.TILL, (p) => onTill(socket, p));
    socket.on(C2S.CLEAR, (p) => onClear(socket, p));
    socket.on(C2S.PLANT, (p) => onPlant(socket, p));
    socket.on(C2S.WATER, (p) => onWater(socket, p));
    socket.on(C2S.HARVEST, (p) => onHarvest(socket, p));
    socket.on(C2S.BUY, (p) => onBuy(socket, p));
    socket.on(C2S.SELL, (p) => onSell(socket, p));
    socket.on(C2S.UPGRADE_TOOL, (p) => onUpgradeTool(socket, p));
    socket.on(C2S.SLEEP, () => onSleep(socket));
    socket.on(C2S.CHAT, (p) => onChat(socket, p));
    socket.on(C2S.JOIN_FARM, (p) => onJoinFarm(socket, p));
    socket.on(C2S.APPROVE_JOIN, (p) => onApproveJoin(socket, p));
    socket.on(C2S.DENY_JOIN, (p) => onDenyJoin(socket, p));
    socket.on(C2S.KICK, (p) => onKick(socket, p));
    socket.on(C2S.LEAVE_FARM, () => onLeaveFarm(socket));
    socket.on(C2S.RENAME_FARM, (p) => onRenameFarm(socket, p));
}

export function handleRmhFarmingSimDisconnect(_io: Server, socket: Socket): void {
    const st = socketState.get(socket.id);
    if (st) {
        const farm = farms.get(st.farmId);
        if (farm && farm.presence.get(st.userId)?.socketId === socket.id) {
            farm.presence.delete(st.userId);
            broadcastPresence(farm);
            broadcastMembers(farm);
        }
    }
    socketState.delete(socket.id);
}
