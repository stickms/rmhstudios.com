'use client';

/**
 * In-run overlays: the stage-intro banner, the visual-novel dialogue box (with
 * procedurally-drawn portraits), the pause menu and the end-of-run results.
 */

import { useDreamRift } from '@/lib/dream-rift/store';
import { CHARACTERS } from '@/lib/dream-rift/render/sprites';
import type { PlayerId } from '@/lib/dream-rift/types';
import { useRuntime } from './runtime';
import { SheetPortrait } from './SheetPortrait';

export function DialogueOverlay() {
    const dialogue = useDreamRift((s) => s.dialogue);
    const { input } = useRuntime();
    if (!dialogue) return null;

    const portraitUrl = dialogue.speakerChar
        ? CHARACTERS[dialogue.speakerChar as PlayerId].sheet
        : `/dream-rift/sprites/bosses/${dialogue.bossSprite}.png`;
    const accent = dialogue.speakerChar ? CHARACTERS[dialogue.speakerChar as PlayerId].accent : '#d7a0ff';

    const advance = () => {
        input.setButton('shot', true);
        setTimeout(() => input.setButton('shot', false), 60);
    };

    return (
        <button
            type="button"
            onClick={advance}
            className="absolute inset-0 z-30 flex cursor-pointer flex-col justify-end"
        >
            <div className="pointer-events-none flex items-end justify-between px-2 md:px-8">
                {dialogue.speakerSide === 'left' && (
                    <SheetPortrait url={portraitUrl} frame={1} size={170} className="drop-shadow-[0_0_18px_rgba(0,0,0,0.7)]" />
                )}
                <div className="flex-1" />
                {dialogue.speakerSide === 'right' && (
                    <SheetPortrait url={portraitUrl} frame={1} size={170} className="-scale-x-100 drop-shadow-[0_0_18px_rgba(0,0,0,0.7)]" />
                )}
            </div>
            <div className="m-2 mb-6 rounded-xl border border-white/15 bg-black/80 p-4 backdrop-blur md:mx-16">
                <div className="mb-1 text-sm font-bold tracking-wide" style={{ color: accent }}>
                    {dialogue.speakerName}
                </div>
                <p className="min-h-[3rem] text-sm leading-relaxed text-white/90 md:text-base">{dialogue.text}</p>
                <div className="mt-2 flex items-center justify-between text-[11px] text-white/40">
                    <span>
                        {dialogue.index + 1} / {dialogue.total}
                    </span>
                    <span className="animate-pulse">▶ tap / Z to continue</span>
                </div>
            </div>
        </button>
    );
}

export function StageBanner() {
    const banner = useDreamRift((s) => s.stageBanner);
    if (!banner) return null;
    return (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="animate-[fadeIn_0.4s_ease] text-center">
                <div className="text-3xl font-black tracking-widest text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] md:text-5xl">
                    {banner.title}
                </div>
                <div className="mt-1 text-lg tracking-[0.3em] text-white/70 md:text-2xl">{banner.subtitle}</div>
            </div>
        </div>
    );
}

export function PauseOverlay({ onResume, onQuit }: { onResume: () => void; onQuit: () => void }) {
    const { musicOn, sfxOn, setMusicOn, setSfxOn, musicVol, sfxVol, setMusicVol, setSfxVol, showHitbox, setShowHitbox } = useDreamRift();
    return (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="w-72 rounded-2xl border border-fuchsia-400/30 bg-[#120a22]/95 p-6 shadow-2xl">
                <h2 className="mb-4 text-center text-xl font-black tracking-widest text-white">PAUSED</h2>
                <div className="space-y-3 text-sm">
                    <label className="flex items-center justify-between text-white/80">
                        Music
                        <input type="checkbox" checked={musicOn} onChange={(e) => setMusicOn(e.target.checked)} />
                    </label>
                    <input type="range" min={0} max={1} step={0.05} value={musicVol} onChange={(e) => setMusicVol(Number(e.target.value))} className="w-full" />
                    <label className="flex items-center justify-between text-white/80">
                        SFX
                        <input type="checkbox" checked={sfxOn} onChange={(e) => setSfxOn(e.target.checked)} />
                    </label>
                    <input type="range" min={0} max={1} step={0.05} value={sfxVol} onChange={(e) => setSfxVol(Number(e.target.value))} className="w-full" />
                    <label className="flex items-center justify-between text-white/80">
                        Always show hitbox
                        <input type="checkbox" checked={showHitbox} onChange={(e) => setShowHitbox(e.target.checked)} />
                    </label>
                </div>
                <div className="mt-5 flex flex-col gap-2">
                    <button type="button" onClick={onResume} className="rounded-lg bg-fuchsia-500/80 py-2 font-bold text-white hover:bg-fuchsia-500">
                        Resume
                    </button>
                    <button type="button" onClick={onQuit} className="rounded-lg border border-white/15 py-2 text-white/70 hover:bg-white/10">
                        Quit to Menu
                    </button>
                </div>
            </div>
        </div>
    );
}
