'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import type { ActId } from '@/lib/forest-explorer/types';

/**
 * Per-act audio track management for Story Mode.
 * Crossfades between act tracks on act change.
 * Also provides SFX methods for puzzle/journal/portal events.
 *
 * Audio files expected at:
 *   /music/ForestExplorer/story_act1.mp3
 *   /music/ForestExplorer/story_act2.mp3
 *   /music/ForestExplorer/story_act3.mp3
 *   /sfx/ForestExplorer/puzzle_solve.mp3
 *   /sfx/ForestExplorer/journal_discover.mp3
 *   /sfx/ForestExplorer/portal_activate.mp3
 */

const ACT_TRACKS: Record<ActId, string> = {
    act1: '/music/ForestExplorer/story_act1.mp3',
    act2: '/music/ForestExplorer/story_act2.mp3',
    act3: '/music/ForestExplorer/story_act3.mp3',
};

const SFX_PATHS = {
    puzzleSolve: '/sfx/ForestExplorer/puzzle_solve.mp3',
    journalDiscover: '/sfx/ForestExplorer/journal_discover.mp3',
    portalActivate: '/sfx/ForestExplorer/portal_activate.mp3',
} as const;

export function useStoryAudio(currentAct: ActId, active: boolean) {
    const tracksRef = useRef<Record<ActId, HTMLAudioElement | null>>({
        act1: null,
        act2: null,
        act3: null,
    });
    const sfxRef = useRef<Record<string, HTMLAudioElement>>({});
    const startedRef = useRef(false);
    const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [muted, setMuted] = useState(true);
    const [volume, setVolumeState] = useState(0.5);

    // Create audio elements
    useEffect(() => {
        const tracks = {} as Record<ActId, HTMLAudioElement>;
        for (const [act, path] of Object.entries(ACT_TRACKS) as [ActId, string][]) {
            const el = new Audio(path);
            el.loop = true;
            el.volume = 0;
            el.preload = 'none'; // Only preload current act
            tracks[act] = el;
        }
        tracks[currentAct].preload = 'auto';
        tracksRef.current = tracks;

        // Preload SFX
        const sfx: Record<string, HTMLAudioElement> = {};
        for (const [key, path] of Object.entries(SFX_PATHS)) {
            const el = new Audio(path);
            el.preload = 'auto';
            el.volume = 0.6;
            sfx[key] = el;
        }
        sfxRef.current = sfx;

        return () => {
            for (const el of Object.values(tracks)) {
                el.pause();
                el.src = '';
            }
            if (fadeRef.current) clearInterval(fadeRef.current);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Crossfade to current act track
    useEffect(() => {
        const tracks = tracksRef.current;
        if (!startedRef.current || muted) return;

        if (fadeRef.current) clearInterval(fadeRef.current);

        const targetEl = tracks[currentAct];
        if (!targetEl) return;
        targetEl.preload = 'auto';
        targetEl.play().catch(() => {});

        const steps = 40;
        const stepMs = 50; // 2s crossfade
        let step = 0;

        const startVols: Record<string, number> = {};
        for (const [act, el] of Object.entries(tracks) as [ActId, HTMLAudioElement | null][]) {
            if (el) startVols[act] = el.volume;
        }

        fadeRef.current = setInterval(() => {
            step++;
            const t = step / steps;
            for (const [act, el] of Object.entries(tracks) as [ActId, HTMLAudioElement | null][]) {
                if (!el) continue;
                if (act === currentAct) {
                    el.volume = (startVols[act] ?? 0) + (volume - (startVols[act] ?? 0)) * t;
                } else {
                    el.volume = (startVols[act] ?? 0) * (1 - t);
                    if (step >= steps) el.pause();
                }
            }
            if (step >= steps) {
                if (fadeRef.current) clearInterval(fadeRef.current);
                fadeRef.current = null;
            }
        }, stepMs);
    }, [currentAct]); // eslint-disable-line react-hooks/exhaustive-deps

    // Mute/unmute
    useEffect(() => {
        const tracks = tracksRef.current;
        const activeEl = tracks[currentAct];
        if (!activeEl) return;

        if (!muted && !startedRef.current) {
            startedRef.current = true;
            activeEl.volume = volume;
            activeEl.play().catch(() => {});
        } else if (!muted && startedRef.current) {
            activeEl.volume = volume;
            activeEl.play().catch(() => {});
        } else if (muted) {
            for (const el of Object.values(tracks)) {
                if (el) el.volume = 0;
            }
        }
    }, [muted]); // eslint-disable-line react-hooks/exhaustive-deps

    // Pause/resume
    useEffect(() => {
        const tracks = tracksRef.current;
        if (!startedRef.current) return;

        if (!active) {
            for (const el of Object.values(tracks)) {
                if (el) el.pause();
            }
        } else if (!muted) {
            const activeEl = tracks[currentAct];
            if (activeEl) activeEl.play().catch(() => {});
        }
    }, [active, muted, currentAct]);

    const setVolume = useCallback((v: number) => {
        const clamped = Math.max(0, Math.min(1, v));
        setVolumeState(clamped);
        if (!muted && startedRef.current) {
            const activeEl = tracksRef.current[currentAct];
            if (activeEl && activeEl.volume > 0) {
                activeEl.volume = clamped;
            }
        }
    }, [muted, currentAct]);

    const toggleMute = useCallback(() => setMuted(m => !m), []);

    // SFX player
    const playSfx = useCallback((sfxKey: keyof typeof SFX_PATHS) => {
        if (muted) return;
        const el = sfxRef.current[sfxKey];
        if (el) {
            el.currentTime = 0;
            el.volume = Math.min(volume + 0.1, 1);
            el.play().catch(() => {});
        }
    }, [muted, volume]);

    return { muted, toggleMute, volume, setVolume, playSfx };
}
