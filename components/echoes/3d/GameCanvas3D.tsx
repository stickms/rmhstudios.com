'use client';

import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { PerspectiveCamera, Stars } from '@react-three/drei';
import { Suspense, useState } from 'react';
import PlayerController from './PlayerController';
import OutpostLevel from './OutpostLevel';
import EnemyManager from './EnemyManager';
import { useNarrativeStore } from '@/lib/echoes/campaign/NarrativeStore';

export default function GameCanvas3D() {
    const [started, setStarted] = useState(false);
    const { startDialogue } = useNarrativeStore();

    const handleStart = () => {
        setStarted(true);
        // Trigger Intro Dialogue after player spawns
        setTimeout(() => startDialogue('intro_elara'), 1500);
    };

    return (
        <div className="w-full h-screen bg-black relative">
            {/* Start Screen Overlay */}
            {!started && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
                    <h1 className="text-4xl font-black text-white mb-2 tracking-widest uppercase">ECHOES</h1>
                    <p className="text-neon-purple text-sm mb-8 tracking-[0.3em] uppercase">Chapter I: The Phantom Signal</p>
                    <button
                        className="px-8 py-3 bg-transparent text-neon-purple font-bold rounded hover:bg-neon-purple hover:text-black transition-all border border-neon-purple uppercase tracking-widest text-sm"
                        onClick={handleStart}
                    >
                        Initiate Neural Link
                    </button>
                </div>
            )}

            <Canvas
                shadows
                gl={{ antialias: false }}
                camera={{ position: [0, 1.7, 5], fov: 75, near: 0.1, far: 200 }}
                style={{ background: '#0a0a0f' }}
            >
                {/* Ambient scene lighting - brighter */}
                <ambientLight intensity={1.2} />
                <hemisphereLight args={['#aabbff', '#334455', 0.8]} />

                {/* Stars background */}
                <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={0.5} />

                {/* Fog for atmosphere */}
                <fog attach="fog" args={['#0a0a0f', 25, 70]} />

                <Suspense fallback={null}>
                    <Physics gravity={[0, -15, 0]}>
                        {/* Level always visible */}
                        <OutpostLevel />

                        {/* Player and enemies only after start */}
                        {started && <EnemyManager />}
                        {started && <PlayerController />}
                    </Physics>
                </Suspense>
            </Canvas>
        </div>
    );
}
