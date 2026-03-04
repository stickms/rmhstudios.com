'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

/**
 * Manages two looping HTMLAudioElement tracks (day + night) with crossfade.
 * Starts muted to respect browser autoplay policy.
 * Pauses when pointer lock is lost, resumes on re-lock.
 */
export function useForestAudio(mode: 'day' | 'night', active: boolean) {
    const dayRef = useRef<HTMLAudioElement | null>(null);
    const nightRef = useRef<HTMLAudioElement | null>(null);
    const startedRef = useRef(false);
    const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [muted, setMuted] = useState(true);
    const [volume, setVolumeState] = useState(0.7);

    // Create audio elements once (client-side only)
    useEffect(() => {
        const day = new Audio('/music/ForestExplorer/daytime.mp3');
        day.loop = true;
        day.volume = 0;
        day.preload = 'auto';

        const night = new Audio('/music/ForestExplorer/nighttime.mp3');
        night.loop = true;
        night.volume = 0;
        night.preload = 'auto';

        dayRef.current = day;
        nightRef.current = night;

        return () => {
            day.pause();
            night.pause();
            day.src = '';
            night.src = '';
            dayRef.current = null;
            nightRef.current = null;
            if (fadeRef.current) clearInterval(fadeRef.current);
        };
    }, []);

    // Crossfade between day/night on mode change
    useEffect(() => {
        const day = dayRef.current;
        const night = nightRef.current;
        if (!day || !night || !startedRef.current || muted) return;

        // Clear any in-progress fade
        if (fadeRef.current) clearInterval(fadeRef.current);

        const activeEl = mode === 'day' ? day : night;
        const inactiveEl = mode === 'day' ? night : day;
        const targetVol = volume;
        const steps = 50;
        const stepMs = 50; // 50 steps × 50ms = 2.5s crossfade
        let step = 0;

        const startActive = activeEl.volume;
        const startInactive = inactiveEl.volume;

        fadeRef.current = setInterval(() => {
            step++;
            const t = step / steps;
            activeEl.volume = startActive + (targetVol - startActive) * t;
            inactiveEl.volume = startInactive * (1 - t);
            if (step >= steps) {
                activeEl.volume = targetVol;
                inactiveEl.volume = 0;
                if (fadeRef.current) clearInterval(fadeRef.current);
                fadeRef.current = null;
            }
        }, stepMs);
    }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

    // Handle mute/unmute — lazy-start on first unmute
    useEffect(() => {
        const day = dayRef.current;
        const night = nightRef.current;
        if (!day || !night) return;

        if (!muted && !startedRef.current) {
            // First unmute: start both tracks, set correct volumes
            startedRef.current = true;
            day.volume = mode === 'day' ? volume : 0;
            night.volume = mode === 'night' ? volume : 0;
            day.play().catch(() => {});
            night.play().catch(() => {});
        } else if (!muted && startedRef.current) {
            // Unmuting after being muted
            const activeEl = mode === 'day' ? day : night;
            activeEl.volume = volume;
            day.play().catch(() => {});
            night.play().catch(() => {});
        } else if (muted) {
            day.volume = 0;
            night.volume = 0;
        }
    }, [muted]); // eslint-disable-line react-hooks/exhaustive-deps

    // Pause/resume on pointer lock state
    useEffect(() => {
        const day = dayRef.current;
        const night = nightRef.current;
        if (!day || !night || !startedRef.current) return;

        if (!active) {
            day.pause();
            night.pause();
        } else if (!muted) {
            day.play().catch(() => {});
            night.play().catch(() => {});
        }
    }, [active, muted]);

    // Volume changes apply immediately to the active track
    const setVolume = useCallback((v: number) => {
        const clamped = Math.max(0, Math.min(1, v));
        setVolumeState(clamped);
        if (!muted && startedRef.current) {
            const day = dayRef.current;
            const night = nightRef.current;
            if (day && night) {
                // Only adjust the currently-active track
                if (day.volume > 0) day.volume = clamped;
                if (night.volume > 0) night.volume = clamped;
            }
        }
    }, [muted]);

    const toggleMute = useCallback(() => {
        setMuted((m) => !m);
    }, []);

    return { muted, toggleMute, volume, setVolume };
}
