'use client';

/**
 * Shared client runtime for Dream Rift — a single MusicController, Sfx and
 * InputManager provided to every screen via context, plus the loaded external
 * sprite assets (from public/dream-rift/manifest.json). Menu music, SFX, input
 * and loaded art survive screen changes and are reused by the game session.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { MusicController } from '@/lib/dream-rift/sound/musicController';
import { Sfx } from '@/lib/dream-rift/sound/sfx';
import { InputManager } from '@/lib/dream-rift/input';
import { loadManifest, loadSpriteAssets, type LoadedSpriteAssets } from '@/lib/dream-rift/assets';
import { useDreamRift } from '@/lib/dream-rift/store';

export interface DreamRiftRuntime {
    music: MusicController;
    sfx: Sfx;
    input: InputManager;
    assets: LoadedSpriteAssets | null;
}

const RuntimeContext = createContext<DreamRiftRuntime | null>(null);

export function useRuntime(): DreamRiftRuntime {
    const ctx = useContext(RuntimeContext);
    if (!ctx) throw new Error('useRuntime must be used within DreamRiftRuntimeProvider');
    return ctx;
}

export function DreamRiftRuntimeProvider({ children }: { children: ReactNode }) {
    const ref = useRef<{ music: MusicController; sfx: Sfx; input: InputManager } | null>(null);
    if (!ref.current) {
        ref.current = { music: new MusicController(), sfx: new Sfx(), input: new InputManager() };
    }
    const base = ref.current;
    const [assets, setAssets] = useState<LoadedSpriteAssets | null>(null);

    const musicOn = useDreamRift((s) => s.musicOn);
    const sfxOn = useDreamRift((s) => s.sfxOn);
    const musicVol = useDreamRift((s) => s.musicVol);
    const sfxVol = useDreamRift((s) => s.sfxVol);
    const bindings = useDreamRift((s) => s.bindings);

    // load external assets + music manifest once
    useEffect(() => {
        let alive = true;
        loadManifest().then(async (manifest) => {
            if (!alive) return;
            base.music.setTracks(manifest?.music);
            const loaded = await loadSpriteAssets(manifest);
            if (alive) setAssets(loaded);
        });
        return () => {
            alive = false;
        };
    }, [base]);

    useEffect(() => {
        base.music.setEnabled(musicOn);
        base.music.setVolume(musicVol);
    }, [base, musicOn, musicVol]);
    useEffect(() => {
        base.sfx.setEnabled(sfxOn);
        base.sfx.setVolume(sfxVol);
    }, [base, sfxOn, sfxVol]);
    useEffect(() => {
        base.input.setBindings(bindings);
    }, [base, bindings]);

    useEffect(() => {
        const r = base;
        return () => {
            r.music.dispose();
            r.sfx.dispose();
            r.input.unbind();
        };
    }, [base]);

    return <RuntimeContext.Provider value={{ ...base, assets }}>{children}</RuntimeContext.Provider>;
}
