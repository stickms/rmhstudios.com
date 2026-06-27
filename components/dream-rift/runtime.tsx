'use client';

/**
 * Shared client runtime for Dream Rift — a single Music, Sfx and InputManager
 * instance provided to every screen via context, so menu music, SFX and input
 * survive screen changes and are reused by the game session.
 */

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { Music } from '@/lib/dream-rift/sound/music';
import { Sfx } from '@/lib/dream-rift/sound/sfx';
import { InputManager } from '@/lib/dream-rift/input';
import { useDreamRift } from '@/lib/dream-rift/store';

export interface DreamRiftRuntime {
    music: Music;
    sfx: Sfx;
    input: InputManager;
}

const RuntimeContext = createContext<DreamRiftRuntime | null>(null);

export function useRuntime(): DreamRiftRuntime {
    const ctx = useContext(RuntimeContext);
    if (!ctx) throw new Error('useRuntime must be used within DreamRiftRuntimeProvider');
    return ctx;
}

export function DreamRiftRuntimeProvider({ children }: { children: ReactNode }) {
    const ref = useRef<DreamRiftRuntime | null>(null);
    if (!ref.current) {
        ref.current = { music: new Music(), sfx: new Sfx(), input: new InputManager() };
    }
    const runtime = ref.current;

    const musicOn = useDreamRift((s) => s.musicOn);
    const sfxOn = useDreamRift((s) => s.sfxOn);
    const musicVol = useDreamRift((s) => s.musicVol);
    const sfxVol = useDreamRift((s) => s.sfxVol);
    const bindings = useDreamRift((s) => s.bindings);

    useEffect(() => {
        runtime.input.setBindings(bindings);
    }, [runtime, bindings]);

    useEffect(() => {
        runtime.music.setEnabled(musicOn);
        runtime.music.setVolume(musicVol);
    }, [runtime, musicOn, musicVol]);
    useEffect(() => {
        runtime.sfx.setEnabled(sfxOn);
        runtime.sfx.setVolume(sfxVol);
    }, [runtime, sfxOn, sfxVol]);

    useEffect(() => {
        const r = runtime;
        return () => {
            r.music.dispose();
            r.sfx.dispose();
            r.input.unbind();
        };
    }, [runtime]);

    return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}
