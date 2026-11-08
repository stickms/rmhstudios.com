'use client';

/**
 * GameStage — mounts the canvas, spins up a GameSession for the run, wires
 * resize/letterbox and DPR, and renders the in-run overlays (stage banner,
 * dialogue, pause) plus the mobile touch controls. The session itself drives
 * the render loop; React only paints overlays on state changes.
 */

import { useEffect, useRef, useState } from 'react';
import { GameSession, type RosterEntry } from '@/lib/dream-rift/net/session';
import { loadHiScore } from '@/lib/dream-rift/highscore';
import type { Transport } from '@/lib/dream-rift/net/transport';
import type { Difficulty } from '@/lib/dream-rift/types';
import type { PracticeOutcome, PracticeTarget } from '@/lib/dream-rift/practice';
import { useDreamRift } from '@/lib/dream-rift/store';
import { useGameSession } from '@/hooks/useGameSession';
import { setPeerLeftHandler, setResumeHandlers } from '@/lib/dream-rift/net/connection';
import { PEER_GRACE_MS } from '@/lib/shared/realtime/types';
import { useRuntime } from './runtime';
import { MobileControls } from './MobileControls';
import { PhoneControllerHost } from '@/components/party/PhoneControllerHost';
import { DialogueOverlay, PauseOverlay, StageBanner } from './Overlays';

export interface StartInfo {
    transport: Transport;
    roster: RosterEntry[];
    difficulty: Difficulty;
    seed: number;
    /** Spell practice target; the run is solo, unscored and ends with the card. */
    practice?: PracticeTarget & { onEnd: (o: PracticeOutcome) => void };
}

export function GameStage({ start, onExit, onQuitGame }: { start: StartInfo; onExit: () => void; onQuitGame: () => void }) {
    const { music, sfx, input, assets } = useRuntime();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const sessionRef = useRef<GameSession | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        if (!canvas || !wrap) return;

        // Show the local player's personal best for THEIR character on this
        // difficulty, not a difficulty-wide best shared across all characters.
        const localChar = (start.roster.find((r) => r.isLocal) ?? start.roster[0])?.charId ?? 'bllm';
        const hiScore = loadHiScore(localChar, start.difficulty);

        void music.resume();
        void sfx.resume();
        input.bind();

        const session = new GameSession({
            transport: start.transport,
            difficulty: start.difficulty,
            seed: start.seed,
            roster: start.roster,
            canvas,
            music,
            sfx,
            input,
            hiScore,
            spriteAssets: assets,
            practice: start.practice,
        });
        sessionRef.current = session;

        const applyResize = () => {
            const rect = wrap.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            session.resize(rect.width, rect.height, dpr);
        };
        applyResize();
        const ro = new ResizeObserver(applyResize);
        ro.observe(wrap);
        window.addEventListener('orientationchange', applyResize);

        session.start();

        return () => {
            ro.disconnect();
            window.removeEventListener('orientationchange', applyResize);
            session.destroy();
            input.unbind();
            input.clearVirtual();
            sessionRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // The host client is the only simulation (guests just render its snapshots),
    // so when the host vanishes mid-run the stage can never advance again. Send
    // guests back to the lobby browser with a clear message instead of leaving
    // them on a frozen stage.
    useEffect(() => {
        if (start.practice || start.transport.isHost) return;
        const hostSlot = start.roster.find((r) => r.isHost)?.slot;
        if (hostSlot === undefined) return;
        setPeerLeftHandler((slot) => {
            if (slot !== hostSlot) return;
            useDreamRift.getState().setError('The host left, so the run ended.');
            onExit();
        });
        return () => setPeerLeftHandler(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // A dropped socket is not the end of the run: the hub holds the seat for PEER_GRACE_MS
    // and hands it to the reconnected socket (RESUME), so the squad never sees a frozen ghost.
    // Only when the seat cannot be recovered (window over, lobby closed) do we leave the run.
    const connection = useDreamRift((s) => s.connection);
    const wasConnected = useRef(false);
    const [reconnecting, setReconnecting] = useState(false);
    useEffect(() => {
        if (start.practice || useDreamRift.getState().mode !== 'multi') return;
        const giveUp = () => {
            useDreamRift.getState().setError('Connection lost, so you left the run.');
            onExit();
        };
        setResumeHandlers(() => setReconnecting(false), giveUp);
        return () => setResumeHandlers(null, null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        if (start.practice || useDreamRift.getState().mode !== 'multi') return;
        if (connection === 'connected') {
            wasConnected.current = true;
            return;
        }
        if (!wasConnected.current) return;
        setReconnecting(true);
        // The hub frees the seat after PEER_GRACE_MS; a little slack for the last attempt's round trip.
        const timer = window.setTimeout(() => {
            useDreamRift.getState().setError('Connection lost, so you left the run.');
            onExit();
        }, PEER_GRACE_MS + 3000);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connection]);

    // Session contract: screen on during a stage; a solo run pauses when the
    // tab hides (co-op can't pause for everyone, so it only keeps the screen on).
    useGameSession({
        id: 'dream-rift',
        active: true,
        onPause: () => {
            const s = useDreamRift.getState();
            if (s.mode === 'single' && !s.paused) s.setPaused(true);
        },
    });

    const paused = useDreamRift((s) => s.paused);
    const showHitbox = useDreamRift((s) => s.showHitbox);
    useEffect(() => {
        sessionRef.current?.setShowHitbox(showHitbox);
    }, [showHitbox]);

    return (
        <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-black">
            <canvas
                data-jelly-zone="playfield"
                ref={canvasRef}
                className="absolute inset-0 h-full w-full"
                // `translateZ(0)` + `will-change` promote the canvas to its own GPU
                // compositor layer so blits are hardware-accelerated and stay smooth
                // at high refresh rates.
                style={{ touchAction: 'none', transform: 'translateZ(0)', willChange: 'transform' }}
            />
            <StageBanner />
            <DialogueOverlay />
            {reconnecting && (
                <div
                    role="status"
                    className="pointer-events-none absolute inset-x-0 top-3 z-20 mx-auto w-fit rounded-sm border border-[rgba(231,205,140,0.4)] bg-black/70 px-4 py-2 text-sm text-[color:var(--dr-cream)]"
                >
                    Connection lost. Reconnecting to your squad…
                </div>
            )}
            {paused && <PauseOverlay onResume={() => useDreamRift.getState().setPaused(false)} onQuit={onExit} onQuitGame={onQuitGame} />}
            <MobileControls input={input} />
            <PhoneControllerHost sink={input} />
        </div>
    );
}
