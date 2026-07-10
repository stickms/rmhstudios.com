import { create } from 'zustand';
import {
    type GardenPlant, loadGarden, saveGarden, speciesForPosition, stageOf, stageIndex,
    SPECIES_LABEL, MAX_PLANTS, MIN_SPACING, PLANT_BOUND_RADIUS, WATER_RADIUS, WATER_BONUS_MS,
} from './garden';
import { distToRiver, RIVER_HALF_WIDTH } from '@/components/forest-explorer/shared/constants';

const POND_CENTER = { x: 28, z: -22 };
const POND_RADIUS = 10;

interface GardenState {
    plants: GardenPlant[];
    /** Bumped every few seconds so growth stages re-render while playing */
    nowTick: number;
    toast: string | null;
    initialized: boolean;

    init: () => void;
    tick: () => void;
    showToast: (msg: string) => void;
    /** Plant a seed at (x, z). Returns true if planted. */
    plantAt: (x: number, z: number) => boolean;
    /** Water the nearest own plant within reach. Returns true if watered. */
    waterNear: (x: number, z: number) => boolean;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useGardenStore = create<GardenState>((set, get) => ({
    plants: [],
    nowTick: 0,
    toast: null,
    initialized: false,

    init: () => {
        if (get().initialized) return;
        set({ plants: loadGarden(), nowTick: Date.now(), initialized: true });
    },

    tick: () => set({ nowTick: Date.now() }),

    showToast: (msg: string) => {
        set({ toast: msg });
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => set({ toast: null }), 2600);
    },

    plantAt: (x: number, z: number) => {
        const { plants, showToast } = get();

        if (plants.length >= MAX_PLANTS) {
            showToast('The garden is full — the forest asks for room to breathe.');
            return false;
        }
        if (Math.sqrt(x * x + z * z) > PLANT_BOUND_RADIUS) {
            showToast('Too close to the forest edge to take root.');
            return false;
        }
        if (distToRiver(x, z) < RIVER_HALF_WIDTH + 1.0) {
            showToast('The current would wash the seed away.');
            return false;
        }
        const pdx = x - POND_CENTER.x, pdz = z - POND_CENTER.z;
        if (pdx * pdx + pdz * pdz < POND_RADIUS * POND_RADIUS) {
            showToast('The pond is no place for a seed.');
            return false;
        }
        if (plants.some(p => {
            const dx = p.x - x, dz = p.z - z;
            return dx * dx + dz * dz < MIN_SPACING * MIN_SPACING;
        })) {
            showToast('Another plant already grows here.');
            return false;
        }

        const species = speciesForPosition(x, z);
        const plant: GardenPlant = {
            id: `${Date.now().toString(36)}-${plants.length}`,
            x, z, species,
            plantedAt: Date.now(),
            waterBonusMs: 0,
            lastWateredStage: -1,
        };
        const next = [...plants, plant];
        set({ plants: next });
        saveGarden(next);
        showToast(`You plant a seed. Something stirs... (${SPECIES_LABEL[species]})`);
        return true;
    },

    waterNear: (x: number, z: number) => {
        const { plants, showToast } = get();
        const now = Date.now();

        let nearest = -1;
        let nearestDist = WATER_RADIUS;
        plants.forEach((p, i) => {
            const dx = p.x - x, dz = p.z - z;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < nearestDist) {
                nearest = i;
                nearestDist = d;
            }
        });
        if (nearest === -1) return false;

        const plant = plants[nearest];
        const stage = stageOf(plant, now);
        const sIdx = stageIndex(stage);

        if (stage === 'bloom') {
            showToast(`The ${SPECIES_LABEL[plant.species]} is in full bloom.`);
            return true;
        }
        if (plant.lastWateredStage >= sIdx) {
            showToast('The soil here is still damp.');
            return true;
        }

        const next = [...plants];
        next[nearest] = { ...plant, waterBonusMs: plant.waterBonusMs + WATER_BONUS_MS, lastWateredStage: sIdx };
        set({ plants: next, nowTick: now });
        saveGarden(next);
        showToast(`You water the ${SPECIES_LABEL[plant.species]}. It drinks deep.`);
        return true;
    },
}));
