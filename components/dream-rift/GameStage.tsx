'use client';

/**
 * GameStage — mounts the canvas, spins up a GameSession for the run, wires
 * resize/letterbox and DPR, and renders the in-run overlays (stage banner,
 * dialogue, pause) plus the mobile touch controls. The session itself drives
 * the render loop; React only paints overlays on state changes.
 */

import { useEffect, useRef } from 'react';
import { GameSession, type RosterEntry } from '@/lib/dream-rift/net/session';
import type { Transport } from '@/lib/dream-rift/net/transport';
import type { Difficulty } from '@/lib/dream-rift/types';
import { useDreamRift } from '@/lib/dream-rift/store';
import { useRuntime } from './runtime';
import { MobileControls } from './MobileControls';
import { DialogueOverlay, PauseOverlay, StageBanner } from './Overlays';

export interface StartInfo {
    transport: Transport;
    roster: RosterEntry[];
    difficulty: Difficulty;
    seed: number;
}

export function GameStage({ start, onExit }: { start: StartInfo; onExit: () => void }) {
    const { music, sfx, input } = useRuntime();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const sessionRef = useRef<GameSession | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        if (!canvas || !wrap) return;

        const hiKey = `dr.hi.${start.difficulty}`;
        const hiScore = Number((typeof localStorage !== 'undefined' && localStorage.getItem(hiKey)) || 0);

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

    const paused = useDreamRift((s) => s.paused);
    const showHitbox = useDreamRift((s) => s.showHitbox);
    useEffect(() => {
        sessionRef.current?.setShowHitbox(showHitbox);
    }, [showHitbox]);

    return (
        <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-black">
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ touchAction: 'none' }} />
            <StageBanner />
            <DialogueOverlay />
            {paused && <PauseOverlay onResume={() => useDreamRift.getState().setPaused(false)} onQuit={onExit} />}
            <MobileControls input={input} />
        </div>
    );
}
