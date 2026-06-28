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
            <div className="dr-frame m-2 mb-6 rounded-sm p-4 backdrop-blur md:mx-16">
                <div className="dr-serif mb-1 text-sm font-semibold tracking-[0.1em]" style={{ color: accent }}>
                    {dialogue.speakerName}
                </div>
                <p className="dr-serif-body min-h-[3rem] text-sm leading-relaxed text-[color:var(--dr-cream)] md:text-base">{dialogue.text}</p>
                <div className="mt-2 flex items-center justify-between text-[11px] text-[color:var(--dr-cream-faint)]">
                    <span className="font-mono">
                        {dialogue.index + 1} / {dialogue.total}
                    </span>
                    <span className="animate-pulse text-[color:var(--dr-gold-soft)]">❖ tap / Z to continue</span>
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
                <div className="dr-serif text-3xl font-semibold tracking-[0.18em] text-[color:var(--dr-cream)] [text-shadow:0_2px_14px_rgba(0,0,0,0.95),0_0_22px_rgba(212,64,90,0.35)] md:text-5xl">
                    {banner.title}
                </div>
                <div className="mx-auto mt-2 h-px w-48 dr-rule" />
                <div className="dr-serif-body mt-2 text-lg italic tracking-[0.28em] text-[color:var(--dr-gold-soft)] md:text-2xl">{banner.subtitle}</div>
            </div>
        </div>
    );
}

export function PauseOverlay({ onResume, onQuit }: { onResume: () => void; onQuit: () => void }) {
    const { musicOn, sfxOn, setMusicOn, setSfxOn, musicVol, sfxVol, setMusicVol, setSfxVol, showHitbox, setShowHitbox } = useDreamRift();
    return (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="dr-frame w-72 rounded-sm p-6">
                <h2 className="dr-serif mb-1 text-center text-xl font-semibold tracking-[0.22em] text-[color:var(--dr-gold)]">PAUSED</h2>
                <div className="dr-rule mb-4 mt-2" />
                <div className="space-y-3 text-sm">
                    <label className="flex items-center justify-between text-[color:var(--dr-cream)]">
                        Music
                        <input type="checkbox" checked={musicOn} onChange={(e) => setMusicOn(e.target.checked)} className="accent-[color:var(--dr-crimson)]" />
                    </label>
                    <input type="range" min={0} max={1} step={0.05} value={musicVol} onChange={(e) => setMusicVol(Number(e.target.value))} className="w-full accent-[color:var(--dr-crimson)]" />
                    <label className="flex items-center justify-between text-[color:var(--dr-cream)]">
                        SFX
                        <input type="checkbox" checked={sfxOn} onChange={(e) => setSfxOn(e.target.checked)} className="accent-[color:var(--dr-crimson)]" />
                    </label>
                    <input type="range" min={0} max={1} step={0.05} value={sfxVol} onChange={(e) => setSfxVol(Number(e.target.value))} className="w-full accent-[color:var(--dr-crimson)]" />
                    <label className="flex items-center justify-between text-[color:var(--dr-cream)]">
                        Always show hitbox
                        <input type="checkbox" checked={showHitbox} onChange={(e) => setShowHitbox(e.target.checked)} className="accent-[color:var(--dr-crimson)]" />
                    </label>
                </div>
                <div className="mt-5 flex flex-col gap-2">
                    <button type="button" onClick={onResume} className="dr-plaque dr-plaque-primary rounded-sm py-2 text-sm font-semibold">
                        Resume
                    </button>
                    <button type="button" onClick={onQuit} className="dr-plaque rounded-sm py-2 text-sm font-semibold">
                        Quit to Menu
                    </button>
                </div>
            </div>
        </div>
    );
}
