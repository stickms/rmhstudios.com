import type { ActMapConfig } from './types';

export const actMaps: Record<string, ActMapConfig> = {
    act1: {
        id: 'act1',
        name: 'The Whispering Woods at Dusk',
        mapRadius: 150,
        treeSeed: 42,
        treeCount: 280,
        rockCount: 50,
        mushroomCount: 40,
        atmosphere: {
            fogColor: '#060d1a',
            fogNear: 15,
            fogFar: 80,
            ambientColor: '#1a2a50',
            ambientIntensity: 0.06,
            directionalColor: '#8aa8d0',
            directionalIntensity: 0.18,
            directionalPosition: [-60, 90, -40],
            backgroundColor: '#050914',
            showSky: false,
            showStars: true,
            starCount: 2000,
            showMoon: true,
            firefliesIntensity: 1.0,
        },
        corridors: [
            // Main path: spawn → stone circle (north)
            { start: [0, 0], end: [0, -60], width: 12 },
            // Stone circle → stargazer clearing (east)
            { start: [0, -60], end: [50, -40], width: 10 },
            // Stargazer → shadow wall (south)
            { start: [50, -40], end: [30, 30], width: 10 },
            // Shadow wall → gateway arch (west)
            { start: [30, 30], end: [-40, 20], width: 10 },
            // Gateway → center connector
            { start: [-40, 20], end: [0, 0], width: 10 },
        ],
        landmarks: [
            { id: 'stone_circle', type: 'AncientStone', position: [0, 0, -60], scale: 1.2 },
            { id: 'stargazer_clearing', type: 'ClearingMarker', position: [50, 0, -40] },
            { id: 'shadow_wall', type: 'ShadowWall', position: [30, 0, 30] },
            { id: 'gateway_arch', type: 'GatewayArch', position: [-40, 0, 20], scale: 1.5 },
        ],
        portalPosition: [-40, 0, 20],
    },

    act2: {
        id: 'act2',
        name: 'Confronting the Shifting Canopy',
        mapRadius: 130,
        treeSeed: 137,
        treeCount: 320,
        rockCount: 35,
        mushroomCount: 25,
        atmosphere: {
            fogColor: '#1a0f0a',
            fogNear: 12,
            fogFar: 65,
            ambientColor: '#3a2010',
            ambientIntensity: 0.08,
            directionalColor: '#d4713a',
            directionalIntensity: 0.25,
            directionalPosition: [40, 60, -30],
            backgroundColor: '#0d0806',
            showSky: false,
            showStars: true,
            starCount: 800,
            showMoon: false,
            firefliesIntensity: 0.6,
        },
        corridors: [
            // Entry → wind hollow (central)
            { start: [0, 0], end: [0, -30], width: 10 },
            // Wind hollow → mirror pool (north)
            { start: [0, -30], end: [-30, -60], width: 8 },
            // Mirror pool → echo chamber (south-east)
            { start: [-30, -60], end: [40, -20], width: 8 },
            // Echo chamber → root gate (far east)
            { start: [40, -20], end: [70, -40], width: 8 },
        ],
        landmarks: [
            { id: 'wind_hollow', type: 'HollowTree', position: [0, 0, -30], scale: 1.8 },
            { id: 'mirror_pool', type: 'CrystalCluster', position: [-30, 0, -60] },
            { id: 'echo_chamber', type: 'EchoChamber', position: [40, 0, -20] },
            { id: 'root_gate', type: 'GatewayArch', position: [70, 0, -40], scale: 1.5 },
        ],
        portalPosition: [70, 0, -40],
    },

    act3: {
        id: 'act3',
        name: 'Sunrise Over the Tranquil Grove',
        mapRadius: 180,
        treeSeed: 271,
        treeCount: 200,
        rockCount: 60,
        mushroomCount: 30,
        atmosphere: {
            fogColor: '#1a0a1a',
            fogNear: 20,
            fogFar: 100,
            ambientColor: '#2a1040',
            ambientIntensity: 0.12,
            directionalColor: '#e8a060',
            directionalIntensity: 0.4,
            directionalPosition: [80, 40, 60],
            backgroundColor: '#0a0510',
            showSky: true,
            showStars: true,
            starCount: 600,
            showMoon: false,
            firefliesIntensity: 0.3,
        },
        corridors: [
            // Entry → shattered monument
            { start: [0, 0], end: [20, -40], width: 14 },
            // Monument → twilight observatory (north)
            { start: [20, -40], end: [-20, -80], width: 10 },
            // Observatory → crystal nexus (central)
            { start: [-20, -80], end: [0, -50], width: 10 },
            // Crystal nexus → heartwood (the ancient tree)
            { start: [0, -50], end: [40, -70], width: 12 },
            // Cross-path: monument → crystal nexus
            { start: [20, -40], end: [0, -50], width: 10 },
        ],
        landmarks: [
            { id: 'shattered_monument', type: 'ShatteredMonument', position: [20, 0, -40] },
            { id: 'twilight_observatory', type: 'Observatory', position: [-20, 0, -80], scale: 1.3 },
            { id: 'crystal_nexus', type: 'CrystalCluster', position: [0, 0, -50], scale: 1.5 },
            { id: 'heartwood', type: 'HeartwoodTree', position: [40, 0, -70], scale: 2.0 },
        ],
        portalPosition: [40, 0, -70],
    },
};

export function getActMap(act: import('./types').ActId): ActMapConfig {
    return actMaps[act];
}
