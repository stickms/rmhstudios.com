'use client';

import { Canvas } from '@react-three/fiber';
import { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TimeOfDay } from '../shared/types';
import { useForestAudio } from '../audio/useForestAudio';
import { useGardenStore } from '@/lib/forest-explorer/gardenStore';
import { stageOf } from '@/lib/forest-explorer/garden';
import { ExploreScene } from './ExploreScene';

export function ExploreGame() {
    const [locked, setLocked] = useState(false);
    const [mode, setMode] = useState<TimeOfDay>('day');
    const [flashlightOn, setFlashlightOn] = useState(false);
    const night = mode === 'night';

    const { t } = useTranslation("c-forest-explorer");
    const { muted, toggleMute, volume, setVolume } = useForestAudio(mode, locked);

    const gardenToast = useGardenStore(s => s.toast);
    const plants = useGardenStore(s => s.plants);
    const nowTick = useGardenStore(s => s.nowTick);
    const bloomCount = plants.filter(p => stageOf(p, nowTick || Date.now()) === 'bloom').length;

    const nightRef  = useRef(night);
    const lockedRef = useRef(locked);
    useEffect(() => { nightRef.current  = night;  }, [night]);
    useEffect(() => { lockedRef.current = locked; }, [locked]);

    useEffect(() => {
        const fn = (e: KeyboardEvent) => {
            if (e.code === 'KeyF' && nightRef.current && lockedRef.current)
                setFlashlightOn((f) => !f);
        };
        window.addEventListener('keydown', fn);
        return () => window.removeEventListener('keydown', fn);
    }, []);

    useEffect(() => { if (!night) setFlashlightOn(false); }, [night]);

    return (
        <div className="w-full h-full relative select-none" style={{ touchAction: 'none' }}>
            <Canvas
                shadows
                gl={{ antialias: true }}
                camera={{ fov: 75, near: 0.1, far: 600 }}
            >
                <ExploreScene
                    onLock={() => setLocked(true)}
                    onUnlock={() => setLocked(false)}
                    night={night}
                    flashlightOn={flashlightOn}
                    locked={locked}
                />
            </Canvas>

            {!locked && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
                    <div className="text-center text-white px-8 py-9 rounded-2xl bg-black/30 border border-white/10 max-w-xs w-full space-y-3">
                        <div className="text-5xl">🌲</div>
                        <h1 className="text-3xl font-bold tracking-wide text-green-200">
                            {t("forest-explorer-title", { defaultValue: "Forest Explorer" })}
                        </h1>
                        <p className="text-green-300/70 text-sm">{t("forest-explorer-subtitle", { defaultValue: "Wander a peaceful ancient forest" })}</p>

                        <div className="flex gap-2 pt-1">
                            <button
                                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                                    mode === 'day'
                                        ? 'bg-amber-500/80 text-white'
                                        : 'bg-white/10 text-zinc-400 hover:bg-white/15'
                                }`}
                                onClick={() => setMode('day')}
                            >
                                {t("day", { defaultValue: "☀ Day" })}
                            </button>
                            <button
                                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                                    mode === 'night'
                                        ? 'bg-indigo-700/80 text-white'
                                        : 'bg-white/10 text-zinc-400 hover:bg-white/15'
                                }`}
                                onClick={() => setMode('night')}
                            >
                                {t("night", { defaultValue: "☾ Night" })}
                            </button>
                        </div>

                        <div className="pt-1 space-y-1 text-xs text-zinc-400">
                            <p>
                                <span className="text-zinc-200">WASD</span>{t("hint-walk", { defaultValue: " — walk" })} &nbsp;·&nbsp;{' '}
                                <span className="text-zinc-200">Shift</span>{t("hint-run", { defaultValue: " — run" })} &nbsp;·&nbsp;{' '}
                                <span className="text-zinc-200">Space</span>{t("hint-jump", { defaultValue: " — jump" })}
                            </p>
                            <p>
                                <span className="text-zinc-200">Mouse</span>{t("hint-look", { defaultValue: " — look" })} &nbsp;·&nbsp;{' '}
                                <span className="text-zinc-200">ESC</span>{t("hint-pause", { defaultValue: " — pause" })}
                            </p>
                            <p>
                                <span className="text-green-300">G</span>{t("hint-plant", { defaultValue: " — plant a seed" })} &nbsp;·&nbsp;{' '}
                                <span className="text-green-300">E</span>{t("hint-water", { defaultValue: " — water plants" })}
                            </p>
                        </div>

                        {plants.length > 0 && (
                            <p className="text-green-300/60 text-xs">
                                {t("garden-status", { defaultValue: "🌼 Your garden: {{count}} plants, {{blooms}} blooming — they grow even while you're away", count: plants.length, blooms: bloomCount })}
                            </p>
                        )}
                        <button
                            className={`w-full py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                                muted
                                    ? 'bg-white/10 text-zinc-400 hover:bg-white/15'
                                    : 'bg-green-700/60 text-green-200'
                            }`}
                            onClick={toggleMute}
                        >
                            {muted ? t("sound-off", { defaultValue: "🔇 Sound Off" }) : t("sound-on", { defaultValue: "🔊 Sound On" })}
                        </button>
                        {!muted && (
                            <div className="flex items-center gap-2 px-1">
                                <span className="text-xs text-zinc-500">🔈</span>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={volume}
                                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                                    className="flex-1 h-1.5 appearance-none bg-white/20 rounded-full accent-green-500 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-400"
                                />
                                <span className="text-xs text-zinc-500">🔊</span>
                            </div>
                        )}

                        <button
                            className="mt-2 w-full py-2.5 bg-green-800 hover:bg-green-700 active:bg-green-900 text-green-100 rounded-xl font-medium transition-colors text-sm cursor-pointer"
                            onClick={() => {
                                const canvas = document.querySelector('canvas');
                                canvas?.click();
                            }}
                        >
                            {t("enter-the-forest", { defaultValue: "Enter the Forest" })}
                        </button>
                    </div>
                </div>
            )}

            {/* Garden toast */}
            {locked && gardenToast && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                    <div className="px-4 py-2 rounded-xl bg-green-950/70 backdrop-blur-sm border border-green-600/30 text-green-200 text-sm">
                        {gardenToast}
                    </div>
                </div>
            )}

            {/* Garden counter */}
            {locked && plants.length > 0 && (
                <div className="absolute top-3 left-14 z-50">
                    <span className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-black/50 backdrop-blur-sm border border-green-700/30 text-green-300/80">
                        🌼 {t("garden-chip", { defaultValue: "{{count}} planted · {{blooms}} blooming", count: plants.length, blooms: bloomCount })}
                    </span>
                </div>
            )}

            {locked && (
                <div className="absolute top-3 right-3 z-50 flex items-center gap-2">
                    {night && (
                        <span
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border backdrop-blur-sm transition-colors ${
                                flashlightOn
                                    ? 'bg-amber-500/30 border-amber-400/40 text-amber-200'
                                    : 'bg-black/50 border-white/10 text-white/40'
                            }`}
                        >
                            {flashlightOn ? t("flashlight-on", { defaultValue: "🔦 ON" }) : t("flashlight-off", { defaultValue: "🔦 OFF" })}
                        </span>
                    )}
                    <button
                        className="px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-sm border border-white/10 text-white/60 hover:text-white text-xs font-medium transition-colors cursor-pointer"
                        onClick={() => setMode((m) => m === 'day' ? 'night' : 'day')}
                    >
                        {night ? t("day", { defaultValue: "☀ Day" }) : t("night", { defaultValue: "☾ Night" })}
                    </button>
                    <button
                        className="px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-sm border border-white/10 text-white/60 hover:text-white text-xs font-medium transition-colors cursor-pointer"
                        onClick={toggleMute}
                    >
                        {muted ? '🔇' : '🔊'}
                    </button>
                </div>
            )}

            {locked && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <svg width="18" height="18" viewBox="0 0 18 18">
                        <line x1="9" y1="2" x2="9" y2="16" stroke="white" strokeWidth="1" strokeOpacity="0.45" />
                        <line x1="2" y1="9" x2="16" y2="9" stroke="white" strokeWidth="1" strokeOpacity="0.45" />
                    </svg>
                </div>
            )}

            {locked && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/30 text-xs tracking-widest whitespace-nowrap">
                    {night
                        ? t("locked-hint-night-v2", { defaultValue: "WASD · SHIFT run · SPACE jump · F flashlight · G plant · E water · ESC pause" })
                        : t("locked-hint-day-v2", { defaultValue: "WASD · SHIFT run · SPACE jump · G plant · E water · ESC pause" })}
                </div>
            )}
        </div>
    );
}
