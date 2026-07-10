'use client';

import { useCallback } from 'react';
import { PointerLockControls, Sky, Stars } from '@react-three/drei';
import { Ground } from '../shared/Ground';
import { Pond } from '../shared/Pond';
import { River, Bridges } from '../shared/River';
import { ForestScene } from '../shared/ForestScene';
import { GrassBorder } from '../shared/GrassBorder';
import { BoundaryWall } from '../shared/BoundaryWall';
import { Clouds } from '../shared/Clouds';
import { Fireflies } from '../shared/Fireflies';
import { Mist } from '../shared/Mist';
import { Moon } from '../shared/Moon';
import { TikiTorches } from '../shared/TikiTorches';
import { Flashlight } from '../shared/Flashlight';
import { Player } from '../shared/PlayerController';
import { ScatterDecor } from '../story/scenery/ScatterDecor';
import { Garden } from './Garden';
import { Butterflies } from './Butterflies';
import { distToRiver, RIVER_HALF_WIDTH } from '../shared/constants';

const FERN_PALETTE = ['#1d4a22', '#2a5c2e', '#173d1e'];
const FLOWER_PALETTE = ['#cc6688', '#8899ee', '#ddaa55', '#bb77dd', '#e0e8ff'];

export function ExploreScene({
    onLock,
    onUnlock,
    night,
    flashlightOn,
    locked,
}: {
    onLock: () => void;
    onUnlock: () => void;
    night: boolean;
    flashlightOn: boolean;
    locked: boolean;
}) {
    // Wild ground cover keeps clear of the river and pond
    const rejectScatter = useCallback((x: number, z: number) => {
        if (distToRiver(x, z) < RIVER_HALF_WIDTH + 1.0) return true;
        const dx = x - 28, dz = z + 22;
        return dx * dx + dz * dz < 100;
    }, []);

    return (
        <>
            {night && <color attach="background" args={['#050914']} />}

            {night
                ? <fog attach="fog" args={['#060d1a', 20, 85]} />
                : <fog attach="fog" args={['#8aba82', 28, 130]} />
            }

            <ambientLight
                intensity={night ? 0.06 : 0.55}
                color={night ? '#1a2a50' : '#c0d8a8'}
            />

            {/* Shadows only by day — at night they're invisible but the
                shadow pass still re-renders every tree. Key forces a light
                rebuild so the renderer fully drops the shadow map. */}
            <directionalLight
                key={night ? 'night-sun' : 'day-sun'}
                position={night ? [-60, 90, -40] : [60, 80, 40]}
                intensity={night ? 0.18 : 1.6}
                color={night ? '#8aa8d0' : '#fde68a'}
                castShadow={!night}
                shadow-mapSize={[1024, 1024] as unknown as number}
                shadow-camera-far={200}
                shadow-camera-left={-100}
                shadow-camera-right={100}
                shadow-camera-top={100}
                shadow-camera-bottom={-100}
            />

            <directionalLight
                position={[-50, 25, -50]}
                intensity={night ? 0.03 : 0.28}
                color={night ? '#040810' : '#a8d4f5'}
            />

            {!night && (
                <Sky
                    sunPosition={[60, 12, 40]}
                    turbidity={5}
                    rayleigh={2.2}
                    mieCoefficient={0.004}
                    mieDirectionalG={0.8}
                />
            )}

            <Stars
                radius={280}
                depth={50}
                count={night ? 1500 : 800}
                factor={night ? 6 : 4}
                fade
                speed={0.5}
            />

            {night && <Moon />}

            <Ground />
            <Pond />
            <River />
            <Bridges />
            <ForestScene />
            <GrassBorder />
            <BoundaryWall />
            <Clouds night={night} />
            <Fireflies night={night} />
            <Mist />
            {night && <TikiTorches />}
            {night && flashlightOn && <Flashlight />}

            {/* Wild meadow cover */}
            <ScatterDecor
                seed={1}
                radius={95}
                fernCount={190}
                flowerCount={120}
                fernPalette={FERN_PALETTE}
                flowerPalette={FLOWER_PALETTE}
                reject={rejectScatter}
                flowerGlow={night}
            />

            {/* Daytime butterflies over the meadow */}
            {!night && <Butterflies count={16} />}

            {/* Your garden: G to plant, E to water, grows over real time */}
            <Garden night={night} locked={locked} />

            <Player />

            <PointerLockControls onLock={onLock} onUnlock={onUnlock} />
        </>
    );
}
