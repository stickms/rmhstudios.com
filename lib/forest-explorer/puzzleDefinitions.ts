import type { PuzzleDefinition } from './types';

export const puzzleDefinitions: PuzzleDefinition[] = [
    // ─── Act 1: The Whispering Woods at Dusk ─────────────────────────────────

    {
        id: 'act1_rune_sequence',
        type: 'rune_sequence',
        act: 'act1',
        title: 'Whispers in Stone',
        description: 'The ancient stones glow with forgotten runes. Watch their pattern, then repeat it.',
        difficulty: 'easy',
        estimatedMinutes: 5,
        landmarkId: 'stone_circle',
        config: {
            symbolCount: 5,
            sequenceLength: 4,
            displayDuration: 800,
            pauseBetween: 300,
        },
        worldEvent: 'act1_stones_awakened',
        hintEntryIds: ['act1_stone_lore'],
        solveText: 'The stones hum in unison — a chord held for a thousand years finally resolves.',
    },
    {
        id: 'act1_constellation',
        type: 'constellation',
        act: 'act1',
        title: 'The Forest Sky',
        description: 'Stars peek through the canopy. Connect them to form the ancient pattern.',
        difficulty: 'easy',
        estimatedMinutes: 7,
        landmarkId: 'stargazer_clearing',
        config: {
            starCount: 18,
            correctEdges: 7,
            decoyStars: 10,
            pattern: 'tree_of_life',
        },
        worldEvent: 'act1_stars_aligned',
        hintEntryIds: ['act1_star_map'],
        solveText: 'The Tree of Life burns bright above the canopy. Somewhere far below, roots stir.',
    },
    {
        id: 'act1_shadow_match',
        type: 'shadow_match',
        act: 'act1',
        title: 'Shadow Play',
        description: 'Position the ancient totems to cast shadows matching the wall carvings.',
        difficulty: 'medium',
        estimatedMinutes: 8,
        landmarkId: 'shadow_wall',
        config: {
            objectCount: 4,
            targetShapes: ['deer', 'tree', 'moon', 'river'],
            snapTolerance: 15,
        },
        worldEvent: 'act1_shadows_aligned',
        hintEntryIds: ['act1_shadow_legend'],
        solveText: 'The shadows settle into their old story, and the wall remembers how it ends.',
    },
    {
        id: 'act1_ward_seal',
        type: 'ward_seal',
        act: 'act1',
        title: 'The First Ward',
        description: 'Three concentric rings guard the gateway. Rotate each to align the ward symbols.',
        difficulty: 'medium',
        estimatedMinutes: 10,
        landmarkId: 'gateway_arch',
        config: {
            ringCount: 3,
            symbolsPerRing: 6,
            correctPositions: [1, 5, 2],
            snapDegrees: 60,
        },
        worldEvent: 'act1_gateway_opened',
        hintEntryIds: ['act1_ward_inscription'],
        requiresPuzzleIds: ['act1_rune_sequence', 'act1_constellation', 'act1_shadow_match'],
        lockedHint: 'The ward is dormant. The stones, the stars, and the shadows must wake first.',
        solveText: 'The rings lock into alignment and the arch exhales a slow blue light. The way is open.',
    },

    // ─── Act 2: Confronting the Shifting Canopy ─────────────────────────────

    {
        id: 'act2_sound_pipe',
        type: 'sound_pipe',
        act: 'act2',
        title: 'Song of the Wind',
        description: 'Route the forest breeze through ancient pipes from the wind source to the hollow tree.',
        difficulty: 'medium',
        estimatedMinutes: 8,
        landmarkId: 'wind_hollow',
        config: {
            gridSize: 6,
            pipeTypes: ['straight', 'corner', 'tee', 'cross'],
            source: [0, 3],
            target: [5, 2],
            preplacedCount: 4,
        },
        worldEvent: 'trees_calm_briefly',
        hintEntryIds: ['act2_wind_song'],
        solveText: 'The breeze threads the pipes and the hollow tree sings. For a moment, the canopy is still.',
    },
    {
        id: 'act2_reflection',
        type: 'reflection',
        act: 'act2',
        title: 'Reflections of Truth',
        description: 'Angle the forest mirrors to guide moonlight from the source crystal to the seal.',
        difficulty: 'medium',
        estimatedMinutes: 10,
        landmarkId: 'mirror_pool',
        config: {
            mirrorCount: 5,
            lightSource: [0, 0],
            target: [6, 6],
            obstacles: [[2, 2], [3, 5], [5, 1]],
            gridSize: 7,
        },
        worldEvent: 'trees_calm_briefly',
        hintEntryIds: ['act2_mirror_legend'],
        solveText: 'Moonlight finds the seal at last. The pool holds its reflection like a kept promise.',
    },
    {
        id: 'act2_memory_echo',
        type: 'memory_echo',
        act: 'act2',
        title: 'Echoes of the Past',
        description: 'Listen to the forest\'s memory. Replay the sounds in the correct order.',
        difficulty: 'medium',
        estimatedMinutes: 8,
        landmarkId: 'echo_chamber',
        config: {
            soundCount: 6,
            sequenceLength: 5,
            playbackSpeed: 1.0,
            sounds: ['owl', 'wind', 'creek', 'rustle', 'birdsong', 'thunder'],
        },
        worldEvent: 'trees_calm_briefly',
        hintEntryIds: ['act2_echo_lore'],
        solveText: 'The chamber replays the song back to you, note-perfect. The forest heard itself remembered.',
    },
    {
        id: 'act2_root_network',
        type: 'root_network',
        act: 'act2',
        title: 'The Root Mind',
        description: 'Activate the correct root paths to connect the ancient tree to the gateway.',
        difficulty: 'hard',
        estimatedMinutes: 10,
        landmarkId: 'root_gate',
        config: {
            nodeCount: 12,
            edgeCount: 20,
            sourceNode: 0,
            targetNode: 11,
            maxActiveEdges: 6,
        },
        worldEvent: 'act2_gateway_opened',
        hintEntryIds: ['act2_root_history'],
        requiresPuzzleIds: ['act2_sound_pipe', 'act2_reflection', 'act2_memory_echo'],
        lockedHint: 'The roots refuse you. The wind, the light, and the echoes must be calmed first.',
        solveText: 'Light races along the roots like a thought completing itself. The gate ahead unknots.',
    },

    // ─── Act 3: Sunrise Over the Tranquil Grove ─────────────────────────────

    {
        id: 'act3_corrupted_glyph',
        type: 'corrupted_glyph',
        act: 'act3',
        title: 'Broken Words',
        description: 'The monument\'s inscription has shattered. Drag and rotate fragments to reassemble it.',
        difficulty: 'medium',
        estimatedMinutes: 8,
        landmarkId: 'shattered_monument',
        config: {
            fragmentCount: 8,
            rotationSnap: 45,
            snapDistance: 20,
            targetImage: 'forest_glyph',
        },
        worldEvent: 'act3_corruption_recedes_1',
        hintEntryIds: ['act3_monument_lore'],
        solveText: '"Balance." The word settles back into the stone, and the purple haze nearby thins.',
    },
    {
        id: 'act3_constellation',
        type: 'constellation',
        act: 'act3',
        title: 'The Final Star',
        description: 'The dawn sky reveals one last constellation. Connect the fading stars before sunrise.',
        difficulty: 'hard',
        estimatedMinutes: 10,
        landmarkId: 'twilight_observatory',
        config: {
            starCount: 24,
            correctEdges: 10,
            decoyStars: 13,
            pattern: 'phoenix_rising',
            timedFade: true,
            fadeSeconds: 75,
        },
        worldEvent: 'act3_corruption_recedes_2',
        hintEntryIds: ['act3_final_star_map'],
        solveText: 'The Phoenix holds against the dawn a heartbeat longer, then dissolves into daylight — reborn.',
    },
    {
        id: 'act3_reflection',
        type: 'reflection',
        act: 'act3',
        title: 'Prismatic Heart',
        description: 'Guide dawn light through crystal prisms to illuminate the forest heart.',
        difficulty: 'hard',
        estimatedMinutes: 10,
        landmarkId: 'crystal_nexus',
        config: {
            mirrorCount: 7,
            lightSource: [0, 0],
            target: [8, 8],
            obstacles: [[2, 3], [4, 1], [6, 5], [3, 7]],
            gridSize: 9,
            hasPrisms: true,
            prisms: [[4, 4], [7, 2]],
        },
        worldEvent: 'act3_corruption_recedes_3',
        hintEntryIds: ['act3_crystal_legend'],
        solveText: 'Dawn light splits through the prisms and pours into the heart of the grove, gold on gold.',
    },
    {
        id: 'act3_ward_seal',
        type: 'ward_seal',
        act: 'act3',
        title: 'The Last Seal',
        description: 'The Heartwood tree bears the final ward. Align four rings to break the last seal.',
        difficulty: 'hard',
        estimatedMinutes: 10,
        landmarkId: 'heartwood',
        config: {
            ringCount: 4,
            symbolsPerRing: 8,
            correctPositions: [3, 7, 2, 5],
            snapDegrees: 45,
        },
        worldEvent: 'act3_forest_restored',
        hintEntryIds: ['act3_heartwood_inscription'],
        requiresPuzzleIds: ['act3_corrupted_glyph', 'act3_constellation', 'act3_reflection'],
        lockedHint: 'The Heartwood sleeps too deeply. Restore the monument, the stars, and the light first.',
        solveText: 'The last seal breaks. The Heartwood blazes green, and a thousand years of memory come flooding home.',
    },
];

export function getPuzzlesByAct(act: import('./types').ActId): PuzzleDefinition[] {
    return puzzleDefinitions.filter(p => p.act === act);
}

export function getPuzzleById(id: string): PuzzleDefinition | undefined {
    return puzzleDefinitions.find(p => p.id === id);
}

/**
 * A puzzle is locked while any of its prerequisite puzzles remain unsolved.
 * Used to gate each act's gateway puzzle behind the act's other mysteries.
 */
export function isPuzzleLocked(
    puzzleId: string,
    puzzleStates: Record<string, { status: string } | undefined>,
): boolean {
    const puzzle = getPuzzleById(puzzleId);
    if (!puzzle?.requiresPuzzleIds?.length) return false;
    return puzzle.requiresPuzzleIds.some(id => puzzleStates[id]?.status !== 'solved');
}
