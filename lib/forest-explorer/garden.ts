// ─── Free Explore garden: plant seeds, watch them grow over real time ───────

export type FlowerSpecies = 'moonpetal' | 'sunburst' | 'foxbell' | 'emberbloom' | 'riverlily';

export type GrowthStage = 'seed' | 'sprout' | 'bud' | 'bloom';

export interface GardenPlant {
    id: string;
    x: number;
    z: number;
    species: FlowerSpecies;
    plantedAt: number;
    /** Extra growth credited by watering (ms) */
    waterBonusMs: number;
    /** Stage index (0-2) that was last watered — one watering per stage */
    lastWateredStage: number;
}

export interface GardenSave {
    version: 1;
    plants: GardenPlant[];
}

export const GARDEN_KEY = 'forest-explorer-garden-v1';
export const MAX_PLANTS = 80;
export const MIN_SPACING = 1.4;
export const PLANT_BOUND_RADIUS = 110;
export const WATER_RADIUS = 3.5;
export const WATER_BONUS_MS = 45_000;

/** Stage thresholds in ms of accumulated growth */
const STAGE_MS = {
    sprout: 45_000,   // 45s → sprout
    bud: 150_000,     // 2.5min → bud
    bloom: 300_000,   // 5min → full bloom
};

/** Per-species growth pace (higher = slower grower) */
const SPECIES_PACE: Record<FlowerSpecies, number> = {
    moonpetal: 1.3,   // the night-glower takes its time
    sunburst: 0.85,
    foxbell: 1.0,
    emberbloom: 1.1,
    riverlily: 0.95,
};

export const SPECIES_LIST: FlowerSpecies[] = ['moonpetal', 'sunburst', 'foxbell', 'emberbloom', 'riverlily'];

export const SPECIES_LABEL: Record<FlowerSpecies, string> = {
    moonpetal: 'Moonpetal',
    sunburst: 'Sunburst',
    foxbell: 'Foxbell',
    emberbloom: 'Emberbloom',
    riverlily: 'Riverlily',
};

export const SPECIES_COLORS: Record<FlowerSpecies, { petal: string; heart: string; glow: string }> = {
    moonpetal: { petal: '#cfe0ff', heart: '#f4f8ff', glow: '#9fc0ff' },
    sunburst: { petal: '#ffce4a', heart: '#b06a1a', glow: '#ffb830' },
    foxbell: { petal: '#b47fe8', heart: '#5a2a90', glow: '#c89fff' },
    emberbloom: { petal: '#ff7a4a', heart: '#8a2a10', glow: '#ff5a2a' },
    riverlily: { petal: '#8fe8dc', heart: '#2a8a80', glow: '#5fd8cc' },
};

/** Species chosen deterministically from planting spot — discover them by roaming */
export function speciesForPosition(x: number, z: number): FlowerSpecies {
    const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453);
    return SPECIES_LIST[Math.floor((h - Math.floor(h)) * SPECIES_LIST.length)];
}

/** Total accumulated growth for a plant (ms) */
export function growthMs(plant: GardenPlant, now: number): number {
    return Math.max(0, now - plant.plantedAt) + plant.waterBonusMs;
}

export function stageOf(plant: GardenPlant, now: number): GrowthStage {
    const pace = SPECIES_PACE[plant.species] ?? 1;
    const g = growthMs(plant, now) / pace;
    if (g >= STAGE_MS.bloom) return 'bloom';
    if (g >= STAGE_MS.bud) return 'bud';
    if (g >= STAGE_MS.sprout) return 'sprout';
    return 'seed';
}

export function stageIndex(stage: GrowthStage): number {
    return stage === 'seed' ? 0 : stage === 'sprout' ? 1 : stage === 'bud' ? 2 : 3;
}

/** 0..1 progress within the whole growth curve (for smooth scaling) */
export function growthProgress(plant: GardenPlant, now: number): number {
    const pace = SPECIES_PACE[plant.species] ?? 1;
    return Math.min(1, growthMs(plant, now) / pace / STAGE_MS.bloom);
}

// ─── Persistence ─────────────────────────────────────────────────────────────

export function loadGarden(): GardenPlant[] {
    try {
        const raw = localStorage.getItem(GARDEN_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as GardenSave;
        if (parsed.version !== 1 || !Array.isArray(parsed.plants)) return [];
        return parsed.plants.slice(0, MAX_PLANTS);
    } catch {
        return [];
    }
}

export function saveGarden(plants: GardenPlant[]): void {
    try {
        const save: GardenSave = { version: 1, plants: plants.slice(0, MAX_PLANTS) };
        localStorage.setItem(GARDEN_KEY, JSON.stringify(save));
    } catch {
        // Storage full or unavailable — the garden lives on in memory
    }
}
