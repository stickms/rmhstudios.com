import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { createKowloonRenderer, extendKowloonThree } from '@/lib/kowloon-knockout/render/webgpu';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
    currentBackendIsWebGPU, decideRecovery, markForceWebGL, renderHealthSnapshot, resetRenderHealth, shouldForceWebGL,
} from '@/lib/kowloon-knockout/render/health';
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

/** The renderer failed to start or threw while running (no WebGL 2 at all, a GPU
 *  process that refuses a second context, a node material that will not compile).
 *  Without this the error climbs to the page-level boundary, which unmounts the
 *  whole game under a "crashed" card carrying a raw `TypeError`. Here the player
 *  is told what happened and the first failure on WebGPU gets a WebGL 2 retry. */
class GraphicsBoundary extends Component<{ onError: (e: unknown) => void; children: ReactNode }, { error: boolean }> {
    state = { error: false };
    static getDerivedStateFromError() { return { error: true }; }
    componentDidCatch(error: unknown) { this.props.onError(error); }
    render() {
        return this.state.error ? null : this.props.children;
    }
}

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
    // Render watchdog: the sim and HUD keep running when the canvas stops
    // painting, so a bumped key remounts the Canvas (on WebGL 2 after a WebGPU
    // failure) and `frozen` is the last resort: tell the player, don't leave a
    // dead picture under a live HUD.
    const [canvasKey, setCanvasKey] = useState(0);
    const [frozen, setFrozen] = useState(false);
    // The renderer could not start (or died with an exception) and WebGL 2 has
    // already been tried: nothing will ever paint, say so.
    const [unavailable, setUnavailable] = useState(false);
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
        // The KO beat before the result screen. Tracked so leaving the match
        // inside those 1.8s (or a new runtime) cannot force the result screen.
        let resultTimer: number | undefined;
        s.onResult((winnerSeat) => {
            const finalHud = s.getHud();
            window.clearTimeout(resultTimer);
            resultTimer = window.setTimeout(() => {
                resultTimer = undefined;
                if (sessionRef.current !== s) return;
                setMatchResult({ winnerSeat, mode: finalHud.mode, fighters: finalHud.fighters });
                setPhase('result');
            }, 1800);
        });
        s.start();

        sessionRef.current = s;
        setSession(s);
        setInput(src);

        return () => {
            window.clearTimeout(resultTimer);
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

    const onGraphicsError = (e: unknown) => {
        console.warn('[kowloon] renderer failed:', e);
        if (!shouldForceWebGL()) {
            // First failure: a fresh canvas on WebGL 2. A canvas that was given a
            // WebGPU context can never be handed a WebGL one, hence the new key.
            markForceWebGL();
            resetRenderHealth(false);
            setCanvasKey((k) => k + 1);
            return;
        }
        setUnavailable(true);
    };

    // Nothing will ever paint: don't leave a match playing out behind the card.
    useEffect(() => {
        if (unavailable) sessionRef.current?.stop();
    }, [unavailable]);

    useEffect(() => {
        if (frozen || unavailable) return;
        // Start the clock at mount: if the renderer never finishes initialising
        // (a hung adapter request), that is a stall too.
        resetRenderHealth(false);
        const id = window.setInterval(() => {
            const action = decideRecovery(renderHealthSnapshot(), performance.now(), {
                backendIsWebGPU: currentBackendIsWebGPU(),
                alreadyForcedWebGL: shouldForceWebGL(),
                hidden: document.hidden,
            });
            if (action === 'force-webgl') {
                console.warn('[kowloon] WebGPU is not painting; restarting the renderer on WebGL 2');
                markForceWebGL();
                // Clear the old renderer's verdict now: the new one takes a moment
                // to init, and its predecessor's failure must not count against it.
                resetRenderHealth(false);
                setCanvasKey((k) => k + 1);
            } else if (action === 'give-up') {
                console.warn('[kowloon] renderer is not painting; showing the recovery card');
                setFrozen(true);
            }
        }, 1000);
        // A tab that was hidden has no frames to judge; start the clock over.
        const onVisible = () => { if (!document.hidden) resetRenderHealth(currentBackendIsWebGPU()); };
        document.addEventListener('visibilitychange', onVisible);
        return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
    }, [frozen, unavailable]);

    return (
        <div className={`kk-arena${isMobile ? ' kk-arena--touch' : ''}`} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            {/* The canvas host leaves the bottom band free in portrait on touch, so the action pad never hides a fighter. */}
            <div className="kk-canvas-host">
            <GraphicsBoundary key={canvasKey} onError={onGraphicsError}>
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
            </GraphicsBoundary>
            </div>

            {(frozen || unavailable) && !glLost && (
                <div role="alert" className="kk-overlay">
                    <div className="kk-overlay__card">
                        <p className="kk-overlay__msg">
                            {unavailable
                                ? t('graphics-unavailable', { defaultValue: '3D graphics could not start on this device.' })
                                : t('graphics-stalled', { defaultValue: 'The picture stopped updating on this device.' })}
                        </p>
                        <div className="kk-overlay__actions">
                            <button type="button" className="kk-overlay__btn" onClick={() => window.location.reload()}>
                                {t('reload', { defaultValue: 'Reload' })}
                            </button>
                            <button type="button" className="kk-overlay__btn" onClick={() => setPhase('menu')}>
                                {t('back-to-menu', { defaultValue: 'Back to menu' })}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {glLost && (
                <div role="alert" className="kk-overlay">
                    <div className="kk-overlay__card">
                        <p className="kk-overlay__msg">
                            {t('graphics-lost', { defaultValue: 'Graphics were interrupted by your device.' })}
                        </p>
                        <div className="kk-overlay__actions">
                            <button type="button" className="kk-overlay__btn" onClick={() => setPhase('menu')}>
                                {t('back-to-menu', { defaultValue: 'Back to menu' })}
                            </button>
                        </div>
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
