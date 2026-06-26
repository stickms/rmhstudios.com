'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { createKowloonRenderer, extendKowloonThree } from '@/lib/kowloon-knockout/render/webgpu';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import { useIsMobile } from '@/lib/studio/hooks/useIsMobile';
import { LocalInputSource } from '@/lib/kowloon-knockout/game/input';
import {
    createLocalSession, createHostSession, createGuestSession,
    type GameSession, type HudState,
} from '@/lib/kowloon-knockout/net/session';
import Arena3D from './Arena3D';
import HUD from '@/components/kowloon-knockout/HUD';
import MobileControls from '@/components/kowloon-knockout/MobileControls';

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
                shadows
                dpr={[1, 2]}
                gl={createKowloonRenderer}
                camera={{ position: [0, 9, 15], fov: 50, near: 0.1, far: 120 }}
            >
                {session && <Arena3D session={session} seatIds={seatIds} />}
            </Canvas>

            {hud && <HUD hud={hud} />}
            {isMobile && input && <MobileControls input={input} />}

            {!isMobile && (
                <div className="kk-controls-hint">
                    <span><kbd>WASD</kbd> {t('move', { defaultValue: 'Move' })}</span>
                    <span><kbd>Space</kbd> {t('block', { defaultValue: 'Block' })}</span>
                    <span><kbd>J K L U</kbd> {t('punches', { defaultValue: 'Punches' })}</span>
                </div>
            )}
        </div>
    );
}
