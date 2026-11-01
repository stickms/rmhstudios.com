'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { createKowloonRenderer, extendKowloonThree } from '@/lib/kowloon-knockout/render/webgpu';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import { useIsMobile } from '@/lib/studio/hooks/useIsMobile';
import { LocalInputSource } from '@/lib/kowloon-knockout/game/input';
import {
    createLocalSession, createTrainingSession, createHostSession, createGuestSession,
    type GameSession, type HudState,
} from '@/lib/kowloon-knockout/net/session';
import Arena3D from './Arena3D';
import HUD from '@/components/kowloon-knockout/HUD';
import MobileControls from '@/components/kowloon-knockout/MobileControls';
import { TrainingPanel, TrainingOverlay } from '@/components/kowloon-knockout/TrainingRoom';

// Register the three/webgpu material/object catalogue with R3F before any
// arena JSX mounts.
extendKowloonThree();

export default function GameView() {
    const { t } = useTranslation('c-kowloon-knockout');
    const runtime = useGameStore((s) => s.runtime);
    const setMatchResult = useGameStore((s) => s.setMatchResult);
    const setPhase = useGameStore((s) => s.setPhase);
    const isMobile = useIsMobile();

    const [session, setSession] = useState<GameSession | null>(null);
    const [input, setInput] = useState<LocalInputSource | null>(null);
    const [hud, setHud] = useState<HudState | null>(null);
    const [glLost, setGlLost] = useState(false);
    const sessionRef = useRef<GameSession | null>(null);

    const seatIds = useMemo(() => {
        if (!runtime) return [];
        return runtime.kind === 'guest'
            ? runtime.seats.map((s) => s.seat)
            : runtime.config.seats.map((s) => s.seat);
    }, [runtime]);

    // Build + run the session for this match.
    useEffect(() => {
        if (!runtime) return;
        const src = new LocalInputSource();
        src.attach();

        let s: GameSession;
        if (runtime.kind === 'guest') s = createGuestSession(runtime.seats, runtime.localSeat, runtime.mode);
        else if (runtime.kind === 'host') s = createHostSession(runtime.config);
        else if (runtime.training) s = createTrainingSession(runtime.config);
        else s = createLocalSession(runtime.config);

        s.setInputSource(src);
        s.onResult((winnerSeat) => {
            const finalHud = s.getHud();
            window.setTimeout(() => {
                setMatchResult({ winnerSeat, mode: finalHud.mode, fighters: finalHud.fighters });
                setPhase('result');
            }, 1800);
        });
        s.start();

        sessionRef.current = s;
        setSession(s);
        setInput(src);

        return () => {
            s.stop();
            src.detach();
            sessionRef.current = null;
            setSession(null);
            setInput(null);
        };
    }, [runtime, setMatchResult, setPhase]);

    // Throttled HUD polling (~15 Hz) so React isn't churned every frame.
    useEffect(() => {
        let raf = 0;
        let last = 0;
        const tick = (time: number) => {
            if (time - last > 66 && sessionRef.current) {
                last = time;
                setHud(sessionRef.current.getHud());
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    return (
        <div className="kk-arena" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            <Canvas
                data-jelly-zone="playfield"
                shadows
                // Phones render at 1-1.5x: a 3x retina canvas with shadows is what
                // drops mobile Safari/Android to single-digit FPS.
                dpr={isMobile ? [1, 1.5] : [1, 2]}
                gl={createKowloonRenderer}
                onCreated={({ gl }) => {
                    const canvas = gl.domElement as HTMLCanvasElement;
                    canvas.style.touchAction = 'none';
                    // A backgrounded mobile tab can lose its GL context. Prevent the
                    // default so a restore is possible, and tell the player instead of
                    // leaving a frozen canvas.
                    canvas.addEventListener('webglcontextlost', (e) => {
                        e.preventDefault();
                        setGlLost(true);
                    });
                    canvas.addEventListener('webglcontextrestored', () => setGlLost(false));
                }}
                camera={{ position: [0, 9, 15], fov: 50, near: 0.1, far: 120 }}
            >
                {session && <Arena3D session={session} seatIds={seatIds} />}
                {session?.training && <TrainingOverlay session={session} />}
            </Canvas>

            {glLost && (
                <div
                    role="alert"
                    style={{
                        position: 'absolute', inset: 0, zIndex: 50, display: 'grid', placeItems: 'center',
                        background: 'rgba(0,0,0,0.75)', color: '#ffcc00', textAlign: 'center', padding: 24,
                    }}
                >
                    <div>
                        <p style={{ marginBottom: 16 }}>
                            {t('graphics-lost', { defaultValue: 'Graphics were interrupted by your device.' })}
                        </p>
                        <button
                            type="button"
                            onClick={() => setPhase('menu')}
                            style={{ minHeight: 44, minWidth: 160, padding: '0 20px', border: '2px solid #ffcc00', color: '#ffcc00', background: 'transparent' }}
                        >
                            {t('back-to-menu', { defaultValue: 'Back to menu' })}
                        </button>
                    </div>
                </div>
            )}
            {hud && <HUD hud={hud} />}
            {session?.training && <TrainingPanel training={session.training} />}
            {isMobile && input && <MobileControls input={input} />}

            {!isMobile && (
                <div className="kk-controls-hint">
                    <span><kbd>WASD</kbd> {t('move', { defaultValue: 'Move' })}</span>
                    <span><kbd>Space</kbd> {t('block', { defaultValue: 'Block' })}</span>
                    <span><kbd>J K L U</kbd> {t('punches-game-view', { defaultValue: 'Punches' })}</span>
                </div>
            )}
        </div>
    );
}
